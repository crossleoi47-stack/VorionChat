import { IsString } from "class-validator";

export class ReassignDto {
  @IsString()
  clientId!: string;

  @IsString()
  newUserId!: string;
}
