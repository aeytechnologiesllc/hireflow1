import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface UseVideoInterviewRecorderOptions {
  applicationId: string;
  audioOnly?: boolean;
}

interface VideoRecorderState {
  hasCamera: boolean;
  hasMicrophone: boolean;
  isPermissionGranted: boolean;
  isRecording: boolean;
  isUploading: boolean;
  uploadProgress: number;
  error: string | null;
  recordingUrl: string | null;
  micLevels: number[];
  isAudioOnly: boolean;
}

export function useVideoInterviewRecorder({ applicationId, audioOnly = false }: UseVideoInterviewRecorderOptions) {
  const [state, setState] = useState<VideoRecorderState>({
    hasCamera: false,
    hasMicrophone: false,
    isPermissionGranted: false,
    isRecording: false,
    isUploading: false,
    uploadProgress: 0,
    error: null,
    recordingUrl: null,
    micLevels: [0, 0, 0, 0, 0],
    isAudioOnly: audioOnly,
  });

  // Refs for media streams and recording
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const combinedStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  
  // Refs for mic level monitoring
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const micMonitorContextRef = useRef<AudioContext | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Update isAudioOnly if prop changes
  useEffect(() => {
    setState(s => ({ ...s, isAudioOnly: audioOnly }));
  }, [audioOnly]);

  // Start monitoring microphone levels (defined first to avoid hoisting issues)
  const startMicMonitoring = useCallback((stream: MediaStream) => {
    try {
      micMonitorContextRef.current = new AudioContext();
      const ctx = micMonitorContextRef.current;
      
      const source = ctx.createMediaStreamSource(stream);
      micAnalyserRef.current = ctx.createAnalyser();
      micAnalyserRef.current.fftSize = 32;
      micAnalyserRef.current.smoothingTimeConstant = 0.5;
      source.connect(micAnalyserRef.current);
      
      const dataArray = new Uint8Array(micAnalyserRef.current.frequencyBinCount);
      
      const updateLevels = () => {
        if (!micAnalyserRef.current) return;
        
        micAnalyserRef.current.getByteFrequencyData(dataArray);
        
        // Get 5 levels from frequency data
        const step = Math.floor(dataArray.length / 5);
        const levels = [0, 1, 2, 3, 4].map(i => {
          const value = dataArray[i * step] || 0;
          return Math.min(100, (value / 255) * 100);
        });
        
        setState(s => ({ ...s, micLevels: levels }));
        animationFrameRef.current = requestAnimationFrame(updateLevels);
      };
      
      updateLevels();
    } catch (err) {
      console.error('Error starting mic monitoring:', err);
    }
  }, []);

  // Request camera and microphone permissions, return preview stream
  const requestPermissions = useCallback(async (): Promise<MediaStream | null> => {
    // Read from state to get current value
    const isAudioOnlyMode = state.isAudioOnly;
    
    try {
      // Request camera + mic (or just mic for audio-only)
      const constraints: MediaStreamConstraints = isAudioOnlyMode 
        ? {
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
          }
        : {
            video: {
              width: { ideal: 1280 },
              height: { ideal: 720 },
              facingMode: 'user',
            },
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
          };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      cameraStreamRef.current = stream;

      setState(s => ({
        ...s,
        hasCamera: !isAudioOnlyMode && stream.getVideoTracks().length > 0,
        hasMicrophone: stream.getAudioTracks().length > 0,
        isPermissionGranted: true,
        error: null,
      }));

      // Start mic level monitoring
      startMicMonitoring(stream);

      return stream;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to access camera/microphone';
      setState(s => ({ ...s, error: message, isPermissionGranted: false }));
      return null;
    }
  }, [state.isAudioOnly, startMicMonitoring]);

  // Stop mic monitoring
  const stopMicMonitoring = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    micAnalyserRef.current = null;
    if (micMonitorContextRef.current && micMonitorContextRef.current.state !== 'closed') {
      micMonitorContextRef.current.close();
      micMonitorContextRef.current = null;
    }
    setState(s => ({ ...s, micLevels: [0, 0, 0, 0, 0] }));
  }, []);

  // Setup audio mixing with Ava's audio stream
  const setupAudioMixing = useCallback((avaAudioElement: HTMLAudioElement | null) => {
    if (!cameraStreamRef.current) {
      console.error('No camera stream available for audio mixing');
      return null;
    }

    // Verify mic audio tracks exist BEFORE setup
    const micAudioTracks = cameraStreamRef.current.getAudioTracks();
    console.log('[Audio Mixing] Pre-setup check', {
      micAudioTracks: micAudioTracks.length,
      micTrackLabels: micAudioTracks.map(t => ({ label: t.label, enabled: t.enabled, muted: t.muted })),
      hasAvaElement: !!avaAudioElement,
      hasSrcObject: !!avaAudioElement?.srcObject,
      srcObjectType: avaAudioElement?.srcObject?.constructor?.name
    });

    if (micAudioTracks.length === 0) {
      console.error('[Audio Mixing] CRITICAL: No audio tracks found on camera stream! Candidate will not be recorded.');
    }

    try {
      // Create audio context for mixing
      audioContextRef.current = new AudioContext({ sampleRate: 48000 });
      const ctx = audioContextRef.current;

      // Create destination for mixed audio
      audioDestinationRef.current = ctx.createMediaStreamDestination();
      const destination = audioDestinationRef.current;

      // Add candidate's microphone audio - use ONLY the audio track specifically
      const micAudioTrack = cameraStreamRef.current.getAudioTracks()[0];
      if (micAudioTrack) {
        // Create a stream with ONLY the audio track to ensure proper capture
        const micOnlyStream = new MediaStream([micAudioTrack]);
        const micSource = ctx.createMediaStreamSource(micOnlyStream);
        const micGain = ctx.createGain();
        // Boost mic gain slightly to ensure candidate audio is clearly audible
        micGain.gain.value = 1.2;
        micSource.connect(micGain);
        micGain.connect(destination);
        console.log('[Audio Mixing] Candidate mic connected to mixer', {
          trackLabel: micAudioTrack.label,
          trackEnabled: micAudioTrack.enabled,
          trackMuted: micAudioTrack.muted,
          gainValue: micGain.gain.value
        });
      } else {
        console.error('[Audio Mixing] CRITICAL: No mic audio track available - candidate audio will NOT be recorded!');
      }

      // Add Ava's audio if available - use MediaStreamSource directly for WebRTC
      if (avaAudioElement && avaAudioElement.srcObject instanceof MediaStream) {
        const avaStream = avaAudioElement.srcObject;
        const avaAudioTracks = avaStream.getAudioTracks();
        
        console.log('[Audio Mixing] Ava WebRTC stream found', {
          audioTracks: avaAudioTracks.length,
          trackLabels: avaAudioTracks.map(t => t.label)
        });
        
        if (avaAudioTracks.length > 0) {
          const avaSource = ctx.createMediaStreamSource(avaStream);
          const avaGain = ctx.createGain();
          avaGain.gain.value = 1.0;
          avaSource.connect(avaGain);
          avaGain.connect(destination);
          console.log('[Audio Mixing] Ava audio connected to recording mixer');
        }
      } else {
        console.log('[Audio Mixing] No Ava audio element or srcObject available');
      }

      // Create combined stream with video (if available) + mixed audio
      const videoTrack = cameraStreamRef.current.getVideoTracks()[0];
      const mixedAudioTrack = destination.stream.getAudioTracks()[0];

      // Verify mixed audio track exists and log its state
      console.log('[Audio Mixing] Mixed audio track check', {
        hasMixedAudioTrack: !!mixedAudioTrack,
        mixedAudioEnabled: mixedAudioTrack?.enabled,
        mixedAudioMuted: mixedAudioTrack?.muted,
        mixedAudioLabel: mixedAudioTrack?.label
      });

      // For audio-only mode, we might not have a video track
      if (videoTrack) {
        combinedStreamRef.current = new MediaStream([videoTrack, mixedAudioTrack]);
      } else {
        combinedStreamRef.current = new MediaStream([mixedAudioTrack]);
      }

      console.log('[Audio Mixing] Combined stream created', {
        videoTracks: combinedStreamRef.current.getVideoTracks().length,
        audioTracks: combinedStreamRef.current.getAudioTracks().length,
        audioTrackDetails: combinedStreamRef.current.getAudioTracks().map(t => ({ 
          label: t.label, 
          enabled: t.enabled, 
          muted: t.muted 
        }))
      });

      return combinedStreamRef.current;
    } catch (err) {
      console.error('[Audio Mixing] Error setting up audio mixing:', err);
      // Fallback to just camera stream without Ava audio mixing
      combinedStreamRef.current = cameraStreamRef.current;
      return cameraStreamRef.current;
    }
  }, []);

  // Start recording
  const startRecording = useCallback((avaAudioElement: HTMLAudioElement | null) => {
    if (!cameraStreamRef.current) {
      setState(s => ({ ...s, error: 'No media stream available' }));
      return false;
    }

    try {
      // Setup audio mixing
      const streamToRecord = setupAudioMixing(avaAudioElement) || cameraStreamRef.current;

      // Clear previous chunks
      recordedChunksRef.current = [];

      // Determine mime type based on audio-only mode
      let mimeType: string;
      if (state.isAudioOnly) {
        // Audio-only: use webm with opus codec
        mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm';
      } else {
        // Video: use webm with video codecs
        mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
          ? 'video/webm;codecs=vp9,opus'
          : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
          ? 'video/webm;codecs=vp8,opus'
          : 'video/webm';
      }

      const recorderOptions: MediaRecorderOptions = state.isAudioOnly
        ? {
            mimeType,
            audioBitsPerSecond: 128000, // 128 kbps
          }
        : {
            mimeType,
            videoBitsPerSecond: 1500000, // 1.5 Mbps
            audioBitsPerSecond: 128000, // 128 kbps
          };

      mediaRecorderRef.current = new MediaRecorder(streamToRecord, recorderOptions);

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onerror = (event) => {
        console.error('MediaRecorder error:', event);
        setState(s => ({ ...s, error: 'Recording error occurred', isRecording: false }));
      };

      // Start recording with 1 second chunks
      mediaRecorderRef.current.start(1000);
      setState(s => ({ ...s, isRecording: true, error: null }));

      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start recording';
      setState(s => ({ ...s, error: message }));
      return false;
    }
  }, [setupAudioMixing, state.isAudioOnly]);

  // Stop recording and return blob
  const stopRecording = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
        console.log('stopRecording: MediaRecorder inactive or null');
        setState(s => ({ ...s, isRecording: false }));
        resolve(null);
        return;
      }

      console.log('stopRecording: Stopping MediaRecorder, chunks collected:', recordedChunksRef.current.length);

      const isAudio = state.isAudioOnly;
      mediaRecorderRef.current.onstop = () => {
        const mimeType = isAudio ? 'audio/webm' : 'video/webm';
        const blob = new Blob(recordedChunksRef.current, { type: mimeType });
        console.log('stopRecording: Blob created', {
          size: blob.size,
          sizeKB: Math.round(blob.size / 1024),
          type: blob.type,
          chunks: recordedChunksRef.current.length,
          estimatedDuration: `~${Math.round(blob.size / 50000)}s`
        });
        setState(s => ({ ...s, isRecording: false }));
        resolve(blob);
      };

      mediaRecorderRef.current.stop();
    });
  }, [state.isAudioOnly]);

  // Upload recording to Supabase Storage
  const uploadRecording = useCallback(async (blob: Blob): Promise<string | null> => {
    if (!applicationId) {
      console.error('Upload failed: No application ID provided');
      setState(s => ({ ...s, error: 'No application ID provided' }));
      return null;
    }

    console.log('Starting upload process...', { applicationId, blobSize: blob.size, blobType: blob.type });
    setState(s => ({ ...s, isUploading: true, uploadProgress: 0 }));

    try {
      const extension = state.isAudioOnly ? 'webm' : 'webm';
      const contentType = state.isAudioOnly ? 'audio/webm' : 'video/webm';
      const fileName = `${applicationId}/interview-${Date.now()}.${extension}`;

      console.log('Step 1: Uploading to storage...', { fileName, contentType });
      setState(s => ({ ...s, uploadProgress: 20 }));

      // Upload to storage
      const { data, error } = await supabase.storage
        .from('voice-interview-recordings')
        .upload(fileName, blob, {
          cacheControl: '3600',
          upsert: false,
          contentType,
        });

      if (error) {
        console.error('Storage upload failed:', error);
        throw error;
      }
      console.log('Step 1 complete: Storage upload succeeded', data);
      setState(s => ({ ...s, uploadProgress: 50 }));

      console.log('Step 2: Creating signed URL...');
      // Get signed URL (private bucket)
      const { data: urlData, error: urlError } = await supabase.storage
        .from('voice-interview-recordings')
        .createSignedUrl(fileName, 60 * 60 * 24 * 365); // 1 year expiry

      if (urlError) {
        console.error('Signed URL creation failed:', urlError);
        throw urlError;
      }
      console.log('Step 2 complete: Signed URL created');
      setState(s => ({ ...s, uploadProgress: 75 }));

      const recordingUrl = urlData.signedUrl;

      console.log('Step 3: Updating database with recording URL...');
      // Update application with recording URL
      const { error: updateError } = await supabase
        .from('applications')
        .update({ voice_interview_recording_url: recordingUrl })
        .eq('id', applicationId);

      if (updateError) {
        console.error('Database update failed:', updateError);
        throw updateError;
      }
      console.log('Step 3 complete: Database updated successfully');

      setState(s => ({
        ...s,
        isUploading: false,
        uploadProgress: 100,
        recordingUrl,
      }));

      console.log('Upload process completed successfully!');
      return recordingUrl;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to upload recording';
      console.error('Upload process failed:', err);
      setState(s => ({ ...s, isUploading: false, error: message }));
      return null;
    }
  }, [applicationId, state.isAudioOnly]);

  // Cleanup all resources
  const cleanup = useCallback(() => {
    // Stop mic monitoring
    stopMicMonitoring();
    
    // Stop recording if active
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }

    // Stop camera stream
    cameraStreamRef.current?.getTracks().forEach(track => track.stop());
    cameraStreamRef.current = null;

    // Close audio context
    audioContextRef.current?.close();
    audioContextRef.current = null;

    // Clear refs
    combinedStreamRef.current = null;
    audioDestinationRef.current = null;
    mediaRecorderRef.current = null;
    recordedChunksRef.current = [];

    setState({
      hasCamera: false,
      hasMicrophone: false,
      isPermissionGranted: false,
      isRecording: false,
      isUploading: false,
      uploadProgress: 0,
      error: null,
      recordingUrl: null,
      micLevels: [0, 0, 0, 0, 0],
      isAudioOnly: audioOnly,
    });
  }, [stopMicMonitoring]);

  // Get preview stream (for displaying video before/during recording)
  const getPreviewStream = useCallback(() => {
    return cameraStreamRef.current;
  }, []);

  return {
    ...state,
    requestPermissions,
    startRecording,
    stopRecording,
    uploadRecording,
    cleanup,
    getPreviewStream,
  };
}
