import { TabPage, tabMetadata } from '../tab-page';

// Resolves the slug before anything renders: see ../layout.tsx.
export const instant = false;

export default async function Page(props: PageProps<'/anime/[slug]/cast'>) {
  const { slug } = await props.params;
  return <TabPage slug={slug} segment="cast" />;
}

export function generateMetadata(props: PageProps<'/anime/[slug]/cast'>) {
  return tabMetadata(props.params, 'cast');
}
