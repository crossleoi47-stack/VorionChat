import { Global, Module } from "@nestjs/common";
import { PolicyService } from "./policy.service";
import { PolicyController } from "./policy.controller";
import { SupabaseModule } from "../supabase/supabase.module";

@Global()
@Module({
  imports: [SupabaseModule],
  controllers: [PolicyController],
  providers: [PolicyService],
  exports: [PolicyService],
})
export class PolicyModule {}
