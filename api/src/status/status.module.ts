import { Module } from "@nestjs/common";
import { StatusController } from "./status.controller";
import { StatusService } from "./status.service";
import { RealtimeModule } from "../realtime/realtime.module";
import { PostgresModule } from "../postgres/postgres.module";

@Module({
  imports: [RealtimeModule, PostgresModule],
  controllers: [StatusController],
  providers: [StatusService],
})
export class StatusModule {}
