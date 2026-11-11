import { HeaderLoading } from '../../../[slug]/header';
import '../../../[slug]/anime-page.css';

/** The anime page's own loading header while the season imports (a few seconds at most). */
export default function Loading() {
  return (
    <div className="ol-root anime-page">
      <HeaderLoading />
    </div>
  );
}
