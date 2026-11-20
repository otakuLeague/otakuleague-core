import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';
import { USERNAME_PATTERN, USERNAME_RULE_MESSAGE } from './sign-up-rules';

/**
 * ADR 0020 Addendum (1e-iii) decision 2: sign-up's username rule and message, so a malformed,
 * missing or repeated `username` (an array) is 400 VALIDATION_FAILED before any counter, never
 * `{ available: false }`. An unknown parameter is refused by the validation pipe.
 */
export class UsernameAvailabilityQueryDto {
  @ApiProperty({
    description:
      '3 to 20 of A-Z, a-z, 0-9 and "_"; compared in any letter case.',
    pattern: USERNAME_PATTERN.source,
    example: 'Frieren',
  })
  @IsString()
  @Matches(USERNAME_PATTERN, { message: USERNAME_RULE_MESSAGE })
  readonly username!: string;
}
