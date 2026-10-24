import { notFound } from 'next/navigation';

// The proxy rewrites an unknown /anime/<slug> here (src/anime/slug-proxy.ts). A rewrite cannot
// set the status itself, so the page calls notFound() while it is prerendered: Next then
// serves the static not-found.tsx below with a real 404.
export default function AnimeNotFoundPage(): never {
  notFound();
}
