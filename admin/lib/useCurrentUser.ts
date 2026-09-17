"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export interface CurrentUser {
  id: string;
  employeeCode: string;
  fullName: string;
  role: "SUPER_ADMIN" | "COMPANY_ADMIN" | "MANAGER" | "EMPLOYEE" | "AUDITOR";
  departmentId: string | null;
}

// Mirrors the shape of api/src/rbac/policy.ts closely enough for nav-item
// visibility — NOT an authorization boundary. The API enforces every real
// permission check independently; hiding a nav link just avoids sending an
// employee to a page that will only ever 403 for them.
const ADMIN_ROLES = new Set(["SUPER_ADMIN", "COMPANY_ADMIN"]);
const SUPER_ADMIN_ROLES = new Set(["SUPER_ADMIN"]);
const CAN_REASSIGN = new Set(["SUPER_ADMIN", "COMPANY_ADMIN", "MANAGER"]);
const CAN_SEE_AUDIT = new Set(["SUPER_ADMIN", "COMPANY_ADMIN", "AUDITOR"]);

export function useCurrentUser() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<CurrentUser>("/auth/me")
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  return {
    user,
    loading,
    canManageEmployees: !!user && ADMIN_ROLES.has(user.role),
    canDeleteDepartments: !!user && SUPER_ADMIN_ROLES.has(user.role),
    canReassign: !!user && CAN_REASSIGN.has(user.role),
    canSeeAudit: !!user && CAN_SEE_AUDIT.has(user.role),
  };
}
