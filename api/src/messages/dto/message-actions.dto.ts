import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class ReactDto {
  /** Empty string removes the reaction — WhatsApp treats "react with nothing" as un-react. */
  @IsString()
  @MaxLength(8)
  emoji!: string;
}

export class EditMessageDto {
  @IsString()
  @MinLength(1)
  body!: string;
}

export class ForwardMessageDto {
  @IsString()
  toConversationId!: string;
}

export class ConversationStateDto {
  @IsOptional()
  @IsBoolean()
  archived?: boolean;

  @IsOptional()
  @IsBoolean()
  pinned?: boolean;

  @IsOptional()
  @IsBoolean()
  muted?: boolean;
}
