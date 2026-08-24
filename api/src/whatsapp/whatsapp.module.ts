import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { WhatsappController } from "./whatsapp.controller";
import { WhatsappService } from "./whatsapp.service";
import { WHATSAPP_PROVIDER } from "./whatsapp-provider.interface";
import { MockWhatsappProvider } from "./providers/mock-whatsapp.provider";
import { MetaWhatsappProvider } from "./providers/meta-whatsapp.provider";
import { RealtimeModule } from "../realtime/realtime.module";
import { WhatsappAccountsService } from "./whatsapp-accounts.service";
import { WhatsappAccountsController } from "./whatsapp-accounts.controller";

@Module({
  imports: [RealtimeModule],
  controllers: [WhatsappController, WhatsappAccountsController],
  providers: [
    WhatsappService,
    WhatsappAccountsService,
    MockWhatsappProvider,
    MetaWhatsappProvider,
    {
      provide: WHATSAPP_PROVIDER,
      useFactory: (config: ConfigService, mock: MockWhatsappProvider, meta: MetaWhatsappProvider) =>
        config.get<string>("WHATSAPP_PROVIDER") === "meta" ? meta : mock,
      inject: [ConfigService, MockWhatsappProvider, MetaWhatsappProvider],
    },
  ],
  exports: [WhatsappService],
})
export class WhatsappModule {}
