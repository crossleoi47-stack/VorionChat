import { IsHexColor, IsIn, IsInt, IsOptional, IsString, MaxLength } from "class-validator";

export class CreateStatusDto {
  @IsOptional()
  @IsIn(["TEXT", "IMAGE", "VIDEO"])
  type?: "TEXT" | "IMAGE" | "VIDEO";

  /** Text body for a TEXT status, or the caption on media. */
  @IsOptional()
  @IsString()
  @MaxLength(700)
  body?: string;

  @IsOptional()
  @IsHexColor()
  backgroundColor?: string;

  @IsOptional()
  @IsString()
  storageKey?: string;

  @IsOptional()
  @IsString()
  mimeType?: string;

  @IsOptional()
  @IsInt()
  sizeBytes?: number;
}
