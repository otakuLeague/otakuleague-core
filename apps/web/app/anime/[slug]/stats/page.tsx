import { TabPage, tabMetadata } from '../tab-page';

// Resolves the slug before anything renders: see ../layout.tsx.
export const instant = false;

export default async function Page(props: PageProps<'/anime/[slug]/stats'>) {
  const { slug } = await props.params;
  return <TabPage slug={slug} segment="stats" />;
}

export function generateMetadata(props: PageProps<'/anime/[slug]/stats'>) {
  return tabMetadata(props.params, 'stats');
}
