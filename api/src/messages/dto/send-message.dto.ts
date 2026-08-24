import { IsIn, IsInt, IsOptional, IsString, MinLength, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

class AttachmentDescriptorDto {
  @IsString()
  storageKey!: string;

  @IsString()
  mimeType!: string;

  @IsInt()
  sizeBytes!: number;

  @IsString()
  checksum!: string;

  @IsOptional()
  @IsString()
  originalName?: string;
}

export class SendMessageDto {
  // Body is optional when an attachment carries the content (e.g. a bare
  // voice note); at least one of body/attachment is enforced in the service.
  @IsOptional()
  @IsString()
  @MinLength(1)
  body?: string;

  @IsOptional()
  @IsString()
  replyToId?: string;

  @IsOptional()
  @IsIn(["TEXT", "IMAGE", "DOCUMENT", "VOICE"])
  type?: "TEXT" | "IMAGE" | "DOCUMENT" | "VOICE";

  @IsOptional()
  @ValidateNested()
  @Type(() => AttachmentDescriptorDto)
  attachment?: AttachmentDescriptorDto;
}
