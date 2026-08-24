import { Role } from "@prisma/client";

export interface JwtPayload {
  sub: string; // user id
  companyId: string;
  role: Role;
  sessionId: string;
}

export interface AuthenticatedUser {
  id: string;
  companyId: string;
  role: Role;
  sessionId: string;
}
