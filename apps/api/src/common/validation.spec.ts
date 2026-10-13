import type { ValidationError } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { toValidationIssues } from './validation';

function validationError(
  property: string,
  constraints?: Record<string, string>,
  children: ValidationError[] = [],
): ValidationError {
  return { property, constraints, children };
}

describe('toValidationIssues', () => {
  it('returns no issues for no errors', () => {
    expect(toValidationIssues([])).toEqual([]);
  });

  it('returns one issue per constraint message', () => {
    const issues = toValidationIssues([
      validationError('title', {
        isString: 'title must be a string',
        isNotEmpty: 'title should not be empty',
      }),
    ]);

    expect(issues).toEqual([
      { field: 'title', message: 'title must be a string' },
      { field: 'title', message: 'title should not be empty' },
    ]);
  });

  it('uses a dotted path for nested fields and array indexes', () => {
    const issues = toValidationIssues([
      validationError('studio', undefined, [
        validationError('name', { isString: 'name must be a string' }),
      ]),
      validationError('tags', undefined, [
        validationError('0', { isString: 'each tag must be a string' }),
      ]),
    ]);

    expect(issues).toEqual([
      { field: 'studio.name', message: 'name must be a string' },
      { field: 'tags.0', message: 'each tag must be a string' },
    ]);
  });

  it('does not mutate the input errors', () => {
    const errors = [validationError('title', { isString: 'x' })];
    const snapshot = structuredClone(errors);

    toValidationIssues(errors);

    expect(errors).toEqual(snapshot);
  });
});
