import { legalMetadata } from '../../src/legal/legal-document';
import { LegalPage } from '../../src/legal/legal-page';
import { DATA_SOURCES } from '../../src/legal/data-sources';

export const metadata = legalMetadata(DATA_SOURCES);

export default function DataSourcesPage() {
  return <LegalPage document={DATA_SOURCES} />;
}
