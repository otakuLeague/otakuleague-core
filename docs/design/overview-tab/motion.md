# Overview tab (OTA-99): behaviour, motion, accessibility

Mockups: `mockup-Main.html` (Frieren: finished, trailer, spoilers hidden), `mockup-Airing.html` (ONE PIECE: airing countdown, no trailer, long synopsis expanded, spoilers shown), `mockup-Empty.html` (edge cases: no synopsis, no streaming links, every tag a spoiler), `mockup-Loading.html` (skeletons + one section failed). Each is responsive: `shots/` has 1440 and 390 px. Styles: `overview.css` on top of the tokens, components and `../global-shell/shell.css`. Data from the recorded AniList fixtures in `apps/api/src/anime/sources/fixtures/`; cast, music and recommendations are placeholders (no fixture has them yet).

## Structure
- **Desktop:** main column = what helps decide (Next episode, Synopsis, Trailer, Main characters, Related, Latest openings and endings, Recommendations); 340 px side column = facts (Score, Where to watch, Details + genres, Tags, Other titles). The side column is not sticky: it is often taller than the viewport.
- **Mobile (< 900 px):** one column in DOM order: the main column, then the facts. No CSS reordering, so visual, reading and focus order match (WCAG 1.3.2 / 2.4.3). The countdown sits at the top of the main column for that reason. Characters show 3, stacked.
- Each preview has a "→" link to its tab (Cast, Related, Music, Stats, Community). Previews never paginate: the tab does.

## Behaviour
- **Synopsis:** clamped to 5 lines with a fade; "Read more"/"Show less" toggles `aria-expanded` on the button, which controls the synopsis wrapper. Server-rendered, no measuring: the button renders when the text is longer than ~350 characters, so nothing shifts after hydration and it works without JS. Source line kept ("Source: Crunchyroll"): attribution is part of the text. Missing synopsis: dashed empty box, the section stays.
- **Trailer:** a poster button (CSS gradient from the cover colour, no YouTube thumbnail, so no third-party request before the click). A client component sets the `youtube-nocookie.com` iframe `src` only on click, with `allow="autoplay; fullscreen"`, and moves focus into it. Needs CSP `frame-src https://www.youtube-nocookie.com`. After the click Google does get the request; the note under the poster says so. No trailer: the section is not rendered.
- **Next episode:** only for `RELEASING` with `nextAiringEpisode`. Server renders the absolute date in UTC; the client swaps in the viewer's time zone and the days/hours/minutes countdown (no hydration mismatch). Ticks once a minute (no seconds, no live region). At zero: "Episode N is out" until the next revalidation.
- **Where to watch:** `externalLinks` of type STREAMING, as AniList gives them (site + url, no region or language data). One honest note: availability depends on your country. No region filter in v1 (would need a new data source, see open questions). None: empty box with the official-site link when there is one. External links open in a new tab, `rel="noopener noreferrer"`, with an off-screen "(opens Crunchyroll)".
- **Tags:** top 10 by rank, "Show all N tags" (`aria-expanded`, `aria-controls`) expands in place. Spoiler tags are blurred chips (`ol-chip--spoiler`, `aria-pressed`). Hidden, the accessible name is "Spoiler tag, hidden. Press to reveal" so a screen reader does not read the spoiler; revealed, the name is the tag itself. If every visible tag is a spoiler, a line says so.
- **Spoiler switch ("Show spoilers"):** one `role="switch"` preference for the whole site, not per anime. It reveals spoiler tags here and, on other tabs, spoiler character roles and descriptions (Cast), spoiler relation notes (Related), spoiler-flagged episode titles (Episodes). Stored in a cookie (readable at render, no flash of hidden state), then in the user's settings once accounts exist (OTA-139). Default off.
- **Other titles:** romaji, native (`lang="ja"`), first synonym, then "N more synonyms" (`aria-expanded`, `aria-controls`) expands.
- **Loading:** the hero and tabs come from the layout; each Overview section streams on its own (Suspense per section) with a skeleton of its final size. **Error:** a failing section shows `ol-state--error` with Retry inside that section only; the rest of the page renders.
- Missing fields in Details hide their row (no "Unknown"). Airing shows "1180 so far" episodes and "– now".

## Motion
| What | Trigger | Property | Duration / easing |
| --- | --- | --- | --- |
| Synopsis expand | Read more | none (instant; animating height is layout) | — |
| Trailer play button | hover / press | `transform: scale(1.06 / 0.97)` | `--dur-press`, `--ease-enter` |
| Spoiler chip reveal | press | `text-shadow`/`color` swap, instant | — |
| Spoiler switch thumb | toggle | `transform: translateX(16px)`, track `background-color` | `--dur-press`, `--ease-enter` |
| Recommendation card | hover / focus | existing `ol-anime-card` lift | existing tokens |
| Countdown | each minute | text swap, no animation | — |

No entrance animation for sections: they stream in at their skeleton's size, so nothing moves. `prefers-reduced-motion: reduce` removes every transition above.

## Accessibility check
- Text contrast: body ink and muted on surface pass 4.5:1 with the OTA-91 tokens (dark: muted 6.6:1 on `--surface`, 6.0:1 on `--surface-2`; `--accent-ink` 9.2:1; `--bad` 6.8:1); accent links use `--accent-ink`.
- Focus: every link, chip, switch and button has a 2 px accent outline with offset.
- Mobile hit targets ≥ 44 px: "→" links, Read more, the switch and streaming rows (48 px). Chips are 28 px tall but spaced 8 px apart; tag links are a secondary path (the same filter exists on Discover).
- Nothing by colour alone: spoiler chips say "Spoiler", streaming tiles have names, score has its number.
- Headings: h1 title, h2 per section, landmarks: `main`, tab `nav`, `aside` "Key facts".
