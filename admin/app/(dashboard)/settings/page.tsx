"use client";

import { useCurrentUser } from "@/lib/useCurrentUser";

export default function SettingsPage() {
  const { user } = useCurrentUser();

  return (
    <>
      <div className="page-header">
        <h1>Settings</h1>
      </div>

      <div className="card" style={{ maxWidth: 640 }}>
        <p style={{ marginTop: 0 }}>
          Account settings for {user?.fullName ?? "your account"} are managed through the existing Vorion Chat
          permissions and company controls.
        </p>
        <p className="muted" style={{ marginBottom: 0 }}>
          This page is intentionally minimal and keeps the current application structure unchanged.
        </p>
      </div>
    </>
  );
}
