import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { PrismaModule } from "./prisma/prisma.module";
import { StorageModule } from "./storage/storage.module";
import { AuditModule } from "./audit/audit.module";
import { AuthModule } from "./auth/auth.module";
import { JwtAuthGuard } from "./auth/jwt-auth.guard";
import { PermissionsGuard } from "./rbac/permissions.guard";
import { UsersModule } from "./users/users.module";
import { ClientsModule } from "./clients/clients.module";
import { AssignmentsModule } from "./assignments/assignments.module";
import { DepartmentsModule } from "./departments/departments.module";
import { ConversationsModule } from "./conversations/conversations.module";
import { MessagesModule } from "./messages/messages.module";
import { WhatsappModule } from "./whatsapp/whatsapp.module";
import { RealtimeModule } from "./realtime/realtime.module";
import { AttachmentsModule } from "./attachments/attachments.module";
import { GroupsModule } from "./groups/groups.module";
import { PresenceModule } from "./presence/presence.module";
import { StatusModule } from "./status/status.module";
import { CallsModule } from "./calls/calls.module";
import { PolicyModule } from "./policy/policy.module";
import { OversightModule } from "./oversight/oversight.module";
import { CryptoModule } from "./crypto/crypto.module";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { TenantInterceptor } from "./prisma/tenant.interceptor";
import { HealthController } from "./health/health.controller";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 100 }] }),
    PrismaModule,
    CryptoModule,
    StorageModule,
    PresenceModule,
    CallsModule,
    AuditModule,
    PolicyModule,
    AuthModule,
    UsersModule,
    ClientsModule,
    AssignmentsModule,
    DepartmentsModule,
    ConversationsModule,
    MessagesModule,
    WhatsappModule,
    RealtimeModule,
    AttachmentsModule,
    GroupsModule,
    StatusModule,
    OversightModule,
  ],
  // CallsModule is @Global so RealtimeGateway can inject CallsService for
  // signalling without a circular module import.
  controllers: [HealthController],
  providers: [
    // Order matters: rate-limit, then authenticate (attaches req.user unless
    // @Public()), then authorize against the resource/action policy.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    // Runs after the guards, so req.user is set and the tenant can be bound
    // to the async context for every query in the request.
    { provide: APP_INTERCEPTOR, useClass: TenantInterceptor },
  ],
})
export class AppModule {}
