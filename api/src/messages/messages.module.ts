import { Module } from "@nestjs/common";
import { MessagesController } from "./messages.controller";
import { MessagesService } from "./messages.service";
import { ConversationsModule } from "../conversations/conversations.module";
import { WhatsappModule } from "../whatsapp/whatsapp.module";
import { RealtimeModule } from "../realtime/realtime.module";

@Module({
  imports: [ConversationsModule, WhatsappModule, RealtimeModule],
  controllers: [MessagesController],
  providers: [MessagesService],
})
export class MessagesModule {}
