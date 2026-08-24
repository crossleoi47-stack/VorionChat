"use client";

import { createContext, useContext } from "react";
import { useCall } from "@/lib/useCall";
import { CallOverlay } from "@/components/CallOverlay";

type CallApi = ReturnType<typeof useCall>;

const Ctx = createContext<CallApi | null>(null);

/**
 * Mounted once in the dashboard layout so a call rings wherever you are in
 * the app, and the peer connection survives navigation between pages.
 */
export function CallProvider({ children }: { children: React.ReactNode }) {
  const call = useCall();

  return (
    <Ctx.Provider value={call}>
      {children}
      <CallOverlay
        state={call.state}
        localStream={call.localStream}
        remoteStream={call.remoteStream}
        onAccept={call.accept}
        onDecline={call.decline}
        onHangUp={call.hangUp}
        onToggleMic={call.toggleMic}
        onToggleCam={call.toggleCam}
      />
    </Ctx.Provider>
  );
}

/** Any screen can start a call: `useCallApi().placeCall(userId, name, "VIDEO")`. */
export function useCallApi(): CallApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useCallApi must be used inside CallProvider");
  return ctx;
}
