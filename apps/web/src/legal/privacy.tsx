import Link from 'next/link';
import { CONTACT_EMAIL } from '../shell/site-footer';
import type { LegalDocument } from './legal-document';
import { LegalTable } from './legal-page';

// Facts from ADR 0015 (auth, cookies, rate limits, Brevo), ADR 0009 (hosting) and the facts
// Farouk confirmed on 2026-11-12 (publisher, regions, retention, age); see docs/progress/OTA-147.md.
const mail = <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>;

export const PRIVACY_POLICY: LegalDocument = {
  path: '/privacy',
  title: 'Privacy policy',
  description:
    'What OtakuLeague collects, why, who processes it, which cookies we set and how to use your rights.',
  lastUpdated: '2026-11-12',
  summary: [
    'We collect what your account needs to work: email, username, your list and your XP. Nothing is sold, and there are no ads.',
    'Only essential cookies: one keeps you signed in, a few short ones carry sign-in steps. No cookie banner, because there is nothing to opt out of.',
    'Your data stays in the EU: the website’s functions run in Paris, our server and database in Amsterdam, error reports in Germany, and account emails go through Brevo in the EU.',
    'Write to us at any time and we delete your account and its data.',
  ],
  sections: [
    {
      id: 'who',
      title: 'Who we are',
      body: (
        <p>
          OtakuLeague (otakuleague.com) is published by a private individual,
          not a company, who is responsible for your data (the “controller”).
          The publisher’s details are with our host; see the{' '}
          <Link href="/terms#legal-notice">legal notice</Link>. Write to {mail}{' '}
          about anything in this policy.
        </p>
      ),
    },
    {
      id: 'collect',
      title: 'What we collect',
      body: (
        <>
          <h3>When you create an account</h3>
          <ul>
            <li>
              <strong>Email address</strong>: to sign in and to send account
              emails (confirmation, password reset).
            </li>
            <li>
              <strong>Username</strong>: public, it is your profile address.
            </li>
            <li>
              <strong>Password</strong>: stored only as an argon2id hash. We
              never store the password itself.
            </li>
          </ul>
          <h3>When you use the site</h3>
          <ul>
            <li>
              <strong>Your profile</strong>, if you fill it in: photo, banner,
              bio, birthday.
            </li>
            <li>
              <strong>Your list</strong>: anime, status, episodes, scores,
              favourites, and the XP they earn.
            </li>
            <li>
              <strong>Messages</strong>: what you write when you email us.
            </li>
          </ul>
          <h3>Automatically</h3>
          <p>
            To stop abuse (too many sign-in attempts, spam), we count attempts
            under <strong>keyed hashes</strong> of your IP address and of the
            email or username you sign in with, never the values themselves.
            When something crashes, an error report records what broke and on
            which page, without your password. Our sign-in logs carry your user
            ID only, never your email, IP address or password.
          </p>
        </>
      ),
    },
    {
      id: 'why',
      title: 'Why we use it',
      body: (
        <p>
          To run your account and the features you use (contract), to keep the
          service safe and working (legitimate interest), and to answer you when
          you write to us (legitimate interest). We do not sell your data, show
          ads or build advertising profiles. Opens and clicks on our emails are
          only counted anonymously, never tied to you.
        </p>
      ),
    },
    {
      id: 'processors',
      title: 'Who processes it',
      body: (
        <>
          <p>
            A few companies run parts of OtakuLeague for us. They only use your
            data to provide their service to us.
          </p>
          <LegalTable
            caption="Processors"
            columns={['Company', 'What they do', 'Data', 'Where']}
            rows={[
              [
                'Vercel',
                'Hosts the website',
                'Pages you request, IP address',
                'Functions run in Paris, France; pages are served from Vercel’s global network',
              ],
              [
                'Railway',
                'Runs our server and database',
                'Everything listed above',
                'Amsterdam, Netherlands (EU)',
              ],
              [
                'Sentry',
                'Error reports',
                'What broke, the page, your browser; no passwords',
                'Germany (Sentry’s EU data region)',
              ],
              [
                'Brevo',
                'Sends account emails',
                'Your email address and the email’s content (no preview of it is stored)',
                'EU (France, Germany, Belgium)',
              ],
            ]}
          />
        </>
      ),
    },
    {
      id: 'cookies',
      title: 'Cookies',
      body: (
        <>
          <p>
            We only set cookies the site needs to work or that you ask for, so
            there is no consent banner. None of them track you, here or on other
            sites.
          </p>
          <LegalTable
            caption="Cookies we set"
            columns={['Name', 'Why', 'How long']}
            rows={[
              [
                <code key="n">__Host-ol_session</code>,
                'Keeps you signed in',
                '30 days without a visit, 180 days at most',
              ],
              [
                <code key="n">ol_signup</code>,
                'Ties your sign-up to its confirmation email, so only your browser signs in from the link',
                '24 hours',
              ],
              [
                <code key="n">ol_flash</code>,
                'Shows a one-time message after a redirect (for example the address on “Check your email”)',
                '10 minutes',
              ],
              [
                <span key="n">
                  <code>ol_verify</code>, <code>ol_reset</code>
                </span>,
                'Hold the token of a confirmation or password-reset link once it is taken out of the address bar',
                '10 minutes',
              ],
              [
                <code key="n">ol-theme</code>,
                'Remembers the Light or Dark theme, only if you pick one',
                '1 year, or until you pick System',
              ],
            ]}
          />
        </>
      ),
    },
    {
      id: 'third-party',
      title: 'Images from our data sources',
      body: (
        <p>
          Anime cover images load straight from AniList’s servers (
          <code>s4.anilist.co</code>), or from MyAnimeList’s (
          <code>cdn.myanimelist.net</code>) when AniList has none, so your
          browser sends them your IP address and browser details when it shows
          them, as with any image on the web. Each handles them under its own
          privacy policy.
        </p>
      ),
    },
    {
      id: 'keep',
      title: 'How long we keep it',
      body: (
        <ul>
          <li>
            <strong>Your account</strong>: until you ask us to delete it. We
            then delete your profile, list, XP and sign-ins from our database
            straight away, except what the law requires us to keep; copies in
            our database backups expire within 30 days.
          </li>
          <li>
            <strong>Sign-ups never confirmed</strong>: deleted within about 48
            hours (they expire after 24 hours and a daily cleanup removes them).
          </li>
          <li>
            <strong>
              Keyed hashes of IP addresses and sign-in identifiers
            </strong>
            : deleted within about 48 hours.
          </li>
          <li>
            <strong>Emails you send us</strong>: as long as the conversation
            needs, then deleted.
          </li>
          <li>
            <strong>Error reports</strong>: deleted automatically by Sentry
            after 90 days at most.
          </li>
          <li>
            <strong>Email sending logs</strong> (at Brevo): kept 1 month,
            without a preview of the email’s content.
          </li>
        </ul>
      ),
    },
    {
      id: 'rights',
      title: 'Your rights',
      body: (
        <p>
          You can see and fix most of your data yourself on your profile. To
          delete your account and its data, write to us at {mail}. You can also
          ask us for a copy of your data, to correct or erase it, to restrict or
          object to how we use it, or to receive it in a portable format. We
          answer within one month. If you think we got something wrong, you can
          complain to your data protection authority (in France, the CNIL).
        </p>
      ),
    },
    {
      id: 'security',
      title: 'Security',
      body: (
        <p>
          Everything travels over HTTPS. Passwords are hashed with argon2id. The
          session cookie is <code>HttpOnly</code>, <code>Secure</code> and
          locked to our domain. Resetting your password signs out every device.
        </p>
      ),
    },
    {
      id: 'children',
      title: 'Children',
      body: (
        <p>
          Anyone can browse OtakuLeague, and it shows no adult content. To
          create an account, children under 15 need the consent of a parent or
          guardian (article 8 of the GDPR and article 45 of the French loi
          Informatique et Libertés). If you think a child under 15 has an
          account without that consent, write to us and we will delete it.
        </p>
      ),
    },
    {
      id: 'changes',
      title: 'Changes',
      body: (
        <p>
          If we change this policy in a way that matters, we update the date at
          the top of this page and say what changed.
        </p>
      ),
    },
    {
      id: 'contact',
      title: 'Contact',
      body: <p>Questions or requests about your data: {mail}.</p>,
    },
  ],
};
