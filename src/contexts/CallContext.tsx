import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react"
import { supabase } from "@/lib/supabase"
import { ringtonePlayer } from "@/utils/ringtones"
import { useUser } from "@clerk/clerk-react"
import IncomingCallScreen from "@/components/calls/IncomingCallScreen"
import OutgoingCallScreen from "@/components/calls/OutgoingCallScreen"
import ActiveCallScreen from "@/components/calls/ActiveCallScreen"

interface CallState {
  id: string
  chatId: string
  hostId: string
  hostName: string
  hostAvatar: string | null
  chatName: string | null
  roomUrl: string
  roomName: string
  callType: "voice" | "video"
  status: string
  calleeName?: string | null
  calleeAvatar?: string | null
  currentUserId?: string | null
}

interface CallContextValue {
  incomingCall: CallState | null
  outgoingCall: CallState | null
  activeCall: CallState | null
  startCall: (chatId: string, calleeId: string | null, chatName: string, callType: "voice" | "video") => Promise<void>
  acceptCall: () => Promise<void>
  declineCall: () => Promise<void>
  cancelOutgoingCall: () => Promise<void>
  endActiveCall: () => Promise<void>
}

const CallContext = createContext<CallContextValue | null>(null)

export const useCall = () => {
  const ctx = useContext(CallContext)
  if (!ctx) throw new Error("useCall must be used within CallProvider")
  return ctx
}

const RING_TIMEOUT_MS = 45000 // auto-miss after 45 seconds

export const CallProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useUser()
  const [incomingCall, setIncomingCall] = useState<CallState | null>(null)
  const [outgoingCall, setOutgoingCall] = useState<CallState | null>(null)
  const [activeCall, setActiveCall] = useState<CallState | null>(null)
  
  const ringTimeoutRef = useRef<any>(null)
  const seenCallIdsRef = useRef<Set<string>>(new Set())
  const currentUserIdRef = useRef<string | null>(null)
  const startingCallRef = useRef(false)

  useEffect(() => {
    currentUserIdRef.current = user?.id || null
  }, [user?.id])

  // ===== DEEP LINK HANDLING =====
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const incomingCallId = params.get("incoming_call")
    if (!incomingCallId || !user?.id) return

    const checkDeepLinkCall = async () => {
      const { data: call } = await supabase
        .from("calls")
        .select("*")
        .eq("id", incomingCallId)
        .eq("status", "ringing")
        .maybeSingle()

      if (call) {
        setIncomingCall({
          id: call.id, chatId: call.chat_id, hostId: call.host_id,
          hostName: call.host_name || "Someone",
          hostAvatar: call.host_avatar, chatName: call.chat_name,
          roomUrl: call.room_url, roomName: call.room_name,
          callType: call.call_type || "video", status: call.status,
          currentUserId: user.id
        })
        ringtonePlayer.startIncomingRing()
      }
    }

    checkDeepLinkCall()
  }, [user?.id])

  // ===== GLOBAL POLLING FOR INCOMING CALLS =====
  useEffect(() => {
    if (!user?.id) return

    const pollForIncomingCalls = async () => {
      if (incomingCall || activeCall || outgoingCall) return
      if (!currentUserIdRef.current) {
        console.log("[call-poll] no current user yet, skipping")
        return
      }

      console.log("[call-poll] checking for incoming calls, user:", currentUserIdRef.current)

      const { data: memberships, error: memErr } = await supabase
        .from("chat_members")
        .select("chat_id")
        .eq("user_id", currentUserIdRef.current)

      console.log("[call-poll] chat memberships found:", memberships?.length, memErr?.message)

      const chatIds = (memberships || []).map(m => m.chat_id)
      if (chatIds.length === 0) {
        console.log("[call-poll] user has no chats, cannot receive calls")
        return
      }

      const cutoff = new Date(Date.now() - RING_TIMEOUT_MS).toISOString()

      const { data: ringingCalls, error: callErr } = await supabase
        .from("calls")
        .select("*")
        .in("chat_id", chatIds)
        .eq("status", "ringing")
        .neq("host_id", currentUserIdRef.current)
        .gte("started_at", cutoff)
        .order("started_at", { ascending: false })
        .limit(1)

      console.log("[call-poll] ringing calls query result:", ringingCalls?.length, callErr?.message)

      const call = ringingCalls?.[0]
      if (!call) return

      if (seenCallIdsRef.current.has(call.id)) {
        console.log("[call-poll] already seen this call, skipping:", call.id)
        return
      }

      console.log("[call-poll] 📞 NEW INCOMING CALL DETECTED:", call.id)

      setIncomingCall({
        id: call.id,
        chatId: call.chat_id,
        hostId: call.host_id,
        hostName: call.host_name || "Someone",
        hostAvatar: call.host_avatar,
        chatName: call.chat_name,
        roomUrl: call.room_url,
        roomName: call.room_name,
        callType: call.call_type || "video",
        status: call.status,
        currentUserId: user.id
      })

      ringtonePlayer.startIncomingRing()

      ringTimeoutRef.current = setTimeout(() => {
        console.log("[call] ⏱ auto-missed:", call.id)
        seenCallIdsRef.current.add(call.id)
        ringtonePlayer.stop()
        setIncomingCall(null)
        supabase.from("calls").update({
          status: "missed",
          ended_reason: "missed",
          ended_at: new Date().toISOString()
        }).eq("id", call.id).then(() => {})
      }, RING_TIMEOUT_MS)
    }

    console.log("[call-poll] ⏰ starting poll interval")
    pollForIncomingCalls()
    const interval = setInterval(() => {
      console.log("[call-poll] tick")
      pollForIncomingCalls()
    }, 3000)

    return () => {
      console.log("[call-poll] 🛑 stopping poll interval")
      clearInterval(interval)
    }
  }, [user?.id, incomingCall, activeCall, outgoingCall])

  // ===== POLL OUTGOING CALL STATUS =====
  useEffect(() => {
    if (!outgoingCall) return

    const poll = setInterval(async () => {
      const { data: call } = await supabase
        .from("calls")
        .select("status")
        .eq("id", outgoingCall.id)
        .single()

      if (!call) return

      if (call.status === "active") {
        console.log("[call] outgoing call accepted")
        ringtonePlayer.stop()
        setActiveCall({
          ...outgoingCall,
          currentUserName: user?.fullName || user?.firstName || "Plugsy User"
        })
        setOutgoingCall(null)
      } else if (call.status === "declined") {
        console.log("[call] outgoing call declined")
        ringtonePlayer.stop()
        setOutgoingCall(null)
      } else if (call.status === "missed" || call.status === "ended") {
        console.log("[call] outgoing call not answered")
        ringtonePlayer.stop()
        setOutgoingCall(null)
      }
    }, 1500)

    return () => clearInterval(poll)
  }, [outgoingCall])

  // ===== ACTIONS =====
  const startCall = async (
    chatId: string, 
    calleeId: string | null,
    chatName: string,
    callType: "voice" | "video"
  ) => {
    if (startingCallRef.current) {
      console.log("[call] already starting a call, ignoring tap")
      return
    }
    if (outgoingCall || activeCall) {
      console.log("[call] already in a call, ignoring tap")
      return
    }

    startingCallRef.current = true
    try {
      console.log("[call] starting call:", chatId, callType)

      const hostName = user?.fullName || user?.firstName || "Someone"
      const hostAvatar = user?.imageUrl || null

      let calleeName = chatName
      let calleeAvatar = null

      if (calleeId) {
        const { data: calleeProfile } = await supabase
          .from("profiles")
          .select("full_name, profile_pic_url")
          .eq("clerk_id", calleeId)
          .maybeSingle()
        calleeName = calleeProfile?.full_name || chatName
        calleeAvatar = calleeProfile?.profile_pic_url || null
      }

      const res = await fetch("/api/calls?action=create-room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId, hostId: user?.id, hostName, hostAvatar,
          calleeId, chatName, callType
        })
      })
      const data = await res.json()

      if (!data.success) {
        console.error("[call] failed to start:", data.error)
        return
      }

      ringtonePlayer.startOutgoingRing()
      setOutgoingCall({
        id: data.callId,
        chatId, hostId: user?.id || "", hostName, hostAvatar,
        chatName, roomUrl: data.roomUrl, roomName: data.roomName,
        callType, status: "ringing",
        calleeName, calleeAvatar,
        currentUserId: user?.id
      })
    } finally {
      setTimeout(() => {
        startingCallRef.current = false
      }, 3000)
    }
  }

  const acceptCall = async () => {
    if (!incomingCall) return
    console.log("[call] accepting:", incomingCall.id)

    if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current)
    ringtonePlayer.stop()
    seenCallIdsRef.current.add(incomingCall.id)

    await supabase.from("calls").update({ status: "active" })
      .eq("id", incomingCall.id)

    setActiveCall({
      ...incomingCall,
      currentUserName: user?.fullName || user?.firstName || "Plugsy User"
    })
    setIncomingCall(null)
  }

  const declineCall = async () => {
    if (!incomingCall) return
    console.log("[call] declining:", incomingCall.id)

    if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current)
    ringtonePlayer.stop()
    seenCallIdsRef.current.add(incomingCall.id)

    await supabase.from("calls").update({
      status: "declined",
      ended_reason: "declined",
      ended_at: new Date().toISOString()
    }).eq("id", incomingCall.id)

    setIncomingCall(null)
  }

  const cancelOutgoingCall = async () => {
    if (!outgoingCall) return
    console.log("[call] cancelling outgoing:", outgoingCall.id)

    ringtonePlayer.stop()

    await fetch("/api/calls?action=end-call", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        callId: outgoingCall.id,
        chatId: outgoingCall.chatId,
        roomName: outgoingCall.roomName
      })
    })

    setOutgoingCall(null)
  }

  const endActiveCall = async () => {
    if (!activeCall) return
    console.log("[call] ending active call:", activeCall.id)

    await fetch("/api/calls?action=end-call", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        callId: activeCall.id,
        chatId: activeCall.chatId,
        roomName: activeCall.roomName
      })
    })

    setActiveCall(null)
  }

  return (
    <CallContext.Provider value={{
      incomingCall, outgoingCall, activeCall,
      startCall, acceptCall, declineCall,
      cancelOutgoingCall, endActiveCall
    }}>
      {children}
      {incomingCall && <IncomingCallScreen call={incomingCall} />}
      {outgoingCall && <OutgoingCallScreen call={outgoingCall} />}
      {activeCall && <ActiveCallScreen call={activeCall} />}
    </CallContext.Provider>
  )
}
