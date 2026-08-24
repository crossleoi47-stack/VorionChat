import { SetMetadata } from "@nestjs/common";
import { Action, Resource } from "./policy";

export const PERMISSION_KEY = "permission";

export interface RequiredPermission {
  resource: Resource;
  action: Action;
}

/** Attach the (resource, action) a route requires; PermissionsGuard reads it. */
export const RequirePermission = (resource: Resource, action: Action) =>
  SetMetadata(PERMISSION_KEY, { resource, action } as RequiredPermission);
