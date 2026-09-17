export type AppRole =
  | "SUPER_ADMIN"
  | "COMPANY_ADMIN"
  | "MANAGER"
  | "EMPLOYEE"
  | "AUDITOR"
  | "ADMIN"
  | "VA";

export type AppUserStatus = "ACTIVE" | "DISABLED" | "INACTIVE";
export type SupabaseRole = "SUPER_ADMIN" | "ADMIN" | "VA";
export type SupabaseStatus = "ACTIVE" | "INACTIVE";

export function mapAppRoleToSupabase(role: string): SupabaseRole | null {
  switch (role) {
    case "SUPER_ADMIN":
      return "SUPER_ADMIN";
    case "COMPANY_ADMIN":
    case "ADMIN":
      return "ADMIN";
    case "EMPLOYEE":
    case "VA":
      return "VA";
    default:
      return null;
  }
}

export function mapSupabaseRoleToApp(role: SupabaseRole): AppRole {
  switch (role) {
    case "ADMIN":
      return "COMPANY_ADMIN";
    case "VA":
      return "EMPLOYEE";
    default:
      return "SUPER_ADMIN";
  }
}

export function mapAppStatusToSupabase(status: string | undefined): SupabaseStatus {
  return status === "DISABLED" || status === "INACTIVE" ? "INACTIVE" : "ACTIVE";
}

export function mapSupabaseStatusToApp(status: SupabaseStatus): AppUserStatus {
  return status === "INACTIVE" ? "DISABLED" : "ACTIVE";
}
