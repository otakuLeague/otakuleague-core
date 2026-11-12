# Leaderboard: motion (OTA-157)

A data page: calm, fast, transform and opacity only (ADR 0011/0012), tokens from `tokens.css`.

| Element | Trigger | Property | Duration / easing |
| --- | --- | --- | --- |
| Podium entrance | first paint of page 1, once per visit | each step `opacity` 0→1 + `translateY(16px)`→0, order 3rd, 2nd, 1st (80 ms stagger); crown `scale(0.6)`→1 last | `--dur-spring` / `--ease-spring` |
| #1 avatar ring | none (static glow) | n/a | n/a |
| Season switch, page change, search results | navigation | none: rows swap (server-rendered) | n/a |
| Season disclosure | open / close | `opacity` + `scale(0.97)`, origin top | open `--dur-enter`, close `--dur-exit` |
| Your-rank bar | appears when your row leaves the viewport (IntersectionObserver), hides when it enters | `opacity` + `translateY(12px)`→0 | `--dur-enter` / `--ease-enter`; exit `--dur-exit` |
| "N XP to pass" meter | first paint | `scaleX(0)`→`scaleX(p)` | `--dur-spring` / `--ease-spring` |
| Jump to my rank | click | navigates to your page; your row gets a one-time background flash (`opacity` of a pseudo-element 0→1→0) | 600 ms `--ease-move` |
| Row hover | hover (fine pointer) | background colour | `--dur-press` |
| Skeleton | loading | `.ol-skel` shimmer | 1.4 s; off with reduced motion |

Reduced motion: podium, bar and meter appear in place (opacity fade only, or none), no stagger, no crown scale, no row flash.

Performance: no animation library needed on this page (CSS transitions + one IntersectionObserver); no rank-change animations between visits (would need history we do not store).
