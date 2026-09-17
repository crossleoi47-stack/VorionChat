import { Module } from "@nestjs/common";
import { DepartmentsController } from "./departments.controller";
import { DepartmentsService } from "./departments.service";
import { SupabaseModule } from "../supabase/supabase.module";

@Module({
  imports: [SupabaseModule],
  controllers: [DepartmentsController],
  providers: [DepartmentsService],
})
export class DepartmentsModule {}
