import React, { useEffect, useRef, useState } from 'react';
import DailyIframe, { DailyCall, DailyParticipant } from '@daily-co/daily-js';
import { 
  PhoneOff, Mic, MicOff, Video, VideoOff, Volume2, VolumeX, 
  Lock, User, Minimize2, Maximize2, Signal
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import toast from 'react-hot-toast';

interface VideoCallWidgetProps {
  roomUrl: string;
  onClose?: () => void;
  title?: string;
  userName?: string;
  userAvatar?: string;
  remoteName?: string;
  remoteAvatar?: string;
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

function ParticipantIdentity({ name, avatar, local = false }: { name: string; avatar?: string; local?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-black/55 px-2.5 py-2 backdrop-blur-xl">
      <div className="h-8 w-8 shrink-0 overflow-hidden rounded-lg bg-[#182234] ring-1 ring-white/10">
        {avatar ? <img src={avatar} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" /> : <User className="m-auto h-4 w-4 text-white/60" />}
      </div>
      <div className="min-w-0 text-left">
        <p className="max-w-[150px] truncate text-xs font-bold text-white">{name}</p>
        <p className="text-[10px] font-medium text-white/55">{local ? "You" : "Contact"}</p>
      </div>
    </div>
  );
}

export default function VideoCallWidget({ roomUrl, onClose, title, userName, userAvatar, remoteName, remoteAvatar, initialVideoOff = false }: VideoCallWidgetProps) {
  const onCloseRef = useRef(onClose);
  const [callFrame, setCallFrame] = useState<DailyCall | null>(null);
  const [participants, setParticipants] = useState<Record<string, DailyParticipant>>({});
  
  // Call Controls State
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(initialVideoOff);
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  
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
          startVideoOff: initialVideoOff,
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
  const getParticipantName = (participant: DailyParticipant | undefined, fallback: string) =>
    ((participant as (DailyParticipant & { user_name?: string }) | undefined)?.user_name || fallback);

  const remoteDisplayName = getParticipantName(remoteParticipant, remoteName || title || "Contact");
  const localDisplayName = getParticipantName(localParticipant, userName || "You");
  const callMode = isVideoOff ? "Voice" : "Video";

  const handleEndCall = () => {
    if (callFrame) {
      callFrame.leave();
    }
    triggerClose();
  };

  if (isMinimized) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="fixed bottom-24 right-5 z-[10000] w-[min(360px,calc(100vw-2rem))] rounded-2xl border border-white/15 bg-[#101722]/95 p-3 text-white shadow-2xl shadow-black/40 backdrop-blur-2xl md:bottom-5"
      >
        <div className="flex items-center gap-3">
          <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-[#182234] ring-1 ring-white/10">
            {remoteAvatar ? <img src={remoteAvatar} alt="" className="h-full w-full object-cover" /> : <User className="m-auto h-5 w-5 text-white/60" />}
            {callState === "connected" && <span className="absolute bottom-1 right-1 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-[#101722]" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">{remoteDisplayName}</p>
            <p className="flex items-center gap-1.5 text-[11px] text-white/55"><Signal size={12} className="text-brand-accent" /> {callState === "connected" ? formatTime(duration) : "Connecting…"}</p>
          </div>
          <button onClick={() => setIsMinimized(false)} className="rounded-xl p-2.5 text-white/70 transition hover:bg-white/10 hover:text-white" title="Open call" aria-label="Open call"><Maximize2 size={18} /></button>
          <button onClick={handleEndCall} className="rounded-xl p-2.5 text-red-300 transition hover:bg-red-500/15 hover:text-red-200" title="End call" aria-label="End call"><PhoneOff size={18} /></button>
        </div>
      </motion.div>
    );
  }

  // Toggle Mute / Camera via CallObject
  const toggleMute = () => {
    if (!callFrame) return;
    const nextMute = !isMuted;
    callFrame.setLocalAudio(!nextMute);
    setIsMuted(nextMute);
  };

  const toggleCamera = () => {
    if (!callFrame || callState !== 'connected') return;
    const nextVideoOff = !isVideoOff;
    callFrame.setLocalVideo(!nextVideoOff);
    setIsVideoOff(nextVideoOff);
  };

  const toggleSpeaker = () => {
    const nextSpeakerState = !isSpeakerMuted;
    setIsSpeakerMuted(nextSpeakerState);
  };

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9999] bg-[#0b141a] text-white flex flex-col font-sans overflow-hidden select-none"
      >
        {/* Subtle Plugsy texture behind the call surface */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,#142536_0%,#0b141a_48%,#081015_100%)] pointer-events-none z-0" />

        <button
          type="button"
          onPointerDown={() => setIsMinimized(true)}
          onClick={() => setIsMinimized(true)}
          className="pointer-events-auto absolute right-5 top-5 z-[100] flex items-center gap-2 rounded-xl border border-white/15 bg-black/60 px-3 py-2.5 text-white/85 shadow-lg backdrop-blur-xl transition hover:border-brand-accent/50 hover:bg-brand-accent/15 hover:text-white"
          title="Minimize call"
          aria-label="Minimize call and continue browsing"
        >
          <Minimize2 size={18} />
          <span className="hidden text-[10px] font-black uppercase tracking-widest md:inline">Minimize</span>
        </button>

        {/* TOP STATUS BAR: Encryption status and room details */}
        <div className="relative z-20 flex flex-col items-center pt-8 px-6 text-center pointer-events-none">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45 mb-3">
            <Lock size={10} />
            <span>Private call</span>
          </div>
          
          <h2 className="text-xl md:text-2xl font-bold tracking-tight text-white">
            {title || "Plugsy Secure Caller"}
          </h2>

          <p className="text-xs text-white/50 font-medium tracking-wide mt-1.5 uppercase tracking-wider">
            {callState === 'ringing' && "Ringing secure line..."}
            {callState === 'connecting' && "Securing encryption handshake..."}
            {callState === 'connected' && (remoteParticipant ? "Connected" : "Waiting for contact to join...")}
            {callState === 'failed' && "Secure Line Failed"}
          </p>

          {callState === 'connected' && (
            <div className="mt-3 px-3 py-1 bg-white/8 rounded-lg text-xs font-semibold tracking-widest text-white/55 font-mono">
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

                {/* Central Contact Icon */}
                <div className="relative w-36 h-36 rounded-full bg-[#101722] border-4 border-white/10 shadow-2xl flex items-center justify-center overflow-hidden">
                  {remoteAvatar ? <img src={remoteAvatar} alt={`${remoteDisplayName} profile`} className="h-full w-full object-cover" referrerPolicy="no-referrer" /> : <User size={56} className="text-gray-400" />}
                </div>
                <p className="absolute top-[calc(100%+1rem)] max-w-[220px] truncate text-base font-bold text-white">{remoteDisplayName}</p>
              </div>
            )}

            {/* FULLSCREEN REMOTE VIDEO FEED (Only on mobile if remote is streaming video) */}
            {remoteParticipant && remoteParticipant.video && (
              <div className="absolute inset-0 w-full h-full z-10 bg-slate-950 rounded-2xl overflow-hidden my-4 border border-white/10">
                <DailyVideo participant={remoteParticipant} isLocal={false} />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/40 pointer-events-none" />
                <div className="absolute bottom-4 left-4">
                  <ParticipantIdentity name={remoteDisplayName} avatar={remoteAvatar} />
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
                <div className="absolute top-2 left-2">
                  <ParticipantIdentity name={localDisplayName} avatar={userAvatar} local />
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
                  <div className="absolute bottom-4 left-4"><ParticipantIdentity name={remoteDisplayName} avatar={remoteAvatar} /></div>
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
                      {remoteAvatar ? <img src={remoteAvatar} alt={`${remoteDisplayName} profile`} className="h-full w-full object-cover" referrerPolicy="no-referrer" /> : <User size={40} className="text-gray-400" />}
                    </div>
                  </div>
                  <div>
                    <h4 className="text-lg font-bold tracking-tight text-white">
                      {remoteDisplayName}
                    </h4>
                    <p className="text-xs text-gray-400 mt-1 uppercase tracking-widest font-mono">
                      {callState === 'connected' ? (remoteParticipant?.audio ? <span className="inline-flex items-center gap-1"><Mic size={12} /> Speaking</span> : <span className="inline-flex items-center gap-1"><MicOff size={12} /> Muted</span>) : "Secure Handshake..."}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* CARD 2: Local Participant (You) */}
            <div className="relative rounded-3xl overflow-hidden border-2 border-white/10 bg-[#0d111a]/90 shadow-2xl flex flex-col items-center justify-center transition-all duration-300 hover:border-brand-accent/40 group">
              {localParticipant && !isVideoOff ? (
                <div className="absolute inset-0 w-full h-full">
                  <DailyVideo participant={localParticipant} isLocal={true} />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent pointer-events-none" />
                  <div className="absolute bottom-4 left-4"><ParticipantIdentity name={localDisplayName} avatar={userAvatar} local /></div>
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
                      {localDisplayName}
                    </h4>
                    <p className="text-xs text-gray-400 mt-1 uppercase tracking-widest font-mono">
                      {isMuted ? <span className="inline-flex items-center gap-1"><MicOff size={12} /> Muted</span> : <span className="inline-flex items-center gap-1"><Mic size={12} /> Microphone Live</span>}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

        </div>

        {/* BOTTOM FLOATING CONTROLS: Plugsy glass caller deck */}
        <div className="relative z-30 pb-12 pt-6 px-6 flex flex-col items-center gap-4">
          
          {/* Core Command Center Deck */}
          <div className="flex flex-col items-center gap-3">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">{callMode} call</span>
            <div className="flex items-center gap-4 md:gap-6 px-6 py-4 rounded-3xl bg-black/55 backdrop-blur-xl border border-white/10 shadow-2xl max-w-md w-full justify-center">
            
            {/* Toggle Microphone */}
            <button
              onClick={toggleMute}
              disabled={callState !== 'connected'}
              className={`p-3.5 rounded-2xl cursor-pointer active:scale-95 transition-colors flex items-center justify-center ${
                isMuted 
                  ? "bg-red-500 text-white"
                  : "bg-white/10 text-white hover:bg-white/20 border border-white/10"
              }`}
              title={isMuted ? "Unmute Mic" : "Mute Mic"}
              aria-label={isMuted ? "Unmute microphone" : "Mute microphone"}
              aria-pressed={isMuted}
            >
              {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
            </button>

            {/* Toggle Camera */}
            <button
              onClick={toggleCamera}
              disabled={callState !== 'connected'}
              className={`p-3.5 rounded-2xl cursor-pointer active:scale-95 transition-colors flex items-center justify-center ${
                isVideoOff 
                  ? "bg-slate-800 text-gray-400 border border-white/5" 
                  : "bg-white/10 text-white hover:bg-white/20 border border-white/10"
              }`}
              title={isVideoOff ? "Switch to video call" : "Switch to voice call"}
              aria-label={isVideoOff ? "Switch to video call" : "Switch to voice call"}
              aria-pressed={isVideoOff}
            >
              {isVideoOff ? <VideoOff size={20} /> : <Video size={20} />}
            </button>

            {/* Toggle Speaker Output */}
            <button
              onClick={toggleSpeaker}
              disabled={callState !== 'connected'}
              className={`p-3.5 rounded-2xl cursor-pointer active:scale-95 transition-colors flex items-center justify-center ${
                isSpeakerMuted 
                  ? "bg-red-500 text-white shadow-red-500/20" 
                  : "bg-white/10 text-white hover:bg-white/20 border border-white/10"
              }`}
              title={isSpeakerMuted ? "Unmute Audio" : "Mute Audio"}
              aria-label={isSpeakerMuted ? "Unmute speakers" : "Mute speakers"}
              aria-pressed={isSpeakerMuted}
            >
              {isSpeakerMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
            </button>

            {/* Prominent hangup trigger */}
            <button
              onClick={handleEndCall}
              className="p-4 rounded-full bg-red-600 text-white hover:bg-red-700 active:scale-95 transition-colors cursor-pointer border border-red-500 flex items-center justify-center"
              title="Hang Up"
            >
              <PhoneOff size={22} className="rotate-135" />
            </button>
            </div>
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
