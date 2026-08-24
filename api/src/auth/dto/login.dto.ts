import { IsEmail, IsOptional, IsString, MinLength } from "class-validator";

/**
 * Two accepted shapes:
 *   { email, password }                        ← what the sign-in screen sends
 *   { companyCode, employeeCode, password }    ← legacy, still honoured
 *
 * Email is globally unique, so it identifies the company on its own and the
 * person only types two things. The employee-code path stays for accounts
 * created before emails existed, and for any company that would rather issue
 * codes than addresses.
 */
export class LoginDto {
  @IsOptional()
  @IsEmail({}, { message: "Enter a valid email address" })
  email?: string;

  @IsOptional()
  @IsString()
  companyCode?: string;

  @IsOptional()
  @IsString()
  employeeCode?: string;

  @IsString()
  @MinLength(1)
  password!: string;

  @IsOptional()
  @IsString()
  deviceLabel?: string;
}
