import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { signInAction } from './sign-in-action';
import { SignInForm } from './sign-in-form';

const mocks = vi.hoisted(() => ({
  signInAction: vi.fn<typeof signInAction>(),
}));
vi.mock('./sign-in-action', () => ({ signInAction: mocks.signInAction }));

const IDENTIFIER = 'kaito_tanaka';
const PASSWORD = 'never-keep-this-password';

function fieldValue(container: HTMLElement, name: string): string | undefined {
  return container.querySelector<HTMLInputElement>(`input[name="${name}"]`)
    ?.value;
}

describe('SignInForm', () => {
  afterEach(() => {
    cleanup();
    vi.resetAllMocks();
  });

  it('posts the typed fields and the extra ones once, then keeps only the identifier after a failure', async () => {
    mocks.signInAction.mockResolvedValue({ kind: 'invalid_credentials' });
    const { container } = render(
      <SignInForm>
        <input type="hidden" name="next" value="/season" />
      </SignInForm>,
    );

    fireEvent.change(screen.getByLabelText('Email or username'), {
      target: { value: IDENTIFIER },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: PASSWORD },
    });
    fireEvent.click(screen.getByRole('button'));
    await screen.findByRole('alert');

    expect(mocks.signInAction).toHaveBeenCalledTimes(1);
    const [previousState, formData] = mocks.signInAction.mock.calls[0] ?? [];
    expect(previousState).toEqual({ kind: 'idle' });
    expect([...(formData?.entries() ?? [])]).toEqual([
      ['identifier', IDENTIFIER],
      ['password', PASSWORD],
      ['next', '/season'],
    ]);
    expect(fieldValue(container, 'identifier')).toBe(IDENTIFIER);
    expect(fieldValue(container, 'password')).toBe('');
    expect(fieldValue(container, 'next')).toBe('/season');
  });
});
