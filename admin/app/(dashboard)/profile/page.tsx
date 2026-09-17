"use client";

import { useEffect, useState } from "react";
import { useCurrentUser } from "@/lib/useCurrentUser";

export default function ProfilePage() {
  const { user } = useCurrentUser();
  const [ready, setReady] = useState(false);

  useEffect(() => setReady(true), []);

  if (!ready) return null;

  return (
    <>
      <div className="page-header">
        <h1>My Profile</h1>
      </div>

      <div className="card" style={{ maxWidth: 640 }}>
        <div className="field">
          <label>Name</label>
          <input value={user?.fullName ?? ""} readOnly />
        </div>
        <div className="field">
          <label>Employee ID</label>
          <input value={user?.employeeCode ?? ""} readOnly />
        </div>
        <div className="field">
          <label>Role</label>
          <input value={user?.role ?? ""} readOnly />
        </div>
      </div>
    </>
  );
}
