import { TabPage, tabMetadata } from '../tab-page';

// Resolves the slug before anything renders: see ../layout.tsx.
export const instant = false;

export default async function Page(
  props: PageProps<'/anime/[slug]/community'>,
) {
  const { slug } = await props.params;
  return <TabPage slug={slug} segment="community" />;
}

export function generateMetadata(props: PageProps<'/anime/[slug]/community'>) {
  return tabMetadata(props.params, 'community');
}
