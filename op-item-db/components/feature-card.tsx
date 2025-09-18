'use client';

import type { ReactNode } from 'react';

type FeatureCardProps = {
  title: string;
  body: string;
  icon?: ReactNode;
};

export function FeatureCard({ title, body, icon }: FeatureCardProps) {
  return (
    <article className="group flex flex-col gap-sm rounded-2xl border border-foreground/10 bg-background/60 p-md shadow-elevation transition-transform hover:-translate-y-1 hover:border-primary/50 hover:shadow-lg">
      <div className="flex items-center gap-sm text-primary">
        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-primary/40 bg-primary/10 text-base font-semibold uppercase tracking-tight">
          {icon ?? title.charAt(0).toUpperCase()}
        </div>
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      </div>
      <p className="text-sm leading-relaxed text-muted">{body}</p>
    </article>
  );
}
