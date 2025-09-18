import Link from 'next/link';

import { FeatureCard } from '@/components/feature-card';

export const runtime = 'edge';

const features = [
  {
    title: 'Supabase Auth',
    body: 'Full-stack authentication helpers with browser and server clients are wired up and ready to extend.'
  },
  {
    title: 'Design Tokens',
    body: 'Tailwind CSS is configured to consume CSS custom properties so your brand system is centralized.'
  },
  {
    title: 'Edge Ready',
    body: 'Cloudflare Pages friendly config makes deploying performant edge-native apps a breeze.'
  }
];

export default function HomePage() {
  return (
    <div className="flex flex-1 items-center justify-center bg-gradient-to-b from-background via-background/90 to-background">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-lg px-md py-xl">
        <div className="flex flex-col gap-sm text-center">
          <span className="mx-auto inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-primary">
            v15 Starter
          </span>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Operational Item Database</h1>
          <p className="mx-auto max-w-2xl text-lg text-muted">
            Ship faster with an opinionated Next.js 15 starter that pairs Supabase persistence with an edge-optimized Cloudflare
            pipeline and a cohesive design system.
          </p>
          <div className="mt-sm flex flex-wrap items-center justify-center gap-sm">
            <Link
              className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground shadow-elevation transition-transform hover:-translate-y-0.5"
              href="https://github.com/supabase/supabase"
            >
              Explore Supabase
            </Link>
            <Link
              className="rounded-full border border-foreground/15 px-5 py-2 text-sm font-semibold text-foreground transition-colors hover:border-foreground/40"
              href="https://developers.cloudflare.com/pages/framework-guides/deploy-a-nextjs-site/"
            >
              Deploy to Cloudflare
            </Link>
          </div>
        </div>
        <div className="grid gap-md md:grid-cols-3">
          {features.map((feature) => (
            <FeatureCard key={feature.title} title={feature.title} body={feature.body} />
          ))}
        </div>
      </div>
    </div>
  );
}
