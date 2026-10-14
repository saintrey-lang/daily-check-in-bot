import type { ReactNode } from 'react';
export const metadata = { title: 'TFT & Golden Spatula Meme Bot' };
export default function Layout({ children }: { children: ReactNode }) {
  return <html lang="en"><body style={{ background: '#111725', color: '#fff', fontFamily: 'Arial, sans-serif', margin: 0 }}>{children}</body></html>;
}
