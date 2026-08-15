import React from "react";
import { useCall } from "@/contexts/CallContext";
import VideoCallWidget from "@/components/video/VideoCallWidget";

const ActiveCallScreen = ({ call }: { call: any }) => {
  const { endActiveCall } = useCall();
  const title =
    call.chatName ||
    (call.hostId === call.currentUserId
      ? call.calleeName || "Plugsy call"
      : call.hostName || "Plugsy call");

  return (
    <VideoCallWidget
      roomUrl={call.roomUrl}
      title={title}
      userName={call.currentUserName || "You"}
      userAvatar={call.currentUserAvatar || undefined}
      initialVideoOff={call.callType === "voice"}
      onClose={() => {
        void endActiveCall();
      }}
    />
  );
};

export default ActiveCallScreen;
