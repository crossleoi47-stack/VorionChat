import { IsOptional, IsString, MinLength } from "class-validator";

export class ReassignDto {
  @IsString()
  clientId!: string;

  @IsString()
  newUserId!: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  reason?: string;
}
