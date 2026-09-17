import { Module } from "@nestjs/common";
import { SupabaseService } from "./supabase.service";
import { SuperAdminBootstrapService } from "./super-admin-bootstrap.service";

@Module({
  providers: [SupabaseService, SuperAdminBootstrapService],
  exports: [SupabaseService],
})
export class SupabaseModule {}
