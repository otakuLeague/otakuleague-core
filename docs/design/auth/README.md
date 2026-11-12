# Auth and onboarding design (OTA-155)

Mockups for `/auth` (sign in, sign up), forgot/reset password, email confirmation, the sign-in prompt dialog and `/onboarding`. Each file shows the main screen full size, then an "other states" board (errors, loading, rate limits, long content). Shared styles in `auth.css` on top of tokens.css and components.css; the banner and dialog backdrop reuse `../global-shell/shell.css`. Screenshots (1440 and 390) in `shots/`. Motion: `motion.md`.

## Direction
- Make getting in fast: one column, one primary action, Google first, the next step always obvious.
- Desktop: an angled showcase panel (Pierce logo as the home link, the home h1, drifting poster tiles) beside the form; phones drop it for a tinted top strip and the small logo link.
- Memorable moment: "Email confirmed" pops the check badge and a +50 XP chip.
- Removed: banner and birthday onboarding steps (ticket trims 6 steps to 3: username if needed, avatar with crop, bio), the Welcome step, the full-page AuthWall (guests on account pages are redirected to sign in with `next`), and the `/sign-in` `/sign-up` flash redirects (become server 308s to `/auth?mode=`).

## Files and states
- `mockup-SignIn.html`: main; wrong credentials (401), 429 with countdown, submitting, Google cancelled, empty submit, light theme + "password updated".
- `mockup-SignUp.html`: main (username available, rules ticking); username checking / taken with suggestions / invalid / 20 chars; confirm mismatch, too short; submitting; email already registered (no reveal); 429; 5xx.
- `mockup-Reset.html`: forgot main; generic "sent"; 429 (Retry-After); invalid email + sending; reset form; expired/used/invalid link; saving, saved, failed.
- `mockup-Email.html`: check your email (resend cooldown, longest email); resent; resend 429; verified; expired link; already confirmed; unverified banner inside the shell (desktop and phone).
- `mockup-Modal.html`: sign-in prompt over an anime page (bottom sheet on phones); long title; pending add completed toast; other gated actions.
- `mockup-Onboarding.html`: step 2 avatar crop (main); step 1 username (Google user); avatar empty; file too big; bio at 292/300; saving + failed; done; skip confirm.

## Decisions
- **No account enumeration.** Sign-in failure is one message for unknown account, wrong password and Google-only account. Forgot password always shows the same "if it belongs to an account" success. Sign-up with an existing email shows the same "check your email" screen and mails the owner instead. Username availability stays live: usernames are public (`/u/name`).
- **Soft email verification.** Sign-up signs you in and shows "Check your email"; unverified users can browse and use their list but earn no XP and are left off the leaderboard; a banner under the header (not sticky, dismissible per session) offers Resend. So sign-in never needs an "unverified" error. (Old site blocked sign-in until confirmed: open question 1.)
- **429 copy** always states the wait from `Retry-After` (minutes, or a mm:ss countdown on the disabled button) and what still works.
- **Sign-in prompt** has no inline form: Google, "Sign in with email or username", "Create a free account", all carrying `next` + `intent=add`; the add completes after auth and a toast confirms. One dialog, other copy for rate/favourite.
- **Onboarding** is skippable from every step ("Skip for now" with a confirm; marks onboarding complete so the guard never loops). Username step only for accounts whose username was generated (Google), so email sign-ups see "Step 1 of 2". Avatar: JPG/PNG/WebP ≤ 5 MB, circular crop, saved as a 512 px square, initials by default.
- Google button: the mockup's "G" is a placeholder; the build uses Google's official mark per its branding guidelines.
- Password rules (≥ 8 chars, a number or symbol) shown as a live checklist under the field, with confirm field; "Show" toggles on every password field.
- No Terms checkbox (parity); no light-specific layout (tokens only, one light card shown).

## Accessibility check
- Contrast (computed): muted on surface 6.6:1, accent-ink on ground 10:1, on-accent on accent 10:1, errors 7.4:1 (5.9:1 on alert tint), alert body text ≥ 5.3:1, banner text 6.0:1, gold chip 11.9:1; light theme muted 7.3:1, accent-ink 5.6:1, error 5.4:1. `--faint` (4.2:1) is now only used for placeholders and decorative borders; captions, divider, counters and step labels use `--muted`. Disabled buttons are exempt (3.6:1).
- Focus: 2 px accent outline (buttons, links, crop area, drop zone) and an accent border + ring on fields (`:focus-within`).
- Hit targets at 390: inputs and primary buttons 48 px, Show toggles, dialog close, banner Resend/dismiss, zoom slider, "Forgot password?" and footer links 44 px.
- Not colour alone: errors carry "!" icon + text and `aria-invalid`; rules show a tick and hidden "done" text; progress shows "Step 2 of 3" + `aria-current="step"`; availability is text.
- Live regions: availability and success use `role="status"`, failures `role="alert"`; dialogs are Base UI (focus trap, Esc, focus return). Reduced motion: see motion.md.

## Open questions for Farouk
1. Soft verification OK (sign in before confirming, no XP or leaderboard until confirmed), or block sign-in until the email is confirmed like the old site?
2. Dropping banner and birthday from onboarding: should birthday (18+ content setting) be asked later in Settings only?
3. Should the sign-in prompt dialog include the email/password form inline (one less page) instead of linking to `/auth`?
