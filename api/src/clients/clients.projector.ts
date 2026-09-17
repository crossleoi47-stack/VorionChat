import { Client } from "@prisma/client";
import { AppRole } from "../users/user-compat";
import { can } from "../rbac/policy";

/**
 * The mechanism the whole product exists to build correctly (blueprint §11).
 * A Client entity must never be serialized directly by a controller — every
 * response is shaped through here, so adding a new endpoint later can't
 * accidentally leak `phoneE164` the way an ad-hoc `res.json(client)` would.
 */
export interface ClientSummaryDto {
  id: string;
  displayCode: string;
  name: string;
  org: string | null;
}

export interface ClientDetailDto extends ClientSummaryDto {
  phoneE164?: string;
  email?: string | null;
}

export function projectClient(client: Client, role: AppRole): ClientDetailDto {
  const base: ClientDetailDto = {
    id: client.id,
    displayCode: client.displayCode,
    name: client.name,
    org: client.org,
  };

  if (can(role, "client.phone", "read")) {
    base.phoneE164 = client.phoneE164;
    base.email = client.email;
  }

  return base;
}

export function projectClientList(clients: Client[], role: AppRole): ClientSummaryDto[] {
  return clients.map((c) => ({
    id: c.id,
    displayCode: c.displayCode,
    name: c.name,
    org: c.org,
  }));
}
