import { useState, useRef, useCallback } from 'react';

export const useVoiceRecorder = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobChunk[]>([]); // Blob chunk array
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.start(1000);
      setIsRecording(true);
      setDuration(0);

      timerRef.current = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
    } catch (error) {
      console.error('Error accessing microphone:', error);
      throw error;
    }
  }, []);

  const stopRecording = useCallback((): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      if (!mediaRecorderRef.current) {
        reject(new Error('MediaRecorder is not initialized'));
        return;
      }

      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        resolve(audioBlob);
        
        // Cleanup stream
        mediaRecorderRef.current?.stream.getTracks().forEach(track => track.stop());
      };

      try {
        mediaRecorderRef.current.stop();
      } catch (e) {
        reject(e);
      }
      
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    });
  }, []);

  const cancelRecording = useCallback(() => {
     if (!mediaRecorderRef.current) return;
     
     mediaRecorderRef.current.onstop = () => {
       // Cleanup stream
       mediaRecorderRef.current?.stream.getTracks().forEach(track => track.stop());
     };
     
     try {
       mediaRecorderRef.current.stop();
     } catch (e) {}

     setIsRecording(false);
     if (timerRef.current) {
       clearInterval(timerRef.current);
       timerRef.current = null;
     }
     setDuration(0);
  }, []);

  return { isRecording, duration, startRecording, stopRecording, cancelRecording };
};

type BlobChunk = Blob;
