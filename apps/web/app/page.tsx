import { APP_NAME, type AppInfo } from '@otakuleague/shared-types';

const appInfo: AppInfo = { name: APP_NAME };

export default function Home() {
  return (
    <main>
      <h1>{appInfo.name}</h1>
    </main>
  );
}
