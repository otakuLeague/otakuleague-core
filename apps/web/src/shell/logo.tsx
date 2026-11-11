import Link from 'next/link';

export function Logo() {
  return (
    <Link className="sh-logo" href="/">
      <span className="sh-logo__mark" aria-hidden="true">
        O
      </span>
      <span>
        Otaku<b>League</b>
      </span>
    </Link>
  );
}
