import type { ReactNode } from 'react';
import {
  CONTACT_EMAIL,
  CONTACT_HREF,
  DISCORD_URL,
  ROADMAP_URL,
} from '../../src/shell/site-footer';

// The five questions of the old /faq (PARITY.md), founder voice.

export const EXTERNAL_LINK = {
  target: '_blank',
  rel: 'noopener noreferrer',
} as const;

/** The ↗ mark for sighted users, the same warning in words for screen readers. */
export function NewTabMark() {
  return (
    <>
      <span aria-hidden="true"> ↗</span>
      <span className="in-sr"> (opens in a new tab)</span>
    </>
  );
}

export interface FaqEntry {
  readonly id: string;
  readonly question: string;
  readonly answer: ReactNode;
}

export const FAQ_ENTRIES: readonly FaqEntry[] = [
  {
    id: 'q1',
    question: 'What is OtakuLeague?',
    answer: (
      <p>
        OtakuLeague is one home for everything you watch:{' '}
        <strong>
          track your anime, find the next one, and earn XP for it.
        </strong>{' '}
        Your list, your stats and a seasonal leaderboard live in the same place,
        so keeping up with a show feels like progress, not admin.
      </p>
    ),
  },
  {
    id: 'q2',
    question: 'What can I expect?',
    answer: (
      <>
        <p>
          Anime pages with what you need to decide, seasonal charts and
          rankings, a list that keeps up with you, and levels with a leaderboard
          that resets every season.
        </p>
        <p>
          Next: quizzes, games and more ways to play with other fans. The{' '}
          <a href={ROADMAP_URL} {...EXTERNAL_LINK}>
            public roadmap
            <NewTabMark />
          </a>{' '}
          shows what I’m building.
        </p>
      </>
    ),
  },
  {
    id: 'q3',
    question: 'How does it work?',
    answer: (
      <ul>
        <li>Browse freely, no account needed.</li>
        <li>Sign up (free) and add anime to your list as you watch.</li>
        <li>
          Progress earns XP. XP raises your level for good, and the XP you earn
          during a season ranks you on that season’s leaderboard.
        </li>
      </ul>
    ),
  },
  {
    id: 'q4',
    question: 'How do I report a bug?',
    answer: (
      <p>
        Tell me{' '}
        <strong>what you did, what you expected and what happened</strong> (a
        screenshot helps) at <a href={CONTACT_HREF}>{CONTACT_EMAIL}</a>, or post
        it on our{' '}
        <a href={DISCORD_URL} {...EXTERNAL_LINK}>
          Discord
          <NewTabMark />
        </a>
        . I read every report.
      </p>
    ),
  },
  {
    id: 'q5',
    question: 'Is it free?',
    answer: (
      <p>
        <strong>Yes.</strong> Everything you see today is free. Later I may add
        optional extras to help pay for the servers, but tracking, XP and the
        leaderboard are meant to stay free.
      </p>
    ),
  },
];
