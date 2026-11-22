import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  type EmailVerificationConfirmRequest,
  type EmailVerificationResendRequest,
  IDENTIFIER_MAX,
} from '@otakuleague/shared-types';
import {
  IsNotEmpty,
  IsString,
  MaxLength,
  Validate,
  ValidateIf,
} from 'class-validator';
import { PASSWORD_MAX } from './credential-rules';
import { PasswordMaxLength } from './sign-in.dto';
import { EmailAddress } from './sign-up.dto';

/**
 * Upper bound on a token or bindingToken (ours are 43 characters). No pattern: a malformed token is
 * answered by the lookup (400 AUTH_TOKEN_INVALID), like an unknown one, never VALIDATION_FAILED.
 */
export const AUTH_TOKEN_RAW_MAX = 128;

/** Optional means absent: an explicit null is refused, never read as "no binding". */
const present = (_: object, value: unknown): boolean => value !== undefined;

/** ADR 0020 Addendum (1e-ii). Bounds only; no message echoes a value. */
export class EmailVerificationConfirmDto implements EmailVerificationConfirmRequest {
  @ApiProperty({
    description: 'The emailed token.',
    maxLength: AUTH_TOKEN_RAW_MAX,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(AUTH_TOKEN_RAW_MAX)
  readonly token!: string;

  @ApiPropertyOptional({
    description: 'The sign-up bindingToken this browser kept (`ol_signup`).',
    maxLength: AUTH_TOKEN_RAW_MAX,
  })
  @ValidateIf(present)
  @IsString()
  @IsNotEmpty()
  @MaxLength(AUTH_TOKEN_RAW_MAX)
  readonly bindingToken?: string;

  @ApiPropertyOptional({
    description: `The sign-up password, after confirmation_required. At most ${PASSWORD_MAX} characters.`,
    format: 'password',
  })
  @ValidateIf(present)
  @IsString()
  @IsNotEmpty()
  @Validate(PasswordMaxLength)
  readonly password?: string;
}

/**
 * ADR 0020 Addendum (1e-ii-b): sign-up's email rule (at most 254 raw characters, then the shape
 * after normaliseIdentifier), so a malformed address is 400 before any counter. No message
 * echoes the value.
 */
export class EmailVerificationResendDto implements EmailVerificationResendRequest {
  @ApiProperty({
    description:
      'The address signed up with; matched trimmed and lower-cased. The answer is the same for any address.',
    maxLength: IDENTIFIER_MAX,
    example: 'frieren@example.com',
  })
  @IsString()
  @MaxLength(IDENTIFIER_MAX)
  @Validate(EmailAddress)
  readonly email!: string;
}
