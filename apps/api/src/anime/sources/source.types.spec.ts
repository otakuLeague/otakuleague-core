import { describe, expect, it } from 'vitest';
import {
  BACKED_OFF_REASON,
  COOLING_DOWN_REASON,
  isQuietReason,
  QUEUE_FULL_REASON,
  refusedBeforeSending,
  SourceUnavailableError,
  UnusableAnswerError,
} from './source.types';

describe('refusedBeforeSending', () => {
  it.each<[string, SourceUnavailableError, boolean]>([
    [
      'queue full on the first attempt',
      new SourceUnavailableError('anilist', QUEUE_FULL_REASON),
      true,
    ],
    [
      'cooling down on the first attempt',
      new SourceUnavailableError('anilist', COOLING_DOWN_REASON),
      true,
    ],
    [
      'a backed-off entry',
      new SourceUnavailableError('anilist', BACKED_OFF_REASON),
      true,
    ],
    [
      'queue full on the retry after a 429',
      new SourceUnavailableError('anilist', QUEUE_FULL_REASON, true),
      false,
    ],
    [
      'cooling down on the retry after a 429',
      new SourceUnavailableError('anilist', COOLING_DOWN_REASON, true),
      false,
    ],
    // fail() in source-http.ts: requestSent stays false although the source was asked.
    ['an HTTP 5xx', new SourceUnavailableError('anilist', 'HTTP 503'), false],
    ['a timeout', new SourceUnavailableError('anilist', 'TimeoutError'), false],
    [
      'a 429 past our patience',
      new SourceUnavailableError('jikan', 'rate limited for 60000 ms'),
      false,
    ],
    [
      'a non-JSON answer',
      new SourceUnavailableError('jikan', 'response is not JSON'),
      false,
    ],
    [
      'an oversized body',
      new UnusableAnswerError('anilist', 'response body too large'),
      false,
    ],
    [
      'an answer without isAdult',
      new UnusableAnswerError('anilist', 'response has no usable Media'),
      false,
    ],
    [
      'a snapshot without its own id',
      new SourceUnavailableError('anilist', 'snapshot without its own id'),
      false,
    ],
    [
      'a reason that only starts like a cool-down',
      new SourceUnavailableError('anilist', 'cooling down'),
      false,
    ],
  ])('judges %s', (_, error, expected) => {
    expect(refusedBeforeSending(error)).toBe(expected);
  });
});

describe('isQuietReason', () => {
  it.each([
    [QUEUE_FULL_REASON, true],
    [COOLING_DOWN_REASON, true],
    [BACKED_OFF_REASON, false],
    ['HTTP 503', false],
  ])('treats %s as quiet: %s', (reason, expected) => {
    expect(isQuietReason(new SourceUnavailableError('anilist', reason))).toBe(
      expected,
    );
  });
});
