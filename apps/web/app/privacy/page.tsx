import { legalMetadata } from '../../src/legal/legal-document';
import { LegalPage } from '../../src/legal/legal-page';
import { PRIVACY_POLICY } from '../../src/legal/privacy';

export const metadata = legalMetadata(PRIVACY_POLICY);

export default function PrivacyPage() {
  return <LegalPage document={PRIVACY_POLICY} />;
}
