# Home page design (OTA-153)

Mockups for `/`, built by OTA-136. Open the `mockup-*.html` files in a browser (offline with fallback fonts, no JS); screenshots at 1440 and 390 px are in `shots/` (`node scripts/design/shots.mjs docs/design/home`). Motion, states and the accessibility check: `motion.md`.

- **LCP element: the hero `h1`.** Static text, never animated in; the logo is inline SVG and no image loads above the fold.
- Hero: "Calm night" with the Pierce logo (OTA-160). Two drifting gradient blobs, dot grid, floating logo with a sheen; transform/opacity only, paused (= the poster frame, `mockup-Poster.html`) until a small client island allows motion.
- Logo files: `apps/web/public/brand/logo-pierce.svg` (full mark, background-independent masks) for dark grounds, `logo-pierce-light.svg` (the light theme's darker stops) and `logo-pierce-mark-small.svg` (16 to 32 px, single teal for dark grounds). The favicon needs a light variant (`#0b6b59`) or the mark on a dark tile, since browser tab bars can be light. The React logo component (themeable gradient through `--hm-chroma-*`, header and footer mark) is part of OTA-136.
- Rows reuse the browse card and section row unchanged (`../browse/`); the global shell is reused, only its "O" placeholder mark becomes the Pierce small mark.
- Features describe what v1 ships (anime pages, search and lists, My List, XP and profile, season leaderboard); games, quizzes, friends, list comparator and manga are in the "Coming after launch" teaser only.
