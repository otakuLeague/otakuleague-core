import { APP_NAME } from '@otakuleague/shared-types';
import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s | ${APP_NAME}` },
  description:
    'Track your anime and manga, explore their data, and play anime quizzes and games.',
};

export const viewport: Viewport = {
  colorScheme: 'light dark',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
