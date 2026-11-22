import { ApiProperty } from '@nestjs/swagger';
import {
  IDENTIFIER_MAX,
  PASSWORD_RAW_MAX,
  type SignUpRequest,
  USERNAME_PATTERN,
} from '@otakuleague/shared-types';
import {
  IsString,
  Matches,
  MaxLength,
  Validate,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { COMMON_PASSWORD_MESSAGE, isCommonPassword } from './common-passwords';
import {
  normaliseIdentifier,
  PASSWORD_MAX,
  PASSWORD_MIN,
} from './credential-rules';
import { PasswordMaxLength } from './sign-in.dto';
import {
  isEmailAddress,
  meetsSignUpPasswordRule,
  USERNAME_RULE_MESSAGE,
} from './sign-up-rules';

/**
 * The raw length first, so a long string is refused before normaliseIdentifier reads it. Shared
 * with EmailVerificationResendDto: resend accepts exactly the addresses sign-up does.
 */
@ValidatorConstraint({ name: 'emailAddress' })
export class EmailAddress implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return (
      typeof value === 'string' &&
      value.length <= IDENTIFIER_MAX &&
      isEmailAddress(normaliseIdentifier(value))
    );
  }

  defaultMessage(): string {
    return 'email must be an email address';
  }
}

/** Judges only strings within the raw bound: @IsString and PasswordMaxLength refuse the rest. */
@ValidatorConstraint({ name: 'signUpPassword' })
class SignUpPassword implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return (
      typeof value !== 'string' ||
      value.length > PASSWORD_RAW_MAX ||
      meetsSignUpPasswordRule(value)
    );
  }

  defaultMessage(): string {
    return `password must be at least ${PASSWORD_MIN} characters with a digit or symbol`;
  }
}

/**
 * ADR 0020 Addendum (1e-iii) decision 6: judges only strings within the raw bound, apart from the
 * length and digit rule, so a password can get both messages. Never for an existing password
 * (sign-in, confirm): refusing one there would lock a member out.
 */
@ValidatorConstraint({ name: 'notCommonPassword' })
class NotCommonPassword implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return (
      typeof value !== 'string' ||
      value.length > PASSWORD_RAW_MAX ||
      !isCommonPassword(value)
    );
  }

  defaultMessage(): string {
    return COMMON_PASSWORD_MESSAGE;
  }
}

/** Sign-up's rules (ADR 0020); no message echoes a value. */
export class SignUpDto implements SignUpRequest {
  @ApiProperty({
    description: '3 to 20 of A-Z, a-z, 0-9 and "_", unique in any case.',
    pattern: USERNAME_PATTERN.source,
    example: 'Frieren',
  })
  @IsString()
  @Matches(USERNAME_PATTERN, { message: USERNAME_RULE_MESSAGE })
  readonly username!: string;

  @ApiProperty({
    description: 'An ASCII email address; stored trimmed and lower-cased.',
    maxLength: IDENTIFIER_MAX,
    example: 'frieren@example.com',
  })
  @IsString()
  @MaxLength(IDENTIFIER_MAX)
  @Validate(EmailAddress)
  readonly email!: string;

  @ApiProperty({
    description: `${PASSWORD_MIN} to ${PASSWORD_MAX} characters (code points after NFC), with a digit or symbol, and not on the common-password list in any letter case.`,
    format: 'password',
  })
  @IsString()
  @Validate(PasswordMaxLength)
  @Validate(SignUpPassword)
  @Validate(NotCommonPassword)
  readonly password!: string;
}
