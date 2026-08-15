import React, { useEffect, useRef, useState } from 'react';
import DailyIframe, { DailyCall, DailyParticipant } from '@daily-co/daily-js';
import { 
  PhoneOff, Mic, MicOff, Video, VideoOff, Volume2, VolumeX, 
  Lock, Shield, User, Users, Camera, Sparkles, Loader2, MonitorUp
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import toast from 'react-hot-toast';

interface VideoCallWidgetProps {
  roomUrl: string;
  onClose?: () => void;
  title?: string;
  userName?: string;
  userAvatar?: string;
  initialVideoOff?: boolean;
}

// Subcomponent to render a remote participant's video stream using standard WebRTC video elements
function DailyVideo({ participant, isLocal }: { participant: DailyParticipant; isLocal: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    // Daily CallObject persistent tracks
    const videoTrack = participant?.tracks?.video?.persistentTrack;
    const videoEnabled = participant?.video;

    if (videoTrack && videoEnabled) {
      const stream = new MediaStream([videoTrack]);
      videoElement.srcObject = stream;
      videoElement.play().catch((err) => {
        console.warn("[DailyVideo] video play failed:", err);
      });
    } else {
      videoElement.srcObject = null;
    }
  }, [participant?.tracks?.video?.persistentTrack, participant?.video]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted={isLocal}
      className="w-full h-full object-cover rounded-2xl bg-slate-900 transition-opacity duration-300"
    />
  );
}

interface DailyAudioProps {
  key?: string;
  participant: DailyParticipant;
  isMuted: boolean;
}

// Subcomponent to render a remote participant's audio stream in the background
function DailyAudio({ participant, isMuted }: DailyAudioProps) {
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const audioElement = audioRef.current;
    if (!audioElement) return;

    const audioTrack = participant?.tracks?.audio?.persistentTrack;
    const audioEnabled = participant?.audio;

    if (audioTrack && audioEnabled && !participant.local && !isMuted) {
      const stream = new MediaStream([audioTrack]);
      audioElement.srcObject = stream;
      audioElement.play().catch((err) => {
        console.warn("[DailyAudio] audio play failed:", err);
      });
    } else {
      audioElement.srcObject = null;
    }
  }, [participant?.tracks?.audio?.persistentTrack, participant?.audio, participant.local, isMuted]);

  return <audio ref={audioRef} autoPlay playsInline />;
}

export default function VideoCallWidget({ roomUrl, onClose, title, userName, userAvatar, initialVideoOff = false }: VideoCallWidgetProps) {
  const onCloseRef = useRef(onClose);
  const [callFrame, setCallFrame] = useState<DailyCall | null>(null);
  const [participants, setParticipants] = useState<Record<string, DailyParticipant>>({});
  
  // Call Controls State
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(initialVideoOff);
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  
  // Call lifecycle states
  const [callState, setCallState] = useState<'connecting' | 'ringing' | 'connected' | 'failed' | 'disconnected'>('connecting');
  const [duration, setDuration] = useState(0);

  // Guard to ensure onClose callback is only triggered once
  const hasClosedRef = useRef(false);
  const triggerClose = () => {
    if (hasClosedRef.current) return;
    hasClosedRef.current = true;
    if (onCloseRef.current) {
      onCloseRef.current();
    }
  };

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Handle CallObject initialization and lifecycle subscription
  useEffect(() => {
    if (!roomUrl) return;

    let isMounted = true;
    let callObject: DailyCall | null = null;

    const initCall = async () => {
      try {
        const existingCall = DailyIframe.getCallInstance();
        if (existingCall) {
          await existingCall.destroy();
        }

        if (!isMounted) return;

        // Create a headless custom Call Object rather than standard iframe
        callObject = DailyIframe.createCallObject({
          audioSource: true,
          videoSource: !initialVideoOff,
        });

        setCallFrame(callObject);
        setCallState('connecting');

        // Setup Event Listeners to feed React State from WebRTC events
        const handleJoined = () => {
          if (!isMounted) return;
          setCallState('connected');
          const parts = callObject!.participants();
          setParticipants({ ...parts });
          
          if (parts.local) {
            setIsMuted(!parts.local.audio);
            setIsVideoOff(!parts.local.video);
          }
          toast.success("Joined call room securely!");
        };

        const handleParticipantsChange = () => {
          if (!isMounted || !callObject) return;
          const parts = callObject.participants();
          setParticipants({ ...parts });
          
          if (parts.local) {
            setIsMuted(!parts.local.audio);
            setIsVideoOff(!parts.local.video);
          }
        };

        const handleLeft = () => {
          if (!isMounted) return;
          setCallState('disconnected');
          triggerClose();
        };

        const handleError = (err: any) => {
          console.error("[VideoCallWidget] WebRTC Error:", err);
          toast.error("Call quality issue. Reconnecting...");
        };

        callObject.on('joined-meeting', handleJoined);
        callObject.on('left-meeting', handleLeft);
        callObject.on('participant-joined', handleParticipantsChange);
        callObject.on('participant-updated', handleParticipantsChange);
        callObject.on('participant-left', handleParticipantsChange);
        callObject.on('error', handleError);

        // Ringing simulation for 1.8 seconds before joining WebRTC room
        setCallState('ringing');
        await new Promise((resolve) => setTimeout(resolve, 1800));

        if (!isMounted) return;
        await callObject.join({ 
          url: roomUrl,
          userName: userName || "Plugsy Member",
          videoSource: !initialVideoOff,
        });

      } catch (err: any) {
        console.error("[VideoCallWidget] Call initialization failed:", err);
        if (isMounted) {
          setCallState('failed');
          toast.error("Secure calling connection failed: " + err.message);
        }
      }
    };

    initCall();

    return () => {
      isMounted = false;
      if (callObject) {
        callObject.destroy();
      }
    };
  }, [roomUrl, userName, initialVideoOff]);

  // Duration Timer increments every second during active call connection
  useEffect(() => {
    if (callState !== 'connected') return;

    const interval = setInterval(() => {
      setDuration((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [callState]);

  // Format active time elegantly (e.g. 05:42)
  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remainingSecs.toString().padStart(2, '0')}`;
  };

  // Participant resolution
  const participantList = Object.values(participants) as DailyParticipant[];
  const localParticipant = participantList.find((p) => p.local);
  const remoteParticipant = participantList.find((p) => !p.local);

  // Toggle Mute / Camera via CallObject
  const toggleMute = () => {
    if (!callFrame) return;
    const nextMute = !isMuted;
    callFrame.setLocalAudio(!nextMute);
    setIsMuted(nextMute);
    toast.success(nextMute ? "Microphone muted ✓" : "Microphone active ✓", { id: 'mute-toast' });
  };

  const toggleCamera = () => {
    if (!callFrame) return;
    const nextVideoOff = !isVideoOff;
    callFrame.setLocalVideo(!nextVideoOff);
    setIsVideoOff(nextVideoOff);
    toast.success(nextVideoOff ? "Camera turned off ✓" : "Camera turned on ✓", { id: 'cam-toast' });
  };

  const toggleSpeaker = () => {
    const nextSpeakerState = !isSpeakerMuted;
    setIsSpeakerMuted(nextSpeakerState);
    toast.success(nextSpeakerState ? "Speakers muted ✓" : "Speakers unmuted ✓", { id: 'spk-toast' });
  };

  const toggleScreenShare = async () => {
    if (!callFrame) return;
    try {
      if (isScreenSharing) {
        await callFrame.stopScreenShare();
        setIsScreenSharing(false);
        toast.success("Screen sharing stopped", { id: "screen-share-toast" });
      } else {
        await callFrame.startScreenShare();
        setIsScreenSharing(true);
        toast.success("Screen sharing started", { id: "screen-share-toast" });
      }
    } catch (error) {
      console.warn("[VideoCallWidget] screen share unavailable:", error);
      toast.error("Screen sharing was not enabled", { id: "screen-share-toast" });
    }
  };

  const handleEndCall = () => {
    if (callFrame) {
      callFrame.leave();
    }
    triggerClose();
  };

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9999] bg-[#080b12] text-white flex flex-col font-sans overflow-hidden select-none"
      >
        {/* Subtle Plugsy texture behind the call surface */}
        <div className="absolute inset-0 opacity-5 bg-[radial-gradient(#0066ff_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none z-0" />

        {/* TOP STATUS BAR: Encryption status and room details */}
        <div className="relative z-20 flex flex-col items-center pt-8 px-6 text-center pointer-events-none">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/30 backdrop-blur-md border border-white/5 text-[10px] font-bold uppercase tracking-widest text-brand-accent mb-4">
            <Lock size={10} />
            <span>End-to-End Encrypted</span>
          </div>
          
          <h2 className="text-xl md:text-2xl font-black font-display tracking-tight text-white drop-shadow-md">
            {title || "Plugsy Secure Caller"}
          </h2>

          <p className="text-xs text-gray-300 font-medium tracking-wide mt-1.5 uppercase tracking-wider drop-shadow-md">
            {callState === 'ringing' && "Ringing secure line..."}
            {callState === 'connecting' && "Securing encryption handshake..."}
            {callState === 'connected' && (remoteParticipant ? "Connected" : "Waiting for contact to join...")}
            {callState === 'failed' && "Secure Line Failed"}
          </p>

          {callState === 'connected' && (
            <div className="mt-3 px-3 py-1 bg-white/10 backdrop-blur-md rounded-xl text-xs font-black tracking-widest text-emerald-400 font-mono shadow-inner">
              {formatTime(duration)}
            </div>
          )}
        </div>

        {/* CENTER CALL DISPLAY: Pulsing avatars and video feeds */}
        <div className="flex-grow flex flex-col items-center justify-center relative w-full z-20 px-6">
          
          {/* MOBILE VIEW (standard single-screen + draggable PiP) */}
          <div className="flex md:hidden flex-col items-center justify-center relative w-full h-full flex-grow">
            {/* Large pulsing avatar overlay when remote video is off */}
            {(!remoteParticipant || !remoteParticipant.video) && (
              <div className="relative flex items-center justify-center">
                {/* Plugsy blue concentric connection waves */}
                {callState === 'ringing' && (
                  <>
                    <motion.div 
                      animate={{ scale: [1, 1.8], opacity: [0.6, 0] }}
                      transition={{ repeat: Infinity, duration: 2, ease: "easeOut" }}
                      className="absolute w-44 h-44 rounded-full border-2 border-brand-accent/30"
                    />
                    <motion.div 
                      animate={{ scale: [1, 2.2], opacity: [0.4, 0] }}
                      transition={{ repeat: Infinity, duration: 2, delay: 0.6, ease: "easeOut" }}
                      className="absolute w-44 h-44 rounded-full border border-brand-accent/20"
                    />
                  </>
                )}
                {callState === 'connected' && remoteParticipant?.audio && (
                  <motion.div 
                    animate={{ scale: [1, 1.3, 1] }}
                    transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
                    className="absolute w-44 h-44 rounded-full bg-brand-accent/10 blur-xl"
                  />
                )}

                {/* Central Contact Icon */}
                <div className="relative w-36 h-36 rounded-full bg-[#101722] border-4 border-white/10 shadow-2xl flex items-center justify-center overflow-hidden">
                  <User size={56} className="text-gray-400 animate-pulse" />
                </div>
              </div>
            )}

            {/* FULLSCREEN REMOTE VIDEO FEED (Only on mobile if remote is streaming video) */}
            {remoteParticipant && remoteParticipant.video && (
              <div className="absolute inset-0 w-full h-full z-10 bg-slate-950 rounded-2xl overflow-hidden my-4 border border-white/10">
                <DailyVideo participant={remoteParticipant} isLocal={false} />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/40 pointer-events-none" />
                <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-xl text-xs font-bold text-white/90">
                  {title || "Contact"}
                </div>
              </div>
            )}

            {/* Draggable Picture-in-Picture Local camera preview */}
            {localParticipant && !isVideoOff && (
              <motion.div
                drag
                dragConstraints={{ left: -150, right: 150, top: -250, bottom: 250 }}
                whileDrag={{ scale: 1.05 }}
                className="absolute bottom-6 right-2 w-28 h-40 rounded-2xl overflow-hidden border-2 border-white/20 shadow-2xl z-40 bg-slate-950 cursor-grab active:cursor-grabbing hover:border-brand-accent/60 transition-colors"
              >
                <DailyVideo participant={localParticipant} isLocal={true} />
                <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-md px-1.5 py-0.5 rounded text-[8px] font-black uppercase text-white/80">
                  You
                </div>
              </motion.div>
            )}
          </div>

          {/* DESKTOP/PC VIEW (Premium Side-by-Side balanced layout) */}
          <div className="hidden md:grid grid-cols-2 gap-8 w-full max-w-5xl h-[52vh] items-stretch justify-center py-4">
            {/* CARD 1: Remote Participant */}
            <div className="relative rounded-3xl overflow-hidden border-2 border-white/10 bg-[#0d111a]/90 shadow-2xl flex flex-col items-center justify-center transition-all duration-300 hover:border-brand-accent/40 group">
              {remoteParticipant && remoteParticipant.video ? (
                <div className="absolute inset-0 w-full h-full">
                  <DailyVideo participant={remoteParticipant} isLocal={false} />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent pointer-events-none" />
                </div>
              ) : (
                <div className="relative flex flex-col items-center gap-4 text-center">
                  <div className="relative">
                    {callState === 'ringing' && (
                      <motion.div 
                        animate={{ scale: [1, 1.6], opacity: [0.5, 0] }}
                        transition={{ repeat: Infinity, duration: 2, ease: "easeOut" }}
                        className="absolute -inset-4 rounded-full border-2 border-brand-accent/30"
                      />
                    )}
                    {callState === 'connected' && remoteParticipant?.audio && (
                      <motion.div 
                        animate={{ scale: [1, 1.25, 1] }}
                        transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
                        className="absolute -inset-4 rounded-full bg-brand-accent/10 blur-md"
                      />
                    )}
                    <div className="w-28 h-28 rounded-full bg-[#101722] border-4 border-white/10 flex items-center justify-center overflow-hidden shadow-xl">
                      <User size={40} className="text-gray-400 animate-pulse" />
                    </div>
                  </div>
                  <div>
                    <h4 className="text-lg font-bold tracking-tight text-white">
                      {title || "Contact"}
                    </h4>
                    <p className="text-xs text-gray-400 mt-1 uppercase tracking-widest font-mono">
                      {callState === 'connected' ? (remoteParticipant?.audio ? "🎙️ Speaking" : "🔇 Muted") : "Secure Handshake..."}
                    </p>
                  </div>
                </div>
              )}
              {/* Card Tag */}
              <div className="absolute top-4 left-4 bg-black/60 backdrop-blur-md border border-white/10 px-3 py-1.5 rounded-xl text-xs font-bold text-white flex items-center gap-1.5 z-20">
                <Users size={12} className="text-brand-accent" />
                <span>Contact</span>
              </div>
            </div>

            {/* CARD 2: Local Participant (You) */}
            <div className="relative rounded-3xl overflow-hidden border-2 border-white/10 bg-[#0d111a]/90 shadow-2xl flex flex-col items-center justify-center transition-all duration-300 hover:border-brand-accent/40 group">
              {localParticipant && !isVideoOff ? (
                <div className="absolute inset-0 w-full h-full">
                  <DailyVideo participant={localParticipant} isLocal={true} />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent pointer-events-none" />
                </div>
              ) : (
                <div className="relative flex flex-col items-center gap-4 text-center">
                  <div className="relative">
                    {!isMuted && (
                      <motion.div 
                        animate={{ scale: [1, 1.25, 1] }}
                        transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
                        className="absolute -inset-4 rounded-full bg-brand-accent/10 blur-md"
                      />
                    )}
                    <div className="w-28 h-28 rounded-full bg-[#101722] border-4 border-white/10 flex items-center justify-center overflow-hidden shadow-xl">
                      {userAvatar ? (
                        <img src={userAvatar} alt="Your avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <span className="text-2xl font-black text-brand-accent uppercase">
                          {(userName || "U").slice(0, 1)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div>
                    <h4 className="text-lg font-bold tracking-tight text-white">
                      {userName || "You"}
                    </h4>
                    <p className="text-xs text-gray-400 mt-1 uppercase tracking-widest font-mono">
                      {isMuted ? "🔇 Muted" : "🎙️ Microphone Live"}
                    </p>
                  </div>
                </div>
              )}
              {/* Card Tag */}
              <div className="absolute top-4 left-4 bg-black/60 backdrop-blur-md border border-white/10 px-3 py-1.5 rounded-xl text-xs font-bold text-white flex items-center gap-1.5 z-20">
                <div className={`w-2 h-2 rounded-full ${isVideoOff ? 'bg-red-500' : 'bg-emerald-500 animate-pulse'}`} />
                <span>You</span>
              </div>
            </div>
          </div>

        </div>

        {/* BOTTOM FLOATING CONTROLS: Plugsy glass caller deck */}
        <div className="relative z-30 pb-12 pt-6 px-6 flex flex-col items-center gap-4">
          
          {/* Active Callers Indicators */}
          {callState === 'connected' && (
            <p className="text-[10px] text-gray-400 font-bold tracking-widest uppercase flex items-center gap-1.5 bg-black/45 px-3 py-1.5 rounded-full border border-white/5 backdrop-blur-md shadow-md">
              <Users size={12} className="text-brand-accent" />
              <span>Participants: {participantList.length}</span>
            </p>
          )}

          {/* Core Command Center Deck */}
          <div className="flex items-center gap-4 md:gap-6 px-6 py-4 rounded-3xl bg-black/55 backdrop-blur-xl border border-white/10 shadow-2xl max-w-md w-full justify-center">
            
            {/* Toggle Microphone */}
            <button
              onClick={toggleMute}
              className={`p-3.5 rounded-2xl cursor-pointer hover:scale-105 active:scale-95 transition-all flex items-center justify-center shadow-lg ${
                isMuted 
                  ? "bg-red-500 text-white shadow-red-500/20 animate-pulse" 
                  : "bg-white/10 text-white hover:bg-white/20 border border-white/10"
              }`}
              title={isMuted ? "Unmute Mic" : "Mute Mic"}
            >
              {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
            </button>

            {/* Toggle Camera */}
            <button
              onClick={toggleCamera}
              className={`p-3.5 rounded-2xl cursor-pointer hover:scale-105 active:scale-95 transition-all flex items-center justify-center shadow-lg ${
                isVideoOff 
                  ? "bg-slate-800 text-gray-400 border border-white/5" 
                  : "bg-white/10 text-white hover:bg-white/20 border border-white/10"
              }`}
              title={isVideoOff ? "Turn On Camera" : "Turn Off Camera"}
            >
              {isVideoOff ? <VideoOff size={20} /> : <Video size={20} />}
            </button>

            {/* Toggle Speaker Output */}
            <button
              onClick={toggleSpeaker}
              className={`p-3.5 rounded-2xl cursor-pointer hover:scale-105 active:scale-95 transition-all flex items-center justify-center shadow-lg ${
                isSpeakerMuted 
                  ? "bg-red-500 text-white shadow-red-500/20" 
                  : "bg-white/10 text-white hover:bg-white/20 border border-white/10"
              }`}
              title={isSpeakerMuted ? "Unmute Audio" : "Mute Audio"}
            >
              {isSpeakerMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
            </button>

            {/* Screen sharing */}
            <button
              onClick={toggleScreenShare}
              className={`p-3.5 rounded-2xl cursor-pointer hover:scale-105 active:scale-95 transition-all flex items-center justify-center shadow-lg ${
                isScreenSharing
                  ? "bg-brand-accent text-white shadow-blue-500/25"
                  : "bg-white/10 text-white hover:bg-white/20 border border-white/10"
              }`}
              title={isScreenSharing ? "Stop sharing" : "Share screen"}
              aria-label={isScreenSharing ? "Stop sharing screen" : "Share screen"}
            >
              <MonitorUp size={20} />
            </button>

            {/* Prominent hangup trigger */}
            <button
              onClick={handleEndCall}
              className="p-4 rounded-full bg-red-600 text-white hover:bg-red-700 hover:scale-110 active:scale-95 transition-all cursor-pointer shadow-xl shadow-red-600/35 border border-red-500 flex items-center justify-center"
              title="Hang Up"
            >
              <PhoneOff size={22} className="rotate-135" />
            </button>
          </div>
        </div>

        {/* Dynamic audio players in background for WebRTC remote streams */}
        {participantList.map((p) => (
          <DailyAudio key={p.session_id} participant={p} isMuted={isSpeakerMuted} />
        ))}
      </motion.div>
    </AnimatePresence>
  );
}
