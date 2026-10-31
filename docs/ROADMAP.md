# Roadmap to launch

**Launch: Mon 2026-12-28** · **Feature freeze: Tue 2026-12-15** · Buffer: Dec 29–31.
Budget: ~10 h/week = 4–5 sessions of ~2 h. Tickets live in Linear project **v1 Launch** (one milestone per week). `/roadmap` compares this file with Linear; the launch date never moves without an explicit decision recorded here.

**v1 goal:** everything the current otakuleague.com offers, rebuilt with the new design, fewer bugs and measurably faster pages.

## Weekly milestones

| Week | Dates | Milestone | Tickets |
|---|---|---|---|
| W1 | Nov 2–8 | Live skeleton: autopilot merged, beta.otakuleague.com live, anime page shell done | OTA-132, OTA-133*, OTA-134*, OTA-97 |
| W2 | Nov 9–15 | Design system v2, shell, anime Overview, search; designs for home and browse | OTA-150, OTA-151, OTA-152, OTA-99, OTA-100, OTA-96, OTA-98, OTA-153, OTA-154 |
| W3 | Nov 16–22 | Browse: Home, Seasonal, Rankings, Discover; auth design | OTA-135, OTA-136, OTA-137, OTA-155 |
| W4 | Nov 23–29 | Accounts; My List design | OTA-138, OTA-139, OTA-140, OTA-156 |
| W5 | Nov 30–Dec 6 | My List; profile/leaderboard design | OTA-141, OTA-142, OTA-157 (stretch OTA-143) |
| W6 | Dec 7–13 | Profile, XP, leaderboard; settings/legal design | OTA-144, OTA-145, OTA-146, OTA-158 |
| W7 | Dec 14–20 | **Freeze Dec 15.** Hardening, legal pages, bug bash | OTA-147, OTA-148 |
| W8 | Dec 21–27 | Launch prep, DNS cutover Dec 28 | OTA-149 |

\* needs Farouk for account setup (~15 min each); the autopilot does the config-as-code part.

**Who builds:** the autopilot (scheduled cloud runs, `docs/AUTOPILOT.md`) works through the tickets in dependency order: every "Design:" ticket blocks its "Build:" ticket in Linear. Farouk's ~10 h/week go to reviewing PRs, taste changes and the human-only steps.

## Cut line
**Above (v1):** catalog (anime page shell + Overview, search, home, seasonal, rankings, discover), accounts, My List, XP/levels, public profile, leaderboard, legal/FAQ/contact.

**Below (after launch), in this order if time appears:** MAL import (OTA-143) → Episodes tab (OTA-101–103) → Cast tab (OTA-104–106) → achievements → Related/Music/Stats/Community tabs → quests, friends, notifications, list comparator, manga (old site's roadmap).

**First cuts if a week slips** (decide with `/roadmap`, record here): Discover page (keep Seasonal + Rankings) → onboarding wizard (keep username only) → profile stats → leaderboard podium styling.

## Risks
- **Data terms (ADR 0006):** AniList's terms prohibit use in competing list/tracker services and cap free commercial use. Parked by decision until there is a product (OTA-127, OTA-128); revisit before monetising. Kill switches exist per source.
- **Scope vs time:** ~80 hours for parity. Any week over budget triggers a cut, not a later launch.
- **Old accounts:** decide in OTA-149 whether to migrate old Supabase users.

## Decisions log
- 2026-10-31: plan created; hosting ADR 0009; workflow ADR 0010; visual/motion ADR 0011; design track and autopilot added; parity inventory in docs/PARITY.md.
