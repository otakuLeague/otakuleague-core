import { HeaderLoading } from '../../../[slug]/header';
import '../../../[slug]/anime-page.css';

/** The anime page's own loading header while the season imports (up to the 15 s timeout). */
export default function Loading() {
  return (
    <main className="ol-root anime-page">
      <HeaderLoading />
    </main>
  );
}
