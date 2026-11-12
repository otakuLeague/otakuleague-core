# Auth and onboarding design (OTA-155)

Mockups for `/auth` (sign in, sign up), forgot/reset password, email confirmation, the sign-in prompt dialog and `/onboarding`. Each file shows the main screen full size, then an "other states" board (errors, loading, rate limits, long content). Shared styles in `auth.css` on top of tokens.css and components.css; the banner and dialog backdrop reuse `../global-shell/shell.css`. Screenshots (1440 and 390) in `shots/`. Motion: `motion.md`.

## Direction
- Make getting in fast: one column, one primary action, Google first, the next step always obvious.
- Desktop: an angled showcase panel (Pierce logo as the home link, the home h1, drifting poster tiles) beside the form; phones drop it for a tinted top strip and the small logo link.
- Memorable moment: "Email confirmed" pops the check badge (spring), then straight to onboarding.
- Removed: banner and birthday onboarding steps (ticket trims 6 steps to 3: username if needed, avatar with crop, bio), the Welcome step, the full-page AuthWall (guests on account pages are redirected to sign in with `next`), and the `/sign-in` `/sign-up` flash redirects (become server 308s to `/auth?mode=`).

## Files and states
- `mockup-SignIn.html`: main; wrong credentials (401), 429 with countdown, submitting, Google cancelled, empty submit, light theme + "password updated".
- `mockup-SignUp.html`: main (username available, rules ticking); username checking / taken with suggestions / invalid / 20 chars; confirm mismatch, too short; submitting; email already registered (identical check-email screen); 429; 5xx.
- `mockup-Reset.html`: forgot main; generic "sent"; 429 (Retry-After); invalid email + sending; reset form; expired/used/invalid link; saving, saved, failed.
- `mockup-Email.html`: check your email (session-less, resend cooldown, longest email); resent; resend 429; verified (signed in, to onboarding); expired link (resend by email); already confirmed; unconfirmed-new-email banner under the real global-shell header (not built in v1 unless email change is scoped: PARITY has no email change).
- `mockup-Modal.html`: sign-in prompt over an anime page (bottom sheet on phones); long title; pending add completed toast; other gated actions.
- `mockup-Onboarding.html`: step 2 avatar crop (main); step 1 username (Google user); avatar empty; file too big; bio at 292/300; saving + failed; done; "Step 1 of 2" variant for email sign-ups with the skip toast.

## Decisions
- **No account enumeration.** Sign-in failure is one message for unknown account, wrong password and Google-only account. Forgot password always shows the same "if it belongs to an account" success. Sign-up with an existing email shows the identical "check your email" screen and mails the owner instead. Rate limits count per IP and per identifier hash whether or not the account exists, and every response takes the same time (sign-in, sign-up, forgot, resend). Username availability stays live: usernames are public (`/u/name`).
- **Hard email verification** (coordinator decision, matches the old site). An email sign-up creates no session: "Check your email" is session-less and identical for new and existing addresses; Resend works by email (generic response, rate limited). Google accounts are verified by Google. Every failed sign-in shows the same generic error plus the link "Didn't get your confirmation email?" (always, never only for unconfirmed accounts), which opens the session-less resend.
- **Username reservation** (closes the sign-up oracle): a submitted sign-up reserves its username for 24 h whether or not an account was created, so "taken" after a submit says nothing about the email.
- **Verify links:** the link signs the user in and lands on the `/auth/verified` interstitial ("Email confirmed" → Set up my profile → `/onboarding`). A used link on a confirmed account shows "Already confirmed" (sign in); any other bad link shows "This link doesn't work anymore" with a resend-by-email field. Reset: one screen "This link doesn't work anymore" for expired, used and invalid. Lifetimes (24 h confirm, 1 h reset) and single-use are proposals to confirm in the OTA-138 spike.
- **No secrets or PII in URLs:** verify and reset tokens are exchanged on first hit and answered with a 303 to a clean URL, with `Referrer-Policy: no-referrer` on those responses. "Check your email" reads the address from a short-lived httpOnly flash cookie, never `?email=`. The OTA-138 ADR must record this.
- **429 copy** states the wait from `Retry-After` in rounded minutes and what still works; the mm:ss countdown sits on the disabled button, outside any live region, and only "You can try again now" is announced when it ends.
- **Live regions only for changes**: alerts after a submit use `role="alert"`/`"status"`; screens that load with their message (check email, verified, expired) move focus to their `h1` instead.
- "Forgot password?" sits after the password input (DOM and tab order); the sign-in/sign-up switch is only under the form.
- **Sign-in prompt** has no inline form: Google, "Sign in with email or username", "Create a free account", each carrying `next`. `next` is a same-origin path only (exactly one leading "/", anything else becomes "/"). Opening the dialog stores the pending add (anime id, default status Plan to watch) in sessionStorage; after sign-in the anime page reads it, adds the entry, clears it and a toast confirms. One dialog, other copy for rate/favourite.
- **Onboarding** is skippable from every step: "Skip for now" is a POST button that leaves at once (no confirm), marks onboarding complete so the guard never loops, and a toast says "Add a photo and bio any time in Settings". Username step only for accounts whose username was generated (Google), so email sign-ups see "Step 1 of 2". Avatar: JPG/PNG/WebP ≤ 5 MB, circular crop, saved as a 512 px square, initials by default.
- Logo: the Pierce small mark (geometry of `apps/web/public/brand/logo-pierce-mark-small.svg`, inline so it takes `--accent` / light `--accent-ink`) with the home wordmark gradient; the full Pierce logo is the desktop showcase's home link. No invented XP numbers (showcase chip is "Lv 12").
- Google button: the mockup's "G" is a placeholder; the build uses Google's official mark per its branding guidelines.
- Password rules (≥ 8 chars, a number or symbol) shown as a live checklist under the field, with confirm field; "Show" toggles on every password field.
- No Terms checkbox (parity); no light-specific layout (tokens only, one light card shown).

## Accessibility check
- Contrast (computed): muted on surface 6.6:1, accent-ink on ground 10:1, on-accent on accent 10:1, errors 7.4:1 (5.9:1 on alert tint), alert body text ≥ 5.3:1, banner text 6.0:1, gold chip 11.9:1; light theme muted 7.3:1, accent-ink 5.6:1, error 5.4:1. `--faint` (4.2:1) is now only used for placeholders and decorative borders; captions, divider, counters and step labels use `--muted`. Disabled buttons are exempt (3.6:1).
- Focus: 2 px outline in `--accent` (`--accent-ink` on the light theme) on buttons, links, crop area and drop zone, and the same colour as border + ring on fields (`:focus-within`). Placeholders use `--muted`.
- Hit targets at 390: inputs and primary buttons 48 px, Show toggles, dialog close, banner Resend/dismiss, zoom slider, "Forgot password?" and footer links 44 px.
- Not colour alone: errors carry "!" icon + text and `aria-invalid`; rules show a tick and hidden "done" text; progress shows "Step 2 of 3" + `aria-current="step"`; availability is text.
- Live regions: changes only. Availability and post-submit success use `role="status"`, failures `role="alert"`, every invalid field has `aria-describedby` to its message; messages present at page load (flash, check email, verified, expired) get no live region and focus goes to the `h1`; 429 states keep the countdown out of live regions and carry an empty `role="status"` node that says "You can try again now". Dialogs are Base UI (focus trap, Esc, focus return). Reduced motion: see motion.md.

## Open questions for Farouk
1. Should signing in to an unconfirmed account show the generic failure plus the resend link (current), or say "confirm your email first" once the password is proven correct?
2. Dropping banner and birthday from onboarding: should birthday (18+ content setting) be asked later in Settings only?
3. Should the sign-in prompt dialog include the email/password form inline (one less page) instead of linking to `/auth`?
