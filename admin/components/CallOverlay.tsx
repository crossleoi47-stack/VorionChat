"use client";

import { useEffect, useRef } from "react";
import { initialsOf } from "@/components/Avatar";
import { IconMic, IconPhone, IconVideo } from "@/components/Icons";
import type { CallState } from "@/lib/useCall";

function Timer({ since }: { since: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const tick = () => {
      const s = Math.floor((Date.now() - since) / 1000);
      const mm = String(Math.floor(s / 60)).padStart(2, "0");
      const ss = String(s % 60).padStart(2, "0");
      if (ref.current) ref.current.textContent = `${mm}:${ss}`;
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [since]);
  return <span ref={ref}>00:00</span>;
}

/** Small "×" glyph used for the mic/cam off state, drawn over the icon. */
function Slash() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="26"
      height="26"
      style={{ position: "absolute" }}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M4 4l16 16" />
    </svg>
  );
}

export function CallOverlay({
  state,
  localStream,
  remoteStream,
  onAccept,
  onDecline,
  onHangUp,
  onToggleMic,
  onToggleCam,
}: {
  state: CallState;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  onAccept: () => void;
  onDecline: () => void;
  onHangUp: () => void;
  onToggleMic: () => void;
  onToggleCam: () => void;
}) {
  const localRef = useRef<HTMLVideoElement>(null);
  const remoteRef = useRef<HTMLVideoElement>(null);
  const startedAt = useRef<number>(Date.now());

  useEffect(() => {
    if (localRef.current && localStream) localRef.current.srcObject = localStream;
  }, [localStream]);

  useEffect(() => {
    if (remoteRef.current && remoteStream) remoteRef.current.srcObject = remoteStream;
  }, [remoteStream]);

  useEffect(() => {
    if (state.phase === "active") startedAt.current = Date.now();
  }, [state.phase]);

  if (state.phase === "idle") return null;

  const name = state.peerName ?? "Unknown";
  const isVideo = state.type === "VIDEO";

  // An incoming ring shows as a corner toast so you can keep working until
  // you actually answer — full screen only once the call is live.
  if (state.phase === "ringing-in") {
    return (
      <div className="call-toast">
        <span className="avatar md" style={{ background: "var(--brand-blue)" }} aria-hidden="true">
          {initialsOf(name)}
        </span>
        <span style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: ".93rem" }}>{name}</div>
          <div className="muted" style={{ fontSize: ".8rem" }}>
            Incoming {isVideo ? "video" : "voice"} call…
          </div>
        </span>
        <span className="ct-actions">
          <button className="ct-btn no" onClick={onDecline} title="Decline" aria-label="Decline">
            <IconPhone size={18} />
          </button>
          <button className="ct-btn yes" onClick={onAccept} title="Answer" aria-label="Answer">
            {isVideo ? <IconVideo size={18} /> : <IconPhone size={18} />}
          </button>
        </span>
      </div>
    );
  }

  const statusLine =
    state.phase === "ringing-out"
      ? "Ringing…"
      : state.phase === "connecting"
        ? "Connecting…"
        : state.phase === "ended"
          ? "Call ended"
          : null;

  return (
    <div className="call-overlay">
      <div className="call-stage">
        {state.phase === "active" && isVideo && remoteStream ? (
          <>
            <video ref={remoteRef} className="call-remote" autoPlay playsInline />
            {localStream && (
              <video ref={localRef} className="call-local" autoPlay playsInline muted />
            )}
          </>
        ) : (
          <div className="call-idle">
            <div
              className={`big-avatar ${statusLine ? "call-pulse" : ""}`}
              style={{ background: "var(--brand-blue)" }}
            >
              {initialsOf(name)}
            </div>
            <h2>{name}</h2>
            <div className="sub">
              {statusLine ?? (
                <>
                  {isVideo ? "Video call" : "Voice call"} · <Timer since={startedAt.current} />
                </>
              )}
            </div>
            {/* Voice calls still carry audio through a hidden element. */}
            {remoteStream && !isVideo && <audio ref={remoteRef as never} autoPlay />}
            {remoteStream && isVideo && state.phase !== "active" && (
              <audio ref={remoteRef as never} autoPlay />
            )}
          </div>
        )}
      </div>

      {state.error && <div className="call-error">{state.error}</div>}

      <div className="call-bar">
        <button
          className={`call-btn ${state.micOn ? "" : "off"}`}
          onClick={onToggleMic}
          title={state.micOn ? "Mute" : "Unmute"}
          aria-label={state.micOn ? "Mute" : "Unmute"}
          style={{ position: "relative" }}
        >
          <IconMic size={24} />
          {!state.micOn && <Slash />}
        </button>

        {isVideo && (
          <button
            className={`call-btn ${state.camOn ? "" : "off"}`}
            onClick={onToggleCam}
            title={state.camOn ? "Turn camera off" : "Turn camera on"}
            aria-label={state.camOn ? "Turn camera off" : "Turn camera on"}
            style={{ position: "relative" }}
          >
            <IconVideo size={24} />
            {!state.camOn && <Slash />}
          </button>
        )}

        <button className="call-btn hangup" onClick={onHangUp} title="End call" aria-label="End call">
          <IconPhone size={26} />
        </button>
      </div>
    </div>
  );
}
