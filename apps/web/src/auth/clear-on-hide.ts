/**
 * Ref callback for a password input: its cleanup empties the value when the input leaves the screen.
 * `cacheComponents` keeps a left route in a hidden `<Activity>`, which runs ref cleanups but keeps
 * the DOM, so a typed password would stay there. It also fires when a `Suspense` boundary above
 * shows its fallback again (the form is hidden then too). Module-level on purpose: a stable ref
 * identity means a re-render (a pending state, a new alert) never detaches it, so the value stays.
 * Under dev StrictMode the ref is detached and attached once more after mount, so a password typed
 * or autofilled before hydration is emptied in development only; production keeps it.
 */
export const clearOnHide = (input: HTMLInputElement) => () => {
  input.value = '';
};
