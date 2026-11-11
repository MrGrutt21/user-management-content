import { TopBar } from '../_components/TopBar';

/**
 * Layout for the signed-in pages. The top bar lives here and not in the root layout:
 * when a page redirects a dead session to /login during client-side navigation, this
 * whole segment is dropped, so the bar can never keep showing the previous user.
 */
export default function AppLayout({ children }: LayoutProps<'/'>) {
  return (
    <>
      <TopBar />
      {children}
    </>
  );
}
