import { Global, Module } from "@nestjs/common";
import { CallsService } from "./calls.service";
import { CallsController } from "./calls.controller";

@Global()
@Module({
  controllers: [CallsController],
  providers: [CallsService],
  exports: [CallsService],
})
export class CallsModule {}
