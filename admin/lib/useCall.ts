"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { getSocket } from "@/lib/socket";

export type CallPhase = "idle" | "ringing-out" | "ringing-in" | "connecting" | "active" | "ended";

export interface CallState {
  phase: CallPhase;
  callId: string | null;
  peerId: string | null;
  peerName: string | null;
  type: "VOICE" | "VIDEO";
  micOn: boolean;
  camOn: boolean;
  error: string | null;
  /** True once ICE actually connected — signalling working ≠ media flowing. */
  mediaConnected: boolean;
}

const INITIAL: CallState = {
  phase: "idle",
  callId: null,
  peerId: null,
  peerName: null,
  type: "VOICE",
  micOn: true,
  camOn: true,
  error: null,
  mediaConnected: false,
};

/**
 * WebRTC 1:1 calling. The server only relays SDP/ICE — audio and video go
 * browser-to-browser. Whoever *placed* the call creates the offer, and only
 * after the callee accepts, so we never ask for the microphone until there's
 * actually a call to join.
 */
export function useCall() {
  const [state, setState] = useState<CallState>(INITIAL);
  const pc = useRef<RTCPeerConnection | null>(null);
  const localStream = useRef<MediaStream | null>(null);
  const remoteStream = useRef<MediaStream | null>(null);
  const isCaller = useRef(false);
  /** ICE can arrive before the remote description is set; hold them here. */
  const pendingIce = useRef<RTCIceCandidateInit[]>([]);
  const [, forceRender] = useState(0);

  const cleanup = useCallback(() => {
    pc.current?.close();
    pc.current = null;
    localStream.current?.getTracks().forEach((t) => t.stop());
    localStream.current = null;
    remoteStream.current = null;
    pendingIce.current = [];
    isCaller.current = false;
  }, []);

  const hangUp = useCallback(
    (notify = true) => {
      const id = state.callId;
      if (notify && id) getSocket().emit("call:end", { callId: id });
      cleanup();
      setState(INITIAL);
    },
    [state.callId, cleanup],
  );

  const buildPeer = useCallback(async (callId: string, wantVideo: boolean) => {
    const { iceServers } = await api<{ iceServers: RTCIceServer[] }>("/calls/ice");
    const peer = new RTCPeerConnection({ iceServers });

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: wantVideo,
    });
    localStream.current = stream;
    stream.getTracks().forEach((t) => peer.addTrack(t, stream));

    peer.ontrack = (e) => {
      remoteStream.current = e.streams[0];
      forceRender((n) => n + 1);
    };

    peer.onicecandidate = (e) => {
      if (e.candidate) {
        getSocket().emit("call:signal", { callId, data: { candidate: e.candidate } });
      }
    };

    peer.onconnectionstatechange = () => {
      const s = peer.connectionState;
      if (s === "connected") {
        setState((p) => ({ ...p, phase: "active", mediaConnected: true }));
      } else if (s === "failed") {
        // Signalling succeeded but no media path exists — almost always a
        // NAT/firewall case that needs a TURN relay. Tell the server so the
        // call log records FAILED rather than a normal-looking conversation.
        getSocket().emit("call:end", { callId, reason: "failed" });
        setState((p) => ({
          ...p,
          error:
            "Couldn't establish a media connection. This usually means a TURN relay server is needed for this network.",
        }));
      }
    };

    pc.current = peer;
    return peer;
  }, []);

  const flushIce = useCallback(async () => {
    if (!pc.current) return;
    for (const c of pendingIce.current) {
      await pc.current.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
    }
    pendingIce.current = [];
  }, []);

  /** Place a call. */
  const placeCall = useCallback(
    (peerId: string, peerName: string, type: "VOICE" | "VIDEO") => {
      isCaller.current = true;
      setState({
        ...INITIAL,
        phase: "ringing-out",
        peerId,
        peerName,
        type,
        camOn: type === "VIDEO",
      });
      getSocket().emit("call:invite", { calleeId: peerId, type });
    },
    [],
  );

  const accept = useCallback(() => {
    if (!state.callId) return;
    setState((p) => ({ ...p, phase: "connecting" }));
    getSocket().emit("call:accept", { callId: state.callId });
  }, [state.callId]);

  const decline = useCallback(() => {
    if (state.callId) getSocket().emit("call:decline", { callId: state.callId });
    cleanup();
    setState(INITIAL);
  }, [state.callId, cleanup]);

  const toggleMic = useCallback(() => {
    const track = localStream.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setState((p) => ({ ...p, micOn: track.enabled }));
  }, []);

  const toggleCam = useCallback(() => {
    const track = localStream.current?.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setState((p) => ({ ...p, camOn: track.enabled }));
  }, []);

  useEffect(() => {
    const socket = getSocket();

    const onIncoming = (p: {
      callId: string;
      callerId: string;
      callerName: string;
      type: "VOICE" | "VIDEO";
    }) => {
      setState((prev) => {
        // Already busy — auto-decline rather than stacking calls.
        if (prev.phase !== "idle") {
          socket.emit("call:decline", { callId: p.callId });
          return prev;
        }
        return {
          ...INITIAL,
          phase: "ringing-in",
          callId: p.callId,
          peerId: p.callerId,
          peerName: p.callerName,
          type: p.type,
          camOn: p.type === "VIDEO",
        };
      });
    };

    const onRinging = (p: { callId: string }) =>
      setState((prev) => (prev.phase === "ringing-out" ? { ...prev, callId: p.callId } : prev));

    const onAccepted = async (p: { callId: string }) => {
      if (!isCaller.current) return;
      setState((prev) => ({ ...prev, phase: "connecting" }));
      try {
        const peer = await buildPeer(p.callId, state.type === "VIDEO");
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        socket.emit("call:signal", { callId: p.callId, data: { sdp: peer.localDescription } });
      } catch (e) {
        setState((prev) => ({
          ...prev,
          error: e instanceof Error ? e.message : "Could not access microphone/camera",
        }));
      }
    };

    const onSignal = async (p: {
      callId: string;
      data: { sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };
    }) => {
      const { sdp, candidate } = p.data ?? {};

      if (sdp) {
        try {
          // Callee builds its peer lazily, on receiving the offer.
          if (!pc.current) await buildPeer(p.callId, state.type === "VIDEO");
          const peer = pc.current!;
          await peer.setRemoteDescription(new RTCSessionDescription(sdp));
          await flushIce();

          if (sdp.type === "offer") {
            const answer = await peer.createAnswer();
            await peer.setLocalDescription(answer);
            socket.emit("call:signal", { callId: p.callId, data: { sdp: peer.localDescription } });
          }
        } catch (e) {
          setState((prev) => ({
            ...prev,
            error: e instanceof Error ? e.message : "Call setup failed",
          }));
        }
        return;
      }

      if (candidate) {
        if (pc.current?.remoteDescription) {
          await pc.current.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
        } else {
          pendingIce.current.push(candidate);
        }
      }
    };

    const onEnded = () => {
      cleanup();
      setState((prev) => (prev.phase === "idle" ? prev : { ...INITIAL, phase: "ended" }));
      setTimeout(() => setState(INITIAL), 1500);
    };

    const onFailed = (p: { reason: string }) => {
      cleanup();
      setState({ ...INITIAL, error: p.reason });
    };

    socket.on("call:incoming", onIncoming);
    socket.on("call:ringing", onRinging);
    socket.on("call:accepted", onAccepted);
    socket.on("call:signal", onSignal);
    socket.on("call:ended", onEnded);
    socket.on("call:failed", onFailed);

    return () => {
      socket.off("call:incoming", onIncoming);
      socket.off("call:ringing", onRinging);
      socket.off("call:accepted", onAccepted);
      socket.off("call:signal", onSignal);
      socket.off("call:ended", onEnded);
      socket.off("call:failed", onFailed);
    };
  }, [buildPeer, flushIce, cleanup, state.type]);

  return {
    state,
    localStream: localStream.current,
    remoteStream: remoteStream.current,
    placeCall,
    accept,
    decline,
    hangUp,
    toggleMic,
    toggleCam,
  };
}
