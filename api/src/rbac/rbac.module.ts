import { Module } from "@nestjs/common";

// Guard registration lives in AppModule (see app.module.ts) so that
// JwtAuthGuard and PermissionsGuard are provided as APP_GUARD in one place,
// in the explicit order that matters: authenticate, then authorize.
@Module({})
export class RbacModule {}
