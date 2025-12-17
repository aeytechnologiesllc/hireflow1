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
  // Google Calendar integration
  googleCalendarConnected?: boolean;
  googleRefreshToken?: string;
  onTranscript?: (text: string, role: 'user' | 'assistant') => void;
  onToolCall?: (toolName: string, result: any) => void;
  onInterviewEnd?: (evaluation: any) => void;
}

interface AvaVoiceState {
  isConnected: boolean;
  isConnecting: boolean;
  isSpeaking: boolean;
  isListening: boolean;
  error: string | null;
  audioLevels: number[]; // 5 values for audio bars visualization
  connectionQuality: 'excellent' | 'good' | 'poor' | 'unknown';
}

export function useAvaVoice(options: UseAvaVoiceOptions) {
  const { toast } = useToast();
  const [state, setState] = useState<AvaVoiceState>({
    isConnected: false,
    isConnecting: false,
    isSpeaking: false,
    isListening: false,
    error: null,
    audioLevels: [8, 8, 8, 8, 8],
    connectionQuality: 'unknown',
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, []);

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

  const connect = useCallback(async () => {
    setState(s => ({ ...s, isConnecting: true, error: null }));

    try {
      // Request microphone permission
      await navigator.mediaDevices.getUserMedia({ audio: true });

      // Get session token from edge function
      const { data, error } = await supabase.functions.invoke('ava-voice-session', {
        body: {
          mode: options.mode,
          applicationId: options.applicationId,
          jobId: options.jobId,
          language: options.language || 'en',
          duration: options.duration || 10,
          // Pass user context for personalized responses
          subscriptionPlan: options.subscriptionPlan,
          subscriptionStatus: options.subscriptionStatus,
          countryCode: options.countryCode,
          voiceMinutesRemaining: options.voiceMinutesRemaining,
          isFirstUse: options.isFirstUse,
          // Google Calendar integration
          googleCalendarConnected: options.googleCalendarConnected,
          googleRefreshToken: options.googleRefreshToken,
        },
      });

      if (error || !data?.client_secret?.value) {
        throw new Error(data?.error || error?.message || 'Failed to get voice session');
      }

      const EPHEMERAL_KEY = data.client_secret.value;
      console.log('Got ephemeral key, creating peer connection');

      // Create audio context for playback
      audioContextRef.current = new AudioContext({ sampleRate: 24000 });
      audioQueueRef.current = new AudioQueue(
        audioContextRef.current,
        (playing) => setState(s => ({ ...s, isSpeaking: playing }))
      );

      // Create peer connection
      pcRef.current = new RTCPeerConnection();

      // Set up audio element for remote audio
      audioElRef.current = document.createElement('audio');
      audioElRef.current.autoplay = true;
      pcRef.current.ontrack = (e) => {
        if (audioElRef.current) {
          audioElRef.current.srcObject = e.streams[0];
        }
      };

      // Add local audio track
      const ms = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = ms;
      pcRef.current.addTrack(ms.getTracks()[0]);

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
      
      dcRef.current.addEventListener('open', () => {
        console.log('Data channel opened');
        setState(s => ({ ...s, isConnected: true, isConnecting: false, isListening: true, connectionQuality: 'excellent' }));
        
        // Start monitoring connection quality
        startConnectionQualityMonitoring();
        
        // For interview mode, trigger AVA to start speaking first
        if (options.mode === 'interview') {
          setTimeout(() => {
            if (dcRef.current?.readyState === 'open') {
              console.log('Triggering AVA to start interview');
              dcRef.current.send(JSON.stringify({ type: 'response.create' }));
            }
          }, 500); // Small delay to ensure connection is stable
        }
      });

      dcRef.current.addEventListener('message', async (e) => {
        const event = JSON.parse(e.data);
        console.log('Received event:', event.type);

        switch (event.type) {
          case 'response.audio.delta':
            // Handle audio chunk
            if (event.delta) {
              const binaryString = atob(event.delta);
              const bytes = new Uint8Array(binaryString.length);
              for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }
              audioQueueRef.current?.addToQueue(bytes);
            }
            setState(s => ({ ...s, isSpeaking: true }));
            break;

          case 'response.audio.done':
            setState(s => ({ ...s, isSpeaking: false }));
            break;

          case 'response.audio_transcript.delta':
            if (event.delta) {
              options.onTranscript?.(event.delta, 'assistant');
            }
            break;

          case 'conversation.item.input_audio_transcription.completed':
            if (event.transcript) {
              options.onTranscript?.(event.transcript, 'user');
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
                    applicationId: options.applicationId,
                  },
                });

                if (toolError) {
                  console.error('Tool call error:', toolError);
                } else {
                  options.onToolCall?.(event.name, toolResult);
                  
                  // Check for interview end
                  if (event.name === 'end_interview' && toolResult?.evaluation) {
                    options.onInterviewEnd?.(toolResult.evaluation);
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
            setState(s => ({ ...s, isListening: true }));
            break;

          case 'input_audio_buffer.speech_stopped':
            setState(s => ({ ...s, isListening: false }));
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
  }, [options, toast, startConnectionQualityMonitoring]);

  const disconnect = useCallback(() => {
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

    // Stop mic stream
    micStreamRef.current?.getTracks().forEach(track => track.stop());
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

    setState({
      isConnected: false,
      isConnecting: false,
      isSpeaking: false,
      isListening: false,
      error: null,
      audioLevels: [8, 8, 8, 8, 8],
      connectionQuality: 'unknown',
    });
  }, []);

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

    options.onTranscript?.(text, 'user');
  }, [options, toast]);

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
  };
}
