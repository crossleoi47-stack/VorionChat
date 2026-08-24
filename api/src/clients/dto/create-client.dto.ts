import { IsEmail, IsOptional, IsPhoneNumber, IsString, MinLength } from "class-validator";

export class CreateClientDto {
  @IsString()
  @MinLength(1)
  displayCode!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  org?: string;

  @IsPhoneNumber()
  phoneE164!: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}
