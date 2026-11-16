import { ApiProperty } from '@nestjs/swagger';
import type { SignInRequest } from '@otakuleague/shared-types';
import {
  IsNotEmpty,
  IsString,
  MaxLength,
  Validate,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';
import {
  IDENTIFIER_MAX,
  PASSWORD_MAX,
  passwordLength,
} from './credential-rules';

/** PostgreSQL cannot store or compare U+0000 in text (22021): refused here, never a 500. */
@ValidatorConstraint({ name: 'withoutNul' })
class WithoutNul implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === 'string' && !value.includes('\u0000');
  }

  defaultMessage(): string {
    return 'identifier must not contain U+0000';
  }
}

/** Counted like sign-up will count it (code points after NFC); the message never echoes the value. */
@ValidatorConstraint({ name: 'passwordMaxLength' })
class PasswordMaxLength implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === 'string' && passwordLength(value) <= PASSWORD_MAX;
  }

  defaultMessage(): string {
    return `password must be at most ${PASSWORD_MAX} characters`;
  }
}

/**
 * Upper bounds and non-empty only: the minimum length and the composition rules are sign-up's,
 * so a member whose password predates a rule can still sign in (ADR 0015).
 */
export class SignInDto implements SignInRequest {
  @ApiProperty({
    description: 'Email address or username, any letter case.',
    maxLength: IDENTIFIER_MAX,
    example: 'frieren@example.com',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(IDENTIFIER_MAX)
  @Validate(WithoutNul)
  readonly identifier!: string;

  @ApiProperty({
    description: `At most ${PASSWORD_MAX} characters (code points after NFC).`,
    format: 'password',
  })
  @IsString()
  @IsNotEmpty()
  @Validate(PasswordMaxLength)
  readonly password!: string;
}
