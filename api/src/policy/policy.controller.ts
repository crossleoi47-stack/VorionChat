import { Body, Controller, Get, Param, Patch, Req } from "@nestjs/common";
import { PolicyService } from "./policy.service";
import { FEATURES, FEATURE_LABELS, FeatureMap, ROLE_DEFAULTS } from "./features";
import { DlpConfig } from "./dlp";
import { RequirePermission } from "../rbac/permissions.decorator";
import { AuthenticatedRequest } from "../auth/authenticated-request";

@Controller("policy")
export class PolicyController {
  constructor(private policy: PolicyService) {}

  /** What the *current* user is allowed to do — drives UI gating. */
  @Get("me")
  mine(@Req() req: AuthenticatedRequest) {
    return this.policy.featuresFor(req.user!.id);
  }

  /** Catalogue for the admin screen: the switch list and each role's baseline. */
  @RequirePermission("user", "read")
  @Get("catalog")
  catalog() {
    return {
      features: FEATURES.map((key) => ({ key, label: FEATURE_LABELS[key] })),
      roleDefaults: ROLE_DEFAULTS,
    };
  }

  @RequirePermission("user", "read")
  @Get("users/:id")
  forUser(@Param("id") id: string) {
    return this.policy.featuresFor(id);
  }

  @RequirePermission("user", "update")
  @Patch("users/:id")
  setForUser(
    @Param("id") id: string,
    @Body() body: Partial<FeatureMap>,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.policy.setUserOverrides(id, body, req.user!);
  }

  @RequirePermission("user", "read")
  @Get("dlp")
  getDlp(@Req() req: AuthenticatedRequest) {
    return this.policy.dlpConfig(req.user!.companyId);
  }

  @RequirePermission("user", "update")
  @Patch("dlp")
  setDlp(@Body() body: Partial<DlpConfig>, @Req() req: AuthenticatedRequest) {
    return this.policy.setDlp(body, req.user!);
  }
}
