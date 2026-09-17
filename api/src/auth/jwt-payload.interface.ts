import { AppRole } from "../users/user-compat";

export interface JwtPayload {
  sub: string; // user id
  companyId: string;
  role: AppRole;
  sessionId: string;
}

export interface AuthenticatedUser {
  id: string;
  companyId: string;
  role: AppRole;
  sessionId: string;
}
