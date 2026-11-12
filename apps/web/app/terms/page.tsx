import { legalMetadata } from '../../src/legal/legal-document';
import { LegalPage } from '../../src/legal/legal-page';
import { TERMS_OF_USE } from '../../src/legal/terms';

export const metadata = legalMetadata(TERMS_OF_USE);

export default function TermsPage() {
  return <LegalPage document={TERMS_OF_USE} />;
}
