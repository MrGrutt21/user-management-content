import type { Metadata } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: 'User Management & Content',
  description: 'Role-based user management and client content.',
};

/** Signed-in pages get the top bar from app/(app)/layout.tsx; /login has none. */
export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
