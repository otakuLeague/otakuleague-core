import Link from 'next/link';
import { CONTACT_EMAIL } from '../shell/site-footer';
import type { LegalDocument } from './legal-document';

const mail = <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>;

export const TERMS_OF_USE: LegalDocument = {
  path: '/terms',
  title: 'Terms of use',
  description:
    'The rules for using OtakuLeague: your account, what you post, XP and leaderboards, and our responsibilities.',
  lastUpdated: '2026-11-12',
  summary: [
    'OtakuLeague is free. You can browse without an account.',
    'Be fair and be kind: no cheating the XP, no abuse, no scraping.',
    'What you write stays yours; you let us show it on the site.',
    'The service is in beta and may change; we do our best to keep it running.',
  ],
  sections: [
    {
      id: 'agreement',
      title: 'Using OtakuLeague',
      body: (
        <p>
          These terms apply when you use otakuleague.com. By creating an account
          you agree to them, and to how we handle your data in the{' '}
          <Link href="/privacy">privacy policy</Link>. Anyone can browse the
          site. If you are under 15, you need the consent of a parent or
          guardian to create an account.
        </p>
      ),
    },
    {
      id: 'account',
      title: 'Your account',
      body: (
        <ul>
          <li>One account per person, with an email address you can read.</li>
          <li>
            Keep your password to yourself; you are responsible for what is done
            with your account.
          </li>
          <li>
            Usernames must not impersonate someone, or be offensive or
            misleading. We may ask you to change one that is.
          </li>
        </ul>
      ),
    },
    {
      id: 'conduct',
      title: 'Fair use',
      body: (
        <>
          <p>Do not:</p>
          <ul>
            <li>
              harass other members, or post hateful, sexual or illegal content;
            </li>
            <li>
              inflate your XP or ranking with fake progress, scripts or several
              accounts;
            </li>
            <li>
              scrape the site, overload it, or try to get around its limits or
              security.
            </li>
          </ul>
        </>
      ),
    },
    {
      id: 'content',
      title: 'What you post',
      body: (
        <p>
          Your bio, photos and other content stay yours. You give us permission
          to store and show them on OtakuLeague for as long as they are on your
          account. Only post what you have the right to share. We may remove
          content that breaks these terms.
        </p>
      ),
    },
    {
      id: 'xp',
      title: 'XP and leaderboards',
      body: (
        <p>
          XP, levels and rankings are a game: they have no money value and
          cannot be sold or transferred. We may correct them when a bug or
          cheating distorts them, and season leaderboards reset every season.
        </p>
      ),
    },
    {
      id: 'anime-data',
      title: 'Anime information',
      body: (
        <p>
          Anime details and images come from third parties and belong to their
          owners; see <Link href="/data-sources">data sources</Link>. We show
          them as they are and cannot promise they are complete or correct.
          OtakuLeague shows no adult content.
        </p>
      ),
    },
    {
      id: 'service',
      title: 'The service',
      body: (
        <p>
          OtakuLeague is free and in beta. We may change, pause or remove
          features, and the site may sometimes be unavailable. Nothing in these
          terms limits the rights the law gives you as a consumer.
        </p>
      ),
    },
    {
      id: 'ending',
      title: 'Ending your account',
      body: (
        <p>
          You can ask us to delete your account at any time by writing to us. We
          may suspend or close an account that seriously or repeatedly breaks
          these terms; unless the law or safety prevents it, we tell you why
          first.
        </p>
      ),
    },
    {
      id: 'changes',
      title: 'Changes',
      body: (
        <p>
          If we change these terms in a way that matters, we update the date at
          the top of this page and say what changed.
        </p>
      ),
    },
    {
      id: 'law',
      title: 'Applicable law',
      body: (
        <p>
          These terms are governed by French law, and French courts have
          jurisdiction. This does not take away the protection that the
          mandatory consumer law of your country gives you if you live in the
          European Union.
        </p>
      ),
    },
    {
      id: 'legal-notice',
      title: 'Legal notice',
      body: (
        <>
          <p>
            <strong>Publisher</strong>: OtakuLeague is published by a private
            individual acting in a non-professional capacity. As article 6, III,
            2 of the French law n° 2004-575 of 21 June 2004 (LCEN) allows, the
            publisher has given their identification details to the host instead
            of publishing them here. Contact: {mail}.
          </p>
          <p>
            <strong>Host</strong>: Vercel Inc., 440 N Barranca Ave #4133,
            Covina, CA 91723, USA.
          </p>
        </>
      ),
    },
    {
      id: 'contact',
      title: 'Contact',
      body: <p>Questions about these terms: {mail}.</p>,
    },
  ],
};
