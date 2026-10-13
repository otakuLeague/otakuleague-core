import {
  HttpStatus,
  ValidationPipe,
  type ValidationError,
} from '@nestjs/common';
import type { ValidationIssue } from '@otakuleague/shared-types';
import { ApiException } from './api.exception';

export function toValidationIssues(
  errors: readonly ValidationError[],
  parentField = '',
): ValidationIssue[] {
  return errors.flatMap((error) => {
    const field = parentField
      ? `${parentField}.${error.property}`
      : error.property;
    const issues = Object.values(error.constraints ?? {}).map((message) => ({
      field,
      message,
    }));
    return [...issues, ...toValidationIssues(error.children ?? [], field)];
  });
}

export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) =>
      new ApiException(HttpStatus.BAD_REQUEST, {
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed.',
        details: toValidationIssues(errors),
      }),
  });
}
