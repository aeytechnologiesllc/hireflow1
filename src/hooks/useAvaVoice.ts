import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AudioRecorder, encodeAudioForAPI, AudioQueue, createWavFromPCM, resetAudioQueue } from '@/utils/RealtimeAudio';
import { useToast } from '@/hooks/use-toast';

interface UseAvaVoiceOptions {
  mode: 'assistant' | 'interview';
  applicationId?: string;
  jobId?: string;
  language?: string;
  duration?: number; // Interview duration in minutes (default 10)
  // User context for personalized AVA responses
  subscriptionPlan?: string;
  subscriptionStatus?: string;
  countryCode?: string;
  voiceMinutesRemaining?: number;
  isFirstUse?: boolean;
  // Current route for context-aware responses
  currentRoute?: string;
  // Google Calendar integration
  googleCalendarConnected?: boolean;
  googleRefreshToken?: string;
  // External mic stream - when provided, use this instead of creating a new one
  // This is critical for video recording to capture candidate audio
  externalMicStream?: MediaStream | null;
  onTranscript?: (text: string, role: 'user' | 'assistant') => void;
  onToolCall?: (toolName: string, result: any) => void;
  onInterviewEnd?: (evaluation: any) => void;
}

interface AvaVoiceState {
  isConnected: boolean;
  isConnecting: boolean;
  isSpeaking: boolean;
  isListening: boolean;
  isProcessing: boolean; // True when waiting for AVA's response after user stops speaking
  isStuck: boolean; // True when Ava hasn't responded for too long
  isEndingInterview: boolean; // True when end_interview is called, before audio finishes
  reconnectAttempts: number; // Track reconnection attempts
  error: string | null;
  audioLevels: number[]; // 5 values for audio bars visualization
  connectionQuality: 'excellent' | 'good' | 'poor' | 'unknown';
  voiceNameUsed: string | null; // Voice returned by backend session creation
  hasReceivedFirstAudio: boolean; // True when first audio delta is received - used for loading state
}

const MAX_RECONNECT_ATTEMPTS = 3;
const STUCK_TIMEOUT_MS = 45000; // 45 seconds - give Ava more time to respond
const SILENCE_CHECK_INTERVAL_MS = 1000; // Check silence every second
const SILENCE_NUDGE_THRESHOLD_S = 20; // Nudge Ava after 20 seconds of candidate silence (increased from 10)

export function useAvaVoice(options: UseAvaVoiceOptions) {
  const { toast } = useToast();
  const [state, setState] = useState<AvaVoiceState>({
    isConnected: false,
    isConnecting: false,
    isSpeaking: false,
    isListening: false,
    isProcessing: false,
    isStuck: false,
    isEndingInterview: false,
    reconnectAttempts: 0,
    error: null,
    audioLevels: [8, 8, 8, 8, 8],
    connectionQuality: 'unknown',
    voiceNameUsed: null,
    hasReceivedFirstAudio: false,
  });

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const recorderRef = useRef<AudioRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<AudioQueue | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const connectionQualityIntervalRef = useRef<number | null>(null);
  
  // New refs for stuck detection and reconnection
  const processingTimeoutRef = useRef<number | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const reconnectAttemptsRef = useRef(0);
  const isInterviewEndedRef = useRef(false);
  const optionsRef = useRef(options);
  
  // Session duration tracking for voice minute deduction
  const sessionStartTimeRef = useRef<number | null>(null);
  
  // Silence detection refs - track when candidate goes silent after Ava speaks
  const silenceTimerRef = useRef<number | null>(null);
  const candidateSilenceStartRef = useRef<number | null>(null);
  const silenceNudgeCountRef = useRef(0); // Track how many times we've nudged
  
  // Track when Ava is actively generating a response (between response.created and response.done)
  // This prevents silence detection from triggering while Ava is still speaking
  const isResponseActiveRef = useRef(false);

  // Keep options ref updated
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearProcessingTimeout();
      disconnect();
    };
  }, []);

  // Clear processing timeout helper
  const clearProcessingTimeout = useCallback(() => {
    if (processingTimeoutRef.current) {
      clearTimeout(processingTimeoutRef.current);
      processingTimeoutRef.current = null;
    }
    setState(s => ({ ...s, isStuck: false }));
  }, []);

  // Clear silence timer helper
  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearInterval(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    candidateSilenceStartRef.current = null;
  }, []);

  // Start silence detection - called when Ava finishes speaking (response.done, NOT response.audio.done)
  const startSilenceDetection = useCallback(() => {
    // Only for interview mode
    if (optionsRef.current.mode !== 'interview') return;
    if (isInterviewEndedRef.current) return;
    
    // CRITICAL: Don't start silence detection if Ava is still generating a response
    if (isResponseActiveRef.current) {
      return;
    }
    
    clearSilenceTimer();
    candidateSilenceStartRef.current = Date.now();

    silenceTimerRef.current = window.setInterval(() => {
      if (!candidateSilenceStartRef.current || isInterviewEndedRef.current) {
        clearSilenceTimer();
        return;
      }
      
      // CRITICAL: Don't nudge if Ava is currently generating/speaking
      if (isResponseActiveRef.current) {
        return;
      }
      
      const silenceSeconds = Math.floor((Date.now() - candidateSilenceStartRef.current) / 1000);
      
      // After threshold, send a nudge message to Ava
      if (silenceSeconds >= SILENCE_NUDGE_THRESHOLD_S && silenceNudgeCountRef.current < 3) {
        silenceNudgeCountRef.current += 1;

        // Reset silence start to avoid repeated nudges too quickly
        candidateSilenceStartRef.current = Date.now();
        
        // Send contextual update to Ava about silence
        if (dcRef.current?.readyState === 'open') {
          const nudgeMessages = [
            "The candidate has been silent for a while. Check if they're still there with a friendly prompt.",
            "Extended silence from the candidate. Gently ask if they heard the question or need a moment.",
            "The candidate seems to have gone quiet. This might be your last check-in before noting a connection issue."
          ];
          const message = nudgeMessages[Math.min(silenceNudgeCountRef.current - 1, nudgeMessages.length - 1)];
          
          dcRef.current.send(JSON.stringify({
            type: 'conversation.item.create',
            item: {
              type: 'message',
              role: 'user',
              content: [{ type: 'input_text', text: `[SYSTEM: ${message}]` }]
            }
          }));
          dcRef.current.send(JSON.stringify({ type: 'response.create' }));
        }
      }
    }, SILENCE_CHECK_INTERVAL_MS);
  }, [clearSilenceTimer]);

  // Start processing timeout - detect when Ava is stuck
  const startProcessingTimeout = useCallback(() => {
    clearProcessingTimeout();
    
    processingTimeoutRef.current = window.setTimeout(() => {
      setState(s => ({ ...s, isStuck: true }));
      toast({
        variant: 'destructive',
        title: 'Ava is taking too long',
        description: 'The connection may be experiencing issues. You can try to prompt Ava or reconnect.',
      });
    }, STUCK_TIMEOUT_MS);
  }, [clearProcessingTimeout, toast]);

  // Monitor connection quality periodically
  const startConnectionQualityMonitoring = useCallback(() => {
    if (connectionQualityIntervalRef.current) {
      clearInterval(connectionQualityIntervalRef.current);
    }

    connectionQualityIntervalRef.current = window.setInterval(async () => {
      if (!pcRef.current || pcRef.current.connectionState !== 'connected') return;

      try {
        const stats = await pcRef.current.getStats();
        let quality: 'excellent' | 'good' | 'poor' = 'excellent';

        stats.forEach((report) => {
          if (report.type === 'candidate-pair' && report.state === 'succeeded') {
            const rtt = report.currentRoundTripTime * 1000; // Convert to ms
            if (rtt > 300) {
              quality = 'poor';
            } else if (rtt > 150) {
              quality = 'good';
            }
          }
        });

        setState(s => ({ ...s, connectionQuality: quality }));
      } catch (err) {
        console.error('Error checking connection quality:', err);
      }
    }, 3000); // Check every 3 seconds
  }, []);

  // Handle connection lost - attempt auto-reconnect
  const handleConnectionLost = useCallback(async () => {
    // Don't attempt reconnect if interview already ended
    if (isInterviewEndedRef.current) {
      return;
    }

    const attempts = reconnectAttemptsRef.current;
    
    if (attempts < MAX_RECONNECT_ATTEMPTS) {
      reconnectAttemptsRef.current += 1;
      
      setState(s => ({ 
        ...s, 
        isConnected: false, 
        isConnecting: true,
        reconnectAttempts: reconnectAttemptsRef.current,
        error: `Connection lost. Reconnecting (attempt ${attempts + 1}/${MAX_RECONNECT_ATTEMPTS})...`
      }));
      
      toast({
        title: 'Connection Lost',
        description: `Attempting to reconnect... (${attempts + 1}/${MAX_RECONNECT_ATTEMPTS})`,
      });
      
      // Clean up existing connection without resetting the state fully
      cleanupConnection();
      
      // Wait before reconnecting
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Attempt reconnection
      try {
        await connectInternal();
        reconnectAttemptsRef.current = 0;
        setState(s => ({ ...s, reconnectAttempts: 0, error: null }));
        toast({
          title: 'Reconnected',
          description: 'Voice connection restored.',
        });
      } catch (err) {
        console.error('Reconnection failed:', err);
        // Try again if under max attempts
        handleConnectionLost();
      }
    } else {
      // Max attempts reached
      setState(s => ({ 
        ...s, 
        isConnected: false, 
        isConnecting: false,
        error: 'Connection lost. Please click "Retry Connection" to continue.'
      }));
      
      toast({
        variant: 'destructive',
        title: 'Connection Failed',
        description: 'Unable to reconnect automatically. Please try manually.',
      });
    }
  }, [toast]);

  // Cleanup connection resources without full state reset
  const cleanupConnection = useCallback(() => {
    // Stop connection quality monitoring
    if (connectionQualityIntervalRef.current) {
      clearInterval(connectionQualityIntervalRef.current);
      connectionQualityIntervalRef.current = null;
    }

    // Stop animation frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    // Stop analyser
    analyserRef.current = null;

    // IMPORTANT: Only stop mic stream if we created it (not external)
    // If externalMicStream was provided, the video recorder owns that stream
    if (micStreamRef.current && !optionsRef.current.externalMicStream) {
      micStreamRef.current.getTracks().forEach(track => track.stop());
    }
    micStreamRef.current = null;

    recorderRef.current?.stop();
    recorderRef.current = null;

    dcRef.current?.close();
    dcRef.current = null;

    pcRef.current?.close();
    pcRef.current = null;

    audioElRef.current = null;
    audioQueueRef.current?.clear();
    audioQueueRef.current = null;

    audioContextRef.current?.close();
    audioContextRef.current = null;

    resetAudioQueue();
  }, []);

  // Internal connect function used by both initial connect and reconnect
  const connectInternal = useCallback(async () => {
    setState(s => ({ ...s, isConnecting: true, error: null }));

    // Check if we have an external mic stream to use
    const externalStream = optionsRef.current.externalMicStream;
    if (!externalStream) {
      // Request microphone permission only if no external stream
      await navigator.mediaDevices.getUserMedia({ audio: true });
    }

    // Get session token from edge function
    const response = await supabase.functions.invoke('ava-voice-session', {
      body: {
        mode: optionsRef.current.mode,
        applicationId: optionsRef.current.applicationId,
        jobId: optionsRef.current.jobId,
        language: optionsRef.current.language || 'en',
        duration: optionsRef.current.duration || 10,
        // Pass user context for personalized responses
        subscriptionPlan: optionsRef.current.subscriptionPlan,
        subscriptionStatus: optionsRef.current.subscriptionStatus,
        countryCode: optionsRef.current.countryCode,
        voiceMinutesRemaining: optionsRef.current.voiceMinutesRemaining,
        isFirstUse: optionsRef.current.isFirstUse,
        // Current route for context-aware responses
        currentRoute: optionsRef.current.currentRoute,
        // Google Calendar integration
        googleCalendarConnected: optionsRef.current.googleCalendarConnected,
        googleRefreshToken: optionsRef.current.googleRefreshToken,
      },
    });

    // Handle edge function errors - extract the message from the response
    // When edge function returns non-2xx, error contains FunctionsHttpError
    // The actual error message could be in data.error (parsed JSON body) or error.message
    let errorMessage = response.data?.error || response.error?.message || '';
    
    // Try to extract from FunctionsHttpError context if present
    if (response.error && !errorMessage) {
      try {
        // FunctionsHttpError may contain the response body
        const errorContext = (response.error as any).context;
        if (errorContext?.body) {
          const parsed = JSON.parse(errorContext.body);
          errorMessage = parsed.error || '';
        }
      } catch (e) {
        // Ignore parsing errors
      }
    }
    
    if (response.error || !response.data?.client_secret?.value) {
      throw new Error(errorMessage || 'Failed to get voice session');
    }

    const EPHEMERAL_KEY = response.data.client_secret.value;
    const voiceNameUsed = (response.data as any)?.selectedVoice ?? null;
    const realtimeModel = (response.data as any)?.selectedModel || 'gpt-realtime';

    setState(s => ({ ...s, voiceNameUsed }));

    // Create audio context for playback
    audioContextRef.current = new AudioContext({ sampleRate: 24000 });
    audioQueueRef.current = new AudioQueue(
      audioContextRef.current,
      (playing) => {
        // CRITICAL: When audio starts playing, clear isProcessing to show "Speaking" not "Thinking"
        setState(s => ({ 
          ...s, 
          isSpeaking: playing,
          isProcessing: playing ? false : s.isProcessing // Only clear processing when starting to speak
        }));
      }
    );

    // Create peer connection
    pcRef.current = new RTCPeerConnection();

    // Monitor WebRTC connection state
    pcRef.current.onconnectionstatechange = () => {
      const connectionState = pcRef.current?.connectionState;

      if (connectionState === 'disconnected' || connectionState === 'failed') {
        if (!isInterviewEndedRef.current) {
          handleConnectionLost();
        }
      } else if (connectionState === 'connected') {
        reconnectAttemptsRef.current = 0;
        setState(s => ({ ...s, reconnectAttempts: 0 }));
      }
    };

    // Monitor ICE connection state
    pcRef.current.oniceconnectionstatechange = () => {
      const iceState = pcRef.current?.iceConnectionState;

      if (iceState === 'disconnected' || iceState === 'failed') {
        if (!isInterviewEndedRef.current) {
          handleConnectionLost();
        }
      }
    };

    // Set up audio element for remote audio
    audioElRef.current = document.createElement('audio');
    audioElRef.current.autoplay = true;
    pcRef.current.ontrack = (e) => {
      if (audioElRef.current) {
        audioElRef.current.srcObject = e.streams[0];
      }
    };

    // Add local audio track - use external stream if provided (critical for video recording)
    let ms: MediaStream;
    if (optionsRef.current.externalMicStream) {
      ms = optionsRef.current.externalMicStream;
    } else {
      ms = await navigator.mediaDevices.getUserMedia({ audio: true });
    }
    micStreamRef.current = ms;
    
    const audioTrack = ms.getAudioTracks()[0];
    if (audioTrack) {
      pcRef.current.addTrack(audioTrack);
    } else {
      console.error('[AvaVoice] No audio track found on mic stream!');
    }

    // Set up audio analyser for real-time voice visualization
    const analyserContext = new AudioContext();
    analyserRef.current = analyserContext.createAnalyser();
    analyserRef.current.fftSize = 32;
    const micSource = analyserContext.createMediaStreamSource(ms);
    micSource.connect(analyserRef.current);

    // Start animation loop for audio levels
    const updateAudioLevels = () => {
      if (!analyserRef.current) return;
      
      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
      analyserRef.current.getByteFrequencyData(dataArray);
      
      // Extract 5 bands and normalize to 8-32 pixel range
      const bands = [0, 2, 4, 6, 8];
      const levels = bands.map(i => {
        const value = dataArray[i] || 0;
        return Math.max(8, Math.min(32, 8 + (value / 255) * 24));
      });
      
      setState(s => ({ ...s, audioLevels: levels }));
      animationFrameRef.current = requestAnimationFrame(updateAudioLevels);
    };
    updateAudioLevels();

    // Set up data channel for events
    dcRef.current = pcRef.current.createDataChannel('oai-events');
    
    // Monitor data channel health
    dcRef.current.addEventListener('close', () => {
      if (state.isConnected && !isInterviewEndedRef.current) {
        handleConnectionLost();
      }
    });

    dcRef.current.addEventListener('error', (e) => {
      console.error('Data channel error:', e);
      toast({
        variant: 'destructive',
        title: 'Connection Error',
        description: 'Voice connection experienced an error.',
      });
      if (!isInterviewEndedRef.current) {
        handleConnectionLost();
      }
    });

    dcRef.current.addEventListener('open', () => {
      lastActivityRef.current = Date.now();

      // Start session timer for voice minute tracking
      sessionStartTimeRef.current = Date.now();
      
      setState(s => ({ 
        ...s, 
        isConnected: true, 
        isConnecting: false, 
        isListening: true, 
        connectionQuality: 'excellent',
        isStuck: false,
        error: null 
      }));
      
      // Start monitoring connection quality
      startConnectionQualityMonitoring();
      
      // Trigger AVA to start speaking first (both interview and assistant mode)
      // In assistant mode, she'll greet contextually based on current page
      // Use 1.5s delay for better audio stability and synchronization
      setTimeout(() => {
        if (dcRef.current?.readyState === 'open') {
          dcRef.current.send(JSON.stringify({ type: 'response.create' }));
          // Don't start processing timeout immediately - wait for first audio
          // This prevents premature "taking too long" alerts on connection
        }
      }, 1500); // Increased delay from 500ms to 1.5s for connection stability
    });

    dcRef.current.addEventListener('message', async (e) => {
      const event = JSON.parse(e.data);
      lastActivityRef.current = Date.now();

      switch (event.type) {
        case 'response.created':
          // Response generation started - mark as active to prevent silence detection
          isResponseActiveRef.current = true;
          clearSilenceTimer(); // Don't check for silence while Ava is generating
          break;
          
        case 'response.done':
          // Full response complete - now safe to start silence detection
          isResponseActiveRef.current = false;
          // Small delay to ensure audio playback has finished
          setTimeout(() => {
            if (!isInterviewEndedRef.current) {
              startSilenceDetection();
            }
          }, 500);
          break;
          
        case 'response.audio.delta':
          // Clear stuck timeout - Ava is responding
          clearProcessingTimeout();
          
          // Handle audio chunk
          if (event.delta) {
            const binaryString = atob(event.delta);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            audioQueueRef.current?.addToQueue(bytes);
          }
          // CRITICAL: Set isSpeaking TRUE and isProcessing FALSE immediately when first audio delta arrives
          // This ensures the UI shows "Speaking" not "Thinking"
          // Also mark hasReceivedFirstAudio so the loading overlay can hide
          setState(s => ({ ...s, isSpeaking: true, isProcessing: false, isStuck: false, hasReceivedFirstAudio: true }));
          break;

        case 'response.audio.done':
          // Audio chunk done - but DON'T start silence detection here!
          // Wait for response.done which fires after the complete response
          setTimeout(() => {
            setState(s => ({ ...s, isSpeaking: false }));
            // NOTE: Silence detection is NOT started here anymore - moved to response.done
          }, 300);
          break;

        case 'response.audio_transcript.delta':
          if (event.delta) {
            optionsRef.current.onTranscript?.(event.delta, 'assistant');
          }
          break;

        case 'conversation.item.input_audio_transcription.completed':
          if (event.transcript) {
            optionsRef.current.onTranscript?.(event.transcript, 'user');
          }
          break;

        case 'response.function_call_arguments.done':
          // Handle tool call
          if (event.name && event.arguments) {
            try {
              const args = JSON.parse(event.arguments);
              
              // For schedule_interview, inject Google Calendar tokens
              if (event.name === 'schedule_interview') {
                const googleAccessToken = sessionStorage.getItem("google_access_token");
                const googleRefreshToken = sessionStorage.getItem("google_refresh_token");
                if (googleRefreshToken) {
                  args.google_refresh_token = googleRefreshToken;
                  args.google_access_token = googleAccessToken;
                }
              }
              
              // Execute tool call via edge function
              const { data: toolResult, error: toolError } = await supabase.functions.invoke('ava-voice-tools', {
                body: {
                  tool_name: event.name,
                  parameters: args,
                  applicationId: optionsRef.current.applicationId,
                  currentRoute: optionsRef.current.currentRoute,
                },
              });

              if (toolError) {
                console.error('Tool call error:', toolError);
              } else {
                optionsRef.current.onToolCall?.(event.name, toolResult);
                
                // Check for interview end
                if (event.name === 'end_interview' && toolResult?.evaluation) {
                  isInterviewEndedRef.current = true;
                  clearProcessingTimeout();
                  clearSilenceTimer(); // Stop all silence detection immediately
                  
                  // IMMEDIATELY stop listening to prevent any more user input
                  isResponseActiveRef.current = true; // Prevent any silence nudges
                  
                  // IMMEDIATELY signal that we're ending - show overlay to user
                  setState(s => ({ ...s, isEndingInterview: true, isListening: false }));
                  
                  // CRITICAL: Deduct voice minutes NOW before cleanup
                  // This ensures minutes are deducted even if user navigates away
                  if (sessionStartTimeRef.current) {
                    const sessionDurationMs = Date.now() - sessionStartTimeRef.current;
                    const sessionDurationMinutes = Math.ceil(sessionDurationMs / 60000);
                    
                    if (sessionDurationMs >= 5000) {
                      // Fire and forget - don't block interview end on deduction
                      supabase.functions.invoke('deduct-voice-minutes', {
                        body: { 
                          sessionDurationMinutes,
                          applicationId: optionsRef.current.applicationId 
                        }
                      }).then(({ data, error }) => {
                        if (error) {
                          console.error('[AvaVoice] Failed to deduct voice minutes on end_interview:', error);
                        }
                      });
                    }
                    
                    // Clear so disconnect() doesn't double-deduct
                    sessionStartTimeRef.current = null;
                  }
                  
                  // Wait for audio queue to finish playing before triggering end
                  const waitForAudioComplete = (): Promise<void> => {
                    return new Promise((resolve) => {
                      let checkCount = 0;
                      let emptyCount = 0; // Track consecutive empty checks
                      const maxChecks = 50; // 5 seconds max wait (reduced from 10)
                      
                      const checkInterval = setInterval(() => {
                        checkCount++;
                        const queueLength = audioQueueRef.current?.length || 0;
                        
                        // Check if audio queue is empty
                        if (queueLength === 0) {
                          emptyCount++;
                          // After 3 consecutive empty checks (300ms), proceed
                          if (emptyCount >= 3) {
                            clearInterval(checkInterval);
                            resolve();
                            return;
                          }
                        } else {
                          emptyCount = 0; // Reset if queue has items
                        }
                        
                        if (checkCount >= maxChecks) {
                          clearInterval(checkInterval);
                          resolve();
                        }
                      }, 100); // Check every 100ms
                    });
                  };
                  
                  // Wait for Ava to finish, then trigger end
                  waitForAudioComplete().then(() => {
                    optionsRef.current.onInterviewEnd?.(toolResult.evaluation);
                    
                    // Auto-disconnect after callback completes
                    setTimeout(() => {
                      // Close data channel
                      dcRef.current?.close();
                      dcRef.current = null;
                      
                      // Close peer connection
                      pcRef.current?.close();
                      pcRef.current = null;
                      
                      // Stop mic stream only if internal
                      if (micStreamRef.current && !optionsRef.current.externalMicStream) {
                        micStreamRef.current.getTracks().forEach(track => track.stop());
                      }
                      micStreamRef.current = null;
                      
                      // Clean up audio
                      audioElRef.current = null;
                      audioQueueRef.current?.clear();
                      
                      // Stop monitoring
                      if (connectionQualityIntervalRef.current) {
                        clearInterval(connectionQualityIntervalRef.current);
                        connectionQualityIntervalRef.current = null;
                      }
                      if (animationFrameRef.current) {
                        cancelAnimationFrame(animationFrameRef.current);
                        animationFrameRef.current = null;
                      }
                      
                      // Update state to disconnected
                      setState(s => ({
                        ...s,
                        isConnected: false,
                        isSpeaking: false,
                        isListening: false,
                        isProcessing: false,
                        isEndingInterview: false,
                      }));
                    }, 100);
                  });
                }

                // Handle flag_inconsistency - Ava may want to ask a follow-up
                // Send tool result back to model
                if (dcRef.current?.readyState === 'open') {
                  dcRef.current.send(JSON.stringify({
                    type: 'conversation.item.create',
                    item: {
                      type: 'function_call_output',
                      call_id: event.call_id,
                      output: JSON.stringify(toolResult),
                    }
                  }));
                  dcRef.current.send(JSON.stringify({ type: 'response.create' }));
                }
              }
            } catch (err) {
              console.error('Tool call parse error:', err);
            }
          }
          break;

        case 'input_audio_buffer.speech_started':
          clearProcessingTimeout();
          clearSilenceTimer(); // User is speaking, reset silence detection
          silenceNudgeCountRef.current = 0; // Reset nudge count when user speaks
          setState(s => ({ ...s, isListening: true, isProcessing: false, isStuck: false }));
          break;

        case 'input_audio_buffer.speech_stopped':
          setState(s => ({ ...s, isListening: false, isProcessing: true }));
          startProcessingTimeout();
          break;

        case 'error':
          console.error('Realtime API error:', event);
          toast({
            variant: 'destructive',
            title: 'Voice Error',
            description: event.error?.message || 'An error occurred',
          });
          break;
      }
    });

    // Create and set local description
    const offer = await pcRef.current.createOffer();
    await pcRef.current.setLocalDescription(offer);

    // Connect to OpenAI's Realtime API
    const baseUrl = 'https://api.openai.com/v1/realtime';
    const model = realtimeModel;
    const sdpResponse = await fetch(`${baseUrl}?model=${model}`, {
      method: 'POST',
      body: offer.sdp,
      headers: {
        Authorization: `Bearer ${EPHEMERAL_KEY}`,
        'Content-Type': 'application/sdp',
      },
    });

    if (!sdpResponse.ok) {
      throw new Error('Failed to connect to OpenAI Realtime API');
    }

    const answer = {
      type: 'answer' as RTCSdpType,
      sdp: await sdpResponse.text(),
    };

    await pcRef.current.setRemoteDescription(answer);
  }, [handleConnectionLost, startConnectionQualityMonitoring, startProcessingTimeout, clearProcessingTimeout, toast, state.isConnected]);

  // Public connect function
  const connect = useCallback(async () => {
    try {
      isInterviewEndedRef.current = false;
      reconnectAttemptsRef.current = 0;
      await connectInternal();
    } catch (err) {
      console.error('Connection error:', err);
      const rawMessage = err instanceof Error ? err.message : 'Failed to connect';
      
      // Check if this is a billing/subscription-related error that shouldn't be shown to candidates
      const isBillingError = rawMessage.toLowerCase().includes('minutes exhausted') || 
                             rawMessage.toLowerCase().includes('voice credits') ||
                             rawMessage.toLowerCase().includes('trial') ||
                             rawMessage.toLowerCase().includes('subscription');

      // For interview mode, use generic message for billing errors (candidate-facing)
      const displayMessage = optionsRef.current.mode === 'interview' && isBillingError
        ? 'We are unable to start the interview at this time. Please contact the employer for assistance.'
        : rawMessage;
      
      setState(s => ({ ...s, isConnecting: false, error: displayMessage }));
      toast({
        variant: 'destructive',
        title: 'Connection Failed',
        description: displayMessage,
      });
    }
  }, [connectInternal, toast]);

  const disconnect = useCallback(async () => {
    // Deduct voice minutes if session was started (and not already deducted by end_interview)
    if (sessionStartTimeRef.current) {
      const sessionDurationMs = Date.now() - sessionStartTimeRef.current;
      const sessionDurationMinutes = Math.ceil(sessionDurationMs / 60000); // Round up to nearest minute
      
      // Only deduct if session was at least 5 seconds (avoid connection test deductions)
      if (sessionDurationMs >= 5000) {
        try {
          // Pass applicationId if in interview mode so we deduct from employer
          const { data, error } = await supabase.functions.invoke('deduct-voice-minutes', {
            body: { 
              sessionDurationMinutes,
              applicationId: optionsRef.current.applicationId // undefined in assistant mode
            }
          });
          
          if (error) {
            console.error('[AvaVoice] Failed to deduct voice minutes:', error);
          }
        } catch (err) {
          console.error('[AvaVoice] Error calling deduct-voice-minutes:', err);
        }
      }
      
      sessionStartTimeRef.current = null;
    }
    
    clearProcessingTimeout();
    clearSilenceTimer(); // Stop silence detection on disconnect
    isResponseActiveRef.current = false; // Reset response tracking
    cleanupConnection();

    setState({
      isConnected: false,
      isConnecting: false,
      isSpeaking: false,
      isListening: false,
      isProcessing: false,
      isStuck: false,
      isEndingInterview: false,
      reconnectAttempts: 0,
      error: null,
      audioLevels: [8, 8, 8, 8, 8],
      connectionQuality: 'unknown',
      voiceNameUsed: null,
      hasReceivedFirstAudio: false,
    });
  }, [clearProcessingTimeout, clearSilenceTimer, cleanupConnection]);

  // Manual retry connection
  const retryConnection = useCallback(async () => {
    reconnectAttemptsRef.current = 0;
    isInterviewEndedRef.current = false;
    isResponseActiveRef.current = false;
    silenceNudgeCountRef.current = 0;
    setState(s => ({ ...s, isStuck: false, error: null, reconnectAttempts: 0 }));
    
    clearSilenceTimer();
    cleanupConnection();
    await new Promise(resolve => setTimeout(resolve, 1000));
    await connect();
  }, [cleanupConnection, clearSilenceTimer, connect]);

  // Nudge Ava when she seems stuck
  const nudgeAva = useCallback(() => {
    if (!dcRef.current || dcRef.current.readyState !== 'open') {
      return;
    }

    // Send a response.create to prompt Ava
    dcRef.current.send(JSON.stringify({ type: 'response.create' }));
    
    setState(s => ({ ...s, isStuck: false }));
    clearProcessingTimeout();
    startProcessingTimeout();
    
    toast({
      title: 'Prompting Ava',
      description: 'Asking Ava to continue...',
    });
  }, [clearProcessingTimeout, startProcessingTimeout, toast]);

  const sendRealtimeInstruction = useCallback((text: string, echoInTranscript: boolean) => {
    if (!dcRef.current || dcRef.current.readyState !== 'open') {
      toast({
        variant: 'destructive',
        title: 'Not Connected',
        description: 'Please connect to AVA first',
      });
      return;
    }

    dcRef.current.send(JSON.stringify({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text }],
      },
    }));
    dcRef.current.send(JSON.stringify({ type: 'response.create' }));

    if (echoInTranscript) {
      optionsRef.current.onTranscript?.(text, 'user');
    }
  }, [toast]);

  const sendTextMessage = useCallback((text: string) => {
    sendRealtimeInstruction(text, true);
  }, [sendRealtimeInstruction]);

  const sendSystemInstruction = useCallback((text: string) => {
    sendRealtimeInstruction(`[SYSTEM: ${text}]`, false);
  }, [sendRealtimeInstruction]);

  // Expose audio element for video recording mixing
  const getAvaAudioElement = useCallback(() => {
    return audioElRef.current;
  }, []);

  return {
    ...state,
    connect,
    disconnect,
    sendTextMessage,
    sendSystemInstruction,
    getAvaAudioElement,
    retryConnection,
    nudgeAva,
  };
}
