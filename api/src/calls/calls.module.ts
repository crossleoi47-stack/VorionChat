import { Global, Module } from "@nestjs/common";
import { CallsService } from "./calls.service";
import { CallsController } from "./calls.controller";
import { SupabaseModule } from "../supabase/supabase.module";

@Global()
@Module({
  imports: [SupabaseModule],
  controllers: [CallsController],
  providers: [CallsService],
  exports: [CallsService],
})
export class CallsModule {}
