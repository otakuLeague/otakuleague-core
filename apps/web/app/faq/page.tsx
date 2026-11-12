import type { Metadata } from 'next';
import { CONTACT_HREF, DISCORD_URL } from '../../src/shell/site-footer';
import { EXTERNAL_LINK, FAQ_ENTRIES, NewTabMark } from './faq-entries';
import { FaqDeepLink } from './faq-deep-link';
import '../styles/info.css';

export const metadata: Metadata = {
  title: 'About us',
  description:
    'What OtakuLeague is, what is coming, how XP works, how to report a bug, and whether it is free.',
  alternates: { canonical: '/faq' },
};

export default function FaqPage() {
  return (
    <main className="in-page">
      <header className="in-hero">
        <p className="ol-label in-kicker">About us</p>
        <h1>
          Anime tracking that <em>feels like a game.</em>
        </h1>
        <p className="in-lede">
          Five quick answers: what OtakuLeague is, where it’s going, and how to
          reach the person building it.
        </p>
      </header>
      <div className="in-faq__grid">
        <aside className="in-founder" aria-label="A note from the founder">
          <p>
            “My watchlist lived in four apps and none of them made it fun.
            OtakuLeague is my fix: one place to track, rank and level up. It’s a
            one-person project built in the open, so if something’s broken or
            missing, tell me.”
          </p>
          <div className="in-founder__sig">
            <span className="in-founder__mark" aria-hidden="true">
              OL
            </span>
            <div>
              <b>The founder</b>
              Building OtakuLeague solo
            </div>
          </div>
        </aside>
        <div className="in-acc">
          {FAQ_ENTRIES.map((entry, index) => (
            <details
              key={entry.id}
              className="in-q"
              name="faq"
              id={entry.id}
              open={index === 0}
            >
              <summary>
                <span className="in-q__n" aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <h2 className="in-q__t">{entry.question}</h2>
                <span className="in-q__i" aria-hidden="true" />
              </summary>
              <div className="in-q__a">{entry.answer}</div>
            </details>
          ))}
        </div>
      </div>
      <section className="in-cta" aria-label="Still have a question?">
        <a href={CONTACT_HREF}>
          <span className="in-ico" data-tone="accent" aria-hidden="true">
            ✉
          </span>
          <span>
            <b>Write to us</b>
            Questions, bugs, ideas, partnerships
          </span>
          <span className="in-cta__arrow" aria-hidden="true">
            →
          </span>
        </a>
        <a href={DISCORD_URL} {...EXTERNAL_LINK}>
          <span className="in-ico" data-tone="brand" aria-hidden="true">
            Dc
          </span>
          <span>
            <b>
              Join the Discord
              <NewTabMark />
            </b>
            Chat with other fans and follow what ships
          </span>
          <span className="in-cta__arrow" aria-hidden="true">
            →
          </span>
        </a>
      </section>
      <FaqDeepLink />
    </main>
  );
}
