import { type AnimeTabProps, TabPage, tabMetadata } from '../tab-page';

// Resolves the slug before anything renders: see ../layout.tsx.
export const instant = false;

export default async function Page(props: AnimeTabProps) {
  const { slug } = await props.params;
  return <TabPage slug={slug} segment="episodes" />;
}

export function generateMetadata(props: AnimeTabProps) {
  return tabMetadata(props.params, 'episodes');
}
