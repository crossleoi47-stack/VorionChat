import { IsArray, IsString, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

class ReassignmentItem {
  @IsString()
  clientId!: string;

  @IsString()
  newUserId!: string;
}

export class OffboardDto {
  @IsString()
  userId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReassignmentItem)
  reassignments!: ReassignmentItem[];
}
