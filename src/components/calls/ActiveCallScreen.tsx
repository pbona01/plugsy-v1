import React from "react";
import { useCall } from "@/contexts/CallContext";
import VideoCallWidget from "@/components/video/VideoCallWidget";

const ActiveCallScreen = ({ call }: { call: any }) => {
  const { endActiveCall } = useCall();
  const remoteName =
    call.hostId === call.currentUserId
      ? call.calleeName || call.chatName || "Contact"
      : call.hostName || "Contact";
  const remoteAvatar =
    call.hostId === call.currentUserId ? call.calleeAvatar : call.hostAvatar;

  return (
    <VideoCallWidget
      roomUrl={call.roomUrl}
      title={remoteName}
      userName={call.currentUserName || "You"}
      userAvatar={call.currentUserAvatar || undefined}
      remoteName={remoteName}
      remoteAvatar={remoteAvatar || undefined}
      initialVideoOff={call.callType === "voice"}
      onClose={() => {
        void endActiveCall();
      }}
    />
  );
};

export default ActiveCallScreen;
