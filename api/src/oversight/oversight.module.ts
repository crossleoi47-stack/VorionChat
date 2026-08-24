import { Controller, Get, Module, Param, Query, Req } from "@nestjs/common";
import { OversightService } from "./oversight.service";
import { AuthenticatedRequest } from "../auth/authenticated-request";

@Controller("oversight")
class OversightController {
  constructor(private oversight: OversightService) {}

  @Get("conversations")
  conversations(@Req() req: AuthenticatedRequest) {
    return this.oversight.conversations(req.user!);
  }

  @Get("conversations/:id")
  read(@Param("id") id: string, @Req() req: AuthenticatedRequest) {
    return this.oversight.readConversation(id, req.user!);
  }

  @Get("anomalies")
  anomalies(@Query("days") days: string, @Req() req: AuthenticatedRequest) {
    return this.oversight.anomalies(req.user!, days ? Number(days) : 7);
  }
}

@Module({
  controllers: [OversightController],
  providers: [OversightService],
})
export class OversightModule {}
