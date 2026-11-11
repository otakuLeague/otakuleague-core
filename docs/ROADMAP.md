# Roadmap to launch

**Launch: Mon 2026-11-30** · **Feature freeze: Fri 2026-11-27** · December: new features (OTA-164; was Dec 28).
The autopilot builds; Farouk's time goes to reviews and human-only steps. Tickets live in Linear project **v1 Launch** (one milestone per stage). `/roadmap` compares this file with Linear; the launch date never moves without an explicit decision recorded here.

**v1 goal:** everything the current otakuleague.com offers, rebuilt with the new design, fewer bugs and measurably faster pages.

## Weekly milestones

| Stage | Target | Milestone | Tickets |
|---|---|---|---|
| W1 | Nov 12 | Live skeleton: autopilot, beta.otakuleague.com live (done Nov 11), anime page shell, real-page screenshots | OTA-132, OTA-133, OTA-134, OTA-97, OTA-161, OTA-162, OTA-163 |
| W2 | Nov 15 | Design system v2, shell, anime Overview, search; designs for home and browse | OTA-150, OTA-151, OTA-152, OTA-99, OTA-100, OTA-96, OTA-98, OTA-153, OTA-154, OTA-160 |
| W3 | Nov 18 | Browse: Home, Seasonal, Rankings, Discover; auth design | OTA-135, OTA-136, OTA-137, OTA-155 |
| W4 | Nov 22 | Accounts; My List design | OTA-138, OTA-139, OTA-140, OTA-156 |
| W5 | Nov 25 | My List; profile/leaderboard design | OTA-141, OTA-142, OTA-157 |
| W6 | Nov 28 | **Freeze Nov 27.** Profile, XP, leaderboard; settings/legal design | OTA-144, OTA-145, OTA-146, OTA-158 |
| W7 | Nov 29 | Hardening, legal pages, bug bash | OTA-147, OTA-148 |
| W8 | Nov 30 | DNS cutover of otakuleague.com | OTA-149 |


**Who builds:** the autopilot (scheduled cloud runs, `docs/AUTOPILOT.md`) works through the tickets in dependency order: every "Design:" ticket blocks its "Build:" ticket in Linear. Farouk's ~10 h/week go to reviewing PRs, taste changes and the human-only steps.

## Cut line
**Above (v1):** catalog (anime page shell + Overview, search, home, seasonal, rankings, discover), accounts, My List, XP/levels, public profile, leaderboard, legal/FAQ/contact.

**December (after launch), in this order:** MAL import (OTA-143) → Episodes tab (OTA-101–103) → Cast tab (OTA-104–106) → achievements → Related/Music/Stats/Community tabs → quests, friends, notifications, list comparator, manga (old site's roadmap).

**First cuts if a week slips** (decide with `/roadmap`, record here): Discover page (keep Seasonal + Rankings) → onboarding wizard (keep username only) → profile stats → leaderboard podium styling.

## Risks
- **Data terms (ADR 0006):** AniList's terms prohibit use in competing list/tracker services and cap free commercial use. Parked by decision until there is a product (OTA-127, OTA-128); revisit before monetising. Kill switches exist per source.
- **Scope vs time:** 19 days for ~27 tickets (~2.5 merged PRs a day). The plan's usage limit and PRs waiting on Farouk are the bottlenecks. Any stage that slips triggers a cut, not a later launch.
- **Old accounts:** decide in OTA-149 whether to migrate old Supabase users.

## Decisions log
- 2026-10-31: plan created; hosting ADR 0009; workflow ADR 0010; visual/motion ADR 0011; design track and autopilot added; parity inventory in docs/PARITY.md.
- 2026-11-11: launch moved to Nov 30 so December can go to new features (OTA-164); MAL import out of v1; beta.otakuleague.com live (Railway + Vercel, repo made public for Vercel Hobby).
