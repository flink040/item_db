import { ReactNode } from 'react';

import type { Metadata, Viewport } from 'next';

import './globals.css';

export const runtime = 'edge';

export const metadata: Metadata = {
  title: {
    default: 'OP Item DB',
    template: '%s | OP Item DB'
  },
  description: 'Operational item database starter kit powered by Next.js 15 and Supabase.',
  metadataBase: new URL('https://op-item-db.example'),
  authors: [{ name: 'OP Item DB' }]
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f8fafc' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0c15' }
  ]
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <div className="flex min-h-screen flex-col">
          <header className="border-b border-foreground/10 bg-background/80 backdrop-blur">
            <div className="mx-auto flex max-w-5xl items-center justify-between gap-sm px-md py-sm">
              <div className="flex items-center gap-sm">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-elevation">
                  <span className="text-lg font-semibold">OP</span>
                </div>
                <div>
                  <p className="text-base font-semibold tracking-tight">Operational Item DB</p>
                  <p className="text-sm text-muted">Next.js 15 + Supabase starter</p>
                </div>
              </div>
              <nav className="flex items-center gap-sm text-sm font-medium text-muted">
                <a className="transition-colors hover:text-foreground" href="https://nextjs.org">Docs</a>
                <a className="transition-colors hover:text-foreground" href="https://supabase.com">Supabase</a>
                <a className="transition-colors hover:text-foreground" href="https://developers.cloudflare.com/pages/framework-guides/deploy-a-nextjs-site/">Cloudflare Pages</a>
              </nav>
            </div>
          </header>
          <main className="flex flex-1 flex-col">{children}</main>
          <footer className="border-t border-foreground/10 bg-background/80 py-sm text-center text-xs text-muted">
            Built with Next.js 15, Supabase, and Cloudflare Pages.
          </footer>
        </div>
      </body>
    </html>
  );
}
