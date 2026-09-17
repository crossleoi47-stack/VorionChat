import { IsEmail, IsOptional, IsString, MinLength } from "class-validator";

export class CreateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  employeeCode?: string;

  /** Their sign-in identity — required for anyone created from now on. */
  @IsEmail({}, { message: "Enter a valid email address" })
  email!: string;

  @IsString()
  @MinLength(1)
  fullName!: string;

  @IsString()
  role!: string;

  @IsOptional()
  @IsString()
  departmentId?: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @IsString()
  status?: string;
}
