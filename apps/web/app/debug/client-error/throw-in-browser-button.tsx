'use client';

export function ThrowInBrowserButton() {
  return (
    <button
      type="button"
      onClick={() => {
        throw new Error('Deliberate test error from the browser (OTA-79)');
      }}
    >
      Throw an error in the browser
    </button>
  );
}
