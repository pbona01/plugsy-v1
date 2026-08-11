import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react"
import { supabase } from "@/lib/supabase"
import { ringtonePlayer } from "@/utils/ringtones"
import { useAuth, useUser } from "@clerk/clerk-react"
import IncomingCallScreen from "@/components/calls/IncomingCallScreen"
import OutgoingCallScreen from "@/components/calls/OutgoingCallScreen"
import ActiveCallScreen from "@/components/calls/ActiveCallScreen"
import { endPersistedCall } from "@/utils/callLifecycle"
import { createActiveCallReconciler } from "@/utils/activeCallReconciliation"

export interface CallState {
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

export interface CallActionResult { ok: boolean; code: string }

interface CallContextValue {
  incomingCall: CallState | null
  outgoingCall: CallState | null
  activeCall: CallState | null
  startCall: (chatId: string, calleeId: string | null, chatName: string, callType: "voice" | "video") => Promise<void>
  acceptCall: () => Promise<void>
  declineCall: () => Promise<void>
  cancelOutgoingCall: () => Promise<CallActionResult>
  endActiveCall: () => Promise<CallActionResult>
  recoverActiveCall: (call: any) => void
  clearRecoveredActiveCall: (chatId: string) => void
}

const CallContext = createContext<CallContextValue | null>(null)

export const useCall = () => {
  const ctx = useContext(CallContext)
  if (!ctx) throw new Error("useCall must be used within CallProvider")
  return ctx
}

const RING_TIMEOUT_MS = 45000 // auto-miss after 45 seconds
const INCOMING_CALL_FALLBACK_POLL_MS = 15_000

export const CallProvider = ({ children }: { children: ReactNode }) => {
  const { getToken } = useAuth()
  const { user } = useUser()
  const [incomingCall, setIncomingCall] = useState<CallState | null>(null)
  const [outgoingCall, setOutgoingCall] = useState<CallState | null>(null)
  const [activeCall, setActiveCall] = useState<CallState | null>(null)
  
  const ringTimeoutRef = useRef<any>(null)
  const seenCallIdsRef = useRef<Set<string>>(new Set())
  const currentUserIdRef = useRef<string | null>(null)
  const startingCallRef = useRef(false)
  const memberChatIdsRef = useRef<string[]>([])

  const recoverActiveCall = (call: any) => {
    if (!call?.id || !call.chat_id || !call.room_url || !call.room_name) return
    setActiveCall({
      id: call.id,
      chatId: call.chat_id,
      hostId: call.host_id,
      hostName: call.host_name || "Someone",
      hostAvatar: call.host_avatar || null,
      chatName: call.chat_name || null,
      roomUrl: call.room_url,
      roomName: call.room_name,
      callType: call.call_type === "voice" ? "voice" : "video",
      status: call.status || "active",
      currentUserId: user?.id || null,
    })
  }
  const clearRecoveredActiveCall = (chatId: string) => {
    setActiveCall((current) => current?.chatId === chatId ? null : current)
  }

  useEffect(() => {
    const reconciler = createActiveCallReconciler({
      readStatus: async (callId) => {
        const { data, error } = await supabase.from("calls").select("status").eq("id", callId).maybeSingle()
        if (error) throw error
        return data?.status
      },
      onEnded: (callId) => setActiveCall((current) => {
        if (current?.id !== callId) return current
        ringtonePlayer.stop()
        return null
      }),
    })
    if (activeCall?.id) return reconciler.start(activeCall.id)
    return reconciler.stop
  }, [activeCall?.id, user?.id])

  useEffect(() => {
    currentUserIdRef.current = user?.id || null
  }, [user?.id])

  useEffect(() => {
    ringtonePlayer.stop()
    setIncomingCall(null)
    setOutgoingCall(null)
    setActiveCall(null)
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

    let disposed = false
    const refreshMemberships = async () => {
      const currentUserId = currentUserIdRef.current
      if (!currentUserId) return
      const { data, error } = await supabase
        .from("chat_members")
        .select("chat_id")
        .eq("user_id", currentUserId)
      if (error) {
        console.warn("[call-memberships] refresh failed", error.message)
        return
      }
      if (!disposed) {
        memberChatIdsRef.current = [...new Set((data || []).map((membership) => membership.chat_id).filter(Boolean))]
      }
    }
    void refreshMemberships()
    const membershipChannel = supabase
      .channel(`call-memberships-${user.id}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "chat_members",
        filter: `user_id=eq.${user.id}`,
      }, () => void refreshMemberships())
      .subscribe()

    const pollForIncomingCalls = async () => {
      if (document.visibilityState !== "visible" || incomingCall || activeCall || outgoingCall) return
      if (!currentUserIdRef.current) {
        console.log("[call-poll] no current user yet, skipping")
        return
      }

      console.log("[call-poll] checking for incoming calls, user:", currentUserIdRef.current)

      const chatIds = memberChatIdsRef.current
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
    }, INCOMING_CALL_FALLBACK_POLL_MS)
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void pollForIncomingCalls()
    }
    document.addEventListener("visibilitychange", onVisibilityChange)

    return () => {
      console.log("[call-poll] 🛑 stopping poll interval")
      clearInterval(interval)
      document.removeEventListener("visibilitychange", onVisibilityChange)
      disposed = true
      void supabase.removeChannel(membershipChannel)
      memberChatIdsRef.current = []
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
          .from("profile_directory_v1")
          .select("full_name, profile_pic_url")
          .eq("clerk_id", calleeId)
          .maybeSingle()
        calleeName = calleeProfile?.full_name || chatName
        calleeAvatar = calleeProfile?.profile_pic_url || null
      }

      const token = await getToken()
      if (!token) return
      const res = await fetch("/api/calls?action=create-room", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ chatId, callType })
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

  const cancelOutgoingCall = async (): Promise<CallActionResult> => {
    if (!outgoingCall) return { ok: false, code: "CALL_NOT_ACTIVE" }
    console.log("[call] cancelling outgoing:", outgoingCall.id)

    ringtonePlayer.stop()

    const result = await endPersistedCall(outgoingCall, { getToken, fetchImpl: fetch })
    if (!result.ok) return result
    setOutgoingCall(null)
    return { ok: true, code: "OK" }
  }

  const endActiveCall = async (): Promise<CallActionResult> => {
    if (!activeCall) return { ok: false, code: "CALL_NOT_ACTIVE" }
    console.log("[call] ending active call:", activeCall.id)

    const result = await endPersistedCall(activeCall, { getToken, fetchImpl: fetch })
    if (!result.ok) return result
    setActiveCall(null)
    return { ok: true, code: "OK" }
  }

  return (
    <CallContext.Provider value={{
      incomingCall, outgoingCall, activeCall,
      startCall, acceptCall, declineCall,
      cancelOutgoingCall, endActiveCall, recoverActiveCall, clearRecoveredActiveCall
    }}>
      {children}
      {incomingCall && <IncomingCallScreen call={incomingCall} />}
      {outgoingCall && <OutgoingCallScreen call={outgoingCall} />}
      {activeCall && <ActiveCallScreen call={activeCall} />}
    </CallContext.Provider>
  )
}
