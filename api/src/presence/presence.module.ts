import { Global, Module } from "@nestjs/common";
import { PresenceService } from "./presence.service";
import { PresenceController } from "./presence.controller";
import { SupabaseModule } from "../supabase/supabase.module";

@Global()
@Module({
  imports: [SupabaseModule],
  controllers: [PresenceController],
  providers: [PresenceService],
  exports: [PresenceService],
})
export class PresenceModule {}
