import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from "class-validator";
import { Role } from "@prisma/client";

export class CreateUserDto {
  @IsString()
  @MinLength(1)
  employeeCode!: string;

  /** Their sign-in identity — required for anyone created from now on. */
  @IsEmail({}, { message: "Enter a valid email address" })
  email!: string;

  @IsString()
  @MinLength(1)
  fullName!: string;

  @IsEnum(Role)
  role!: Role;

  @IsOptional()
  @IsString()
  departmentId?: string;
}
