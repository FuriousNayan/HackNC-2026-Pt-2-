import type { Metadata, Viewport } from 'next';
import './globals.css';
import '@/ui/courtroom.css';
import '@/ui/home/home.css';
import '@/ui/lovable-base.css';
import '@/ui/lovable.css';

export const metadata: Metadata = {
  title: 'Hung Jury',
  description: 'A live courtroom for petty disputes.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
