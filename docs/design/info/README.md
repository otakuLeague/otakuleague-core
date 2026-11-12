# About/FAQ, contact and legal design (OTA-158)

Mockups for `/faq` ("About us"), `/contact` and the legal template used by `/privacy`, `/terms` and `/data-sources` (OTA-147). Settings is in `../settings/`. Open the `mockup-*.html` files in a browser; screenshots at 1440 and 390 px in `shots/`. Motion: `motion.md`. Styles: `info.css` on top of `tokens.css`, `components.css`, `../global-shell/shell.css`, `../auth/auth.css` (fields, alerts) and `../profile/profile.css` (avatar, phone frames, build notes).

| File | Shows |
| --- | --- |
| `mockup-Faq.html` | About us: hero, founder note, 5-question accordion (first open), contact and Discord cards; guest header |
| `mockup-Contact.html` | Contact form filled in (signed in, email prefilled), other ways to reach us; board: empty submit (linked error summary), sending (read-only fields), sent, 5xx, 429, submitted with a subject over 200 |
| `mockup-Legal.html` | Legal template with the privacy policy: sibling tabs, last-updated date, sticky numbered TOC, the short version, anchor headings, processor and cookie tables |
| `mockup-Light.html` | Same template in the light theme as `/data-sources` |
| `mockup-Mobile.html` | 390 px: FAQ, contact errors, contact sent, privacy with collapsed and open TOC (tables as cards), data sources light |

## Direction
- FAQ: answer the five questions fast and put a face on the project (founder note); end on the two ways to reach us.
- Contact: one short form, nothing lost on failure, other channels always visible.
- Legal: long-form reading first: 68ch measure, 17 px / 1.72, numbered sections, a "short version" up top, every heading linkable.
- Memorable moment: the FAQ's angled number plates (the profile level-plate slash) light up in the brand gradient when an answer opens.
- Removed: the contact success/error toasts (the result is now in place: the form becomes a "Message sent" panel, errors keep the text), the separate Cookies footer link and page (only essential cookies exist, so the cookie notice is a section of the privacy policy and there is no banner).

## Decisions
- **FAQ is a server component with native `<details name="faq">`**: exclusive accordion, works without JS, deep links `#q1`–`#q5` open their answer (a 5-line client effect sets `open` from the hash). No Base UI Accordion needed. Copy is founder voice (PARITY); the build adds the founder's name if Farouk wants it.
- **Contact form**: email, subject, message required, name optional (parity), single column so long emails stay readable. Limits from PARITY: subject 200 (soft: the counter turns red while typing, Send stays enabled; on submit the field gets "Keep the subject to 200 characters" and focus moves to it, so a paste is never silently cut), message 5,000 (hard `maxlength`). Signed-in users get their account email prefilled, editable. Validation on submit, then live; focus moves to the first invalid field, and an error summary (`role="alert"`) lists each invalid field as an in-page link to its input. Sent: the form is replaced and focus moves to "Message sent". 5xx and 429 keep every character. **Anti-spam (new)**: a hidden honeypot field and a per-IP-hash rate limit (the old route had none); no captcha (free, no third party).
- **Footer**: Legal column becomes Privacy, Terms, Data sources; the base line credits AniList, MyAnimeList and AnimeThemes. Socials: Discord, X, Instagram, TikTok, Facebook, each with a text label (aria-label in the footer, visible names on the contact page).
- **Legal template** (`/privacy`, `/terms`, `/data-sources`): sibling tabs, `h1`, "Last updated" `<time>`, reading time; a sticky numbered TOC on desktop (current section highlighted by a small IntersectionObserver island, optional: plain links work without it) and a collapsed "On this page" `<details>` on phones; numbered `h2` with an anchor "#" shown on hover/focus (always on touch); tables become one card per row on phones (`data-label`). Content is MDX or a typed content file per page, rendered by one `LegalPage` server component.
- **Privacy content** (placeholder, real facts from the ticket): processors Vercel, Railway, Sentry, Brevo, in the EU (France, Germany, Belgium: per-processor regions to confirm); session cookie `__Host-ol_session` (30 days idle, 180 max); short sign-in cookies `ol_flash`, `ol_signup`, `ol_verify`, `ol_reset`, `ol_oauth`; IP hashes ~48 h; unconfirmed sign-ups deleted after 24 h; argon2id; no email tracking; no cookie banner. Dashed "Note" boxes are build notes, never shipped.
- Liberties: hero headlines with a gradient phrase; founder note card; reading time; "Back to top"; Discord described as the fastest channel for bugs.

## Worst-case content (break-ui)
44-character email in the contact field and the sent panel (wraps, never truncated); 204-character subject; empty submit with three errors; `__Host-ol_session` and other cookie names in narrow table cells (no wrap on desktop, card rows on phones); long section titles in the TOC (wrap with their number); the full policy (about 4 min read: sticky TOC, measure kept); answers with lists and links.

## Accessibility check
- Contrast: tokens as elsewhere (muted 6.6:1 / 7.3:1, accent-ink 10:1 / 5.6:1, errors 7.4:1); legal body text is a 88 % ink mix (≥ 11:1 dark, ≥ 10:1 light); open-question number plate: `#12101a` on the violet→cyan gradient ≥ 6.9:1.
- Focus: 2 px `--accent-ink` outline on summaries, links, fields and buttons.
- Targets: 44 px on phones (summaries 64 px, TOC links, sibling tabs, socials, buttons).
- Not by colour alone: errors have "!" and text; counters print numbers; the current TOC item is bold with a bar; the open accordion has a −/+ icon and the native expanded state.
- Semantics: `<details>/<summary>` (native expanded state); form labels and `aria-describedby` for errors and counters; error summary `role="alert"`, sent heading focused; TOC `<nav>` with a labelled heading; tables have captions and `scope="col"`; `<time datetime>`.
- Reduced motion: `motion.md`.

## Build notes
- **OTA-145** (FAQ, contact): `/faq` static server page. `/contact` server page + a client form island; `POST /contact` (Nest) validates (email, subject ≤ 200, message ≤ 5,000, name ≤ 80, honeypot empty), rate-limits per IP hash (e.g. 3 per 10 min, 429 `TOO_MANY_MESSAGES` with `Retry-After`), sends through the email adapter to contact@otakuleague.com with reply-to, never logs the body. Errors use the standard envelope. Tests: idle, prefilled, empty submit, invalid email, too long, sending, sent, 5xx, 429.
- **OTA-147** (legal): one `LegalPage` component, content per page, `lastUpdated` per page; final copy reviewed by Farouk; confirm processor regions, DPAs, backup and Sentry retention, minimum age, controller identity; check AniList, MyAnimeList and AnimeThemes terms and attribution wording (ADR 0006). Static, no client JS except the optional TOC highlight. Tests: TOC links match headings, anchors unique, tables render, long content.
- Footer change (Privacy, Terms, Data sources) goes to the global shell build.

## Open questions for Farouk (whole OTA-158)
1. Username: OK to change it only in Settings (the edit-profile dialog from OTA-157 shows it read-only with a link), or keep it editable in both places?
2. Email change for password accounts asks the current password; should a Google-only account be able to change its email at all (its sign-in is tied to Google), or only add a password first?
3. Privacy policy facts to confirm before launch: controller identity and address, each processor's region, minimum age (13, 15 or 16), backup retention after deletion.
