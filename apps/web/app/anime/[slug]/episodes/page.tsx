import { TabPage, tabMetadata } from '../tab-page';

// Resolves the slug before anything renders: see ../layout.tsx.
export const instant = false;

export default async function Page(props: PageProps<'/anime/[slug]/episodes'>) {
  const { slug } = await props.params;
  return <TabPage slug={slug} segment="episodes" />;
}

export function generateMetadata(props: PageProps<'/anime/[slug]/episodes'>) {
  return tabMetadata(props.params, 'episodes');
}
