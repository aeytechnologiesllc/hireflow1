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
}

const MAX_RECONNECT_ATTEMPTS = 3;
const STUCK_TIMEOUT_MS = 30000; // 30 seconds

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

  // Start processing timeout - detect when Ava is stuck
  const startProcessingTimeout = useCallback(() => {
    clearProcessingTimeout();
    
    processingTimeoutRef.current = window.setTimeout(() => {
      console.warn('Ava response timeout - stuck detected');
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
      console.log('Interview ended, not attempting reconnection');
      return;
    }
    
    const attempts = reconnectAttemptsRef.current;
    console.log(`Connection lost. Attempt ${attempts + 1}/${MAX_RECONNECT_ATTEMPTS}`);
    
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
      console.log('[AvaVoice] Stopping internal mic stream');
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
    
    console.log('Voice session response:', { 
      hasError: !!response.error, 
      hasData: !!response.data,
      dataError: response.data?.error,
      errorMessage: errorMessage,
      rawError: response.error?.message
    });
    
    if (response.error || !response.data?.client_secret?.value) {
      throw new Error(errorMessage || 'Failed to get voice session');
    }

    const EPHEMERAL_KEY = response.data.client_secret.value;
    const voiceNameUsed = (response.data as any)?.selectedVoice ?? null;

    setState(s => ({ ...s, voiceNameUsed }));
    console.log('[AvaVoice] Session created with voice:', voiceNameUsed);

    console.log('Got ephemeral key, creating peer connection');

    // Create audio context for playback
    audioContextRef.current = new AudioContext({ sampleRate: 24000 });
    audioQueueRef.current = new AudioQueue(
      audioContextRef.current,
      (playing) => {
        console.log('[AvaVoice] AudioQueue playing state:', playing);
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
      console.log('WebRTC connection state:', connectionState);
      
      if (connectionState === 'disconnected' || connectionState === 'failed') {
        console.warn('WebRTC connection lost:', connectionState);
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
      console.log('ICE connection state:', iceState);
      
      if (iceState === 'disconnected' || iceState === 'failed') {
        console.warn('ICE connection issue:', iceState);
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
      console.log('[AvaVoice] Using external mic stream for WebRTC (shared with video recorder)');
    } else {
      ms = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log('[AvaVoice] Created new mic stream for WebRTC');
    }
    micStreamRef.current = ms;
    
    const audioTrack = ms.getAudioTracks()[0];
    if (audioTrack) {
      pcRef.current.addTrack(audioTrack);
      console.log('[AvaVoice] Audio track added to peer connection', {
        label: audioTrack.label,
        enabled: audioTrack.enabled,
        readyState: audioTrack.readyState
      });
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
      console.warn('Data channel closed');
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
      console.log('Data channel opened');
      lastActivityRef.current = Date.now();
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
      
      // For interview mode, trigger AVA to start speaking first
      if (optionsRef.current.mode === 'interview') {
        setTimeout(() => {
          if (dcRef.current?.readyState === 'open') {
            console.log('Triggering AVA to start interview');
            dcRef.current.send(JSON.stringify({ type: 'response.create' }));
            startProcessingTimeout();
          }
        }, 500); // Small delay to ensure connection is stable
      }
    });

    dcRef.current.addEventListener('message', async (e) => {
      const event = JSON.parse(e.data);
      console.log('Received event:', event.type);
      lastActivityRef.current = Date.now();

      switch (event.type) {
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
          console.log('[AvaVoice] Audio delta received - setting isSpeaking=true, isProcessing=false');
          setState(s => {
            if (s.isProcessing || !s.isSpeaking) {
              console.log('[AvaVoice] State transition: isProcessing', s.isProcessing, '-> false, isSpeaking', s.isSpeaking, '-> true');
            }
            return { ...s, isSpeaking: true, isProcessing: false, isStuck: false };
          });
          break;

        case 'response.audio.done':
          // Short buffer for WebRTC audio playback to finish (snappier transitions)
          console.log('Audio done event received, setting isSpeaking false after buffer');
          setTimeout(() => {
            setState(s => ({ ...s, isSpeaking: false }));
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
              console.log('Tool call:', event.name, args);
              
              // For schedule_interview, inject Google Calendar tokens
              if (event.name === 'schedule_interview') {
                const googleAccessToken = localStorage.getItem("google_access_token");
                const googleRefreshToken = localStorage.getItem("google_refresh_token");
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
                  console.log('Interview ending, waiting for Ava to finish speaking...');
                  isInterviewEndedRef.current = true;
                  clearProcessingTimeout();
                  
                  // IMMEDIATELY signal that we're ending - show overlay to user
                  setState(s => ({ ...s, isEndingInterview: true }));
                  
                  // Wait for audio queue to finish playing before triggering end
                  const waitForAudioComplete = (): Promise<void> => {
                    return new Promise((resolve) => {
                      let checkCount = 0;
                      let emptyCount = 0; // Track consecutive empty checks
                      const maxChecks = 50; // 5 seconds max wait (reduced from 10)
                      
                      const checkInterval = setInterval(() => {
                        checkCount++;
                        const queueLength = audioQueueRef.current?.length || 0;
                        
                        console.log(`Waiting for audio... Queue=${queueLength}, Empty=${emptyCount}, Check=${checkCount}`);
                        
                        // Check if audio queue is empty
                        if (queueLength === 0) {
                          emptyCount++;
                          // After 3 consecutive empty checks (300ms), proceed
                          if (emptyCount >= 3) {
                            console.log('Audio queue empty for 300ms, proceeding');
                            clearInterval(checkInterval);
                            resolve();
                            return;
                          }
                        } else {
                          emptyCount = 0; // Reset if queue has items
                        }
                        
                        if (checkCount >= maxChecks) {
                          // Timeout after 5 seconds to prevent long wait
                          console.log('Audio wait timeout (5s), proceeding with interview end');
                          clearInterval(checkInterval);
                          resolve();
                        }
                      }, 100); // Check every 100ms
                    });
                  };
                  
                  // Wait for Ava to finish, then trigger end
                  waitForAudioComplete().then(() => {
                    console.log('Ava finished speaking, triggering interview end...');
                    optionsRef.current.onInterviewEnd?.(toolResult.evaluation);
                    
                    // Auto-disconnect after callback completes
                    setTimeout(() => {
                      console.log('Auto-disconnecting Ava after interview end...');
                      
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
                if (event.name === 'flag_inconsistency' && toolResult?.follow_up) {
                  console.log('Inconsistency flagged, follow-up:', toolResult.follow_up);
                }

                // Handle take_interview_note - just acknowledge
                if (event.name === 'take_interview_note') {
                  console.log('Interview note recorded');
                }

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
    const model = 'gpt-4o-realtime-preview-2024-12-17';
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
    console.log('WebRTC connection established');
  }, [handleConnectionLost, startConnectionQualityMonitoring, startProcessingTimeout, clearProcessingTimeout, toast, state.isConnected]);

  // Public connect function
  const connect = useCallback(async () => {
    try {
      isInterviewEndedRef.current = false;
      reconnectAttemptsRef.current = 0;
      await connectInternal();
    } catch (err) {
      console.error('Connection error:', err);
      const message = err instanceof Error ? err.message : 'Failed to connect';
      setState(s => ({ ...s, isConnecting: false, error: message }));
      toast({
        variant: 'destructive',
        title: 'Connection Failed',
        description: message,
      });
    }
  }, [connectInternal, toast]);

  const disconnect = useCallback(() => {
    clearProcessingTimeout();
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
    });
  }, [clearProcessingTimeout, cleanupConnection]);

  // Manual retry connection
  const retryConnection = useCallback(async () => {
    console.log('Manual retry connection requested');
    reconnectAttemptsRef.current = 0;
    isInterviewEndedRef.current = false;
    setState(s => ({ ...s, isStuck: false, error: null, reconnectAttempts: 0 }));
    
    cleanupConnection();
    await new Promise(resolve => setTimeout(resolve, 1000));
    await connect();
  }, [cleanupConnection, connect]);

  // Nudge Ava when she seems stuck
  const nudgeAva = useCallback(() => {
    if (!dcRef.current || dcRef.current.readyState !== 'open') {
      console.warn('Cannot nudge - data channel not ready');
      return;
    }
    
    console.log('Nudging Ava to continue...');
    
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

  const sendTextMessage = useCallback((text: string) => {
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

    optionsRef.current.onTranscript?.(text, 'user');
  }, [toast]);

  // Expose audio element for video recording mixing
  const getAvaAudioElement = useCallback(() => {
    return audioElRef.current;
  }, []);

  return {
    ...state,
    connect,
    disconnect,
    sendTextMessage,
    getAvaAudioElement,
    retryConnection,
    nudgeAva,
  };
}
