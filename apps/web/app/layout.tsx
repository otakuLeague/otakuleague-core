import { APP_NAME } from '@otakuleague/shared-types';
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: APP_NAME,
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
