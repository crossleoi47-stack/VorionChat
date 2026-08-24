import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PERMISSION_KEY, RequiredPermission } from "./permissions.decorator";
import { can } from "./policy";
import { AuthenticatedRequest } from "../auth/authenticated-request";

/**
 * Runs after JwtAuthGuard. This is the one and only place route-level
 * authorization is checked — controllers never do their own ad-hoc role
 * `if` statements, which is exactly how an IDOR gets introduced when a new
 * "quick" endpoint forgets a check (see the blueprint, §11 and §22).
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.get<RequiredPermission | undefined>(
      PERMISSION_KEY,
      context.getHandler(),
    );
    if (!required) return true; // no @RequirePermission on this route

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = req.user;
    if (!user) throw new ForbiddenException("Not authenticated");

    if (!can(user.role, required.resource, required.action)) {
      throw new ForbiddenException(
        `Role ${user.role} cannot ${required.action} ${required.resource}`,
      );
    }
    return true;
  }
}
