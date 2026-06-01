import type { LucideIcon } from 'lucide-react';
import { Reveal } from './motion';

export default function ComingSoon({
  title,
  kicker,
  blurb,
  icon: Icon,
  features,
}: {
  title: string;
  kicker: string;
  blurb: string;
  icon: LucideIcon;
  features: string[];
}) {
  return (
    <Reveal>
      <div className="mx-auto max-w-2xl">
        <div className="mb-6">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-braves-red">{kicker}</span>
          <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
        </div>

        <div className="glass relative overflow-hidden rounded-2xl p-6 shadow-card">
          <div className="flex items-start gap-4">
            <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-braves-red to-[#8d0b2c] shadow-glow">
              <Icon className="h-6 w-6 text-white" />
            </span>
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-slate-300 ring-1 ring-white/10">
                <span className="h-1.5 w-1.5 rounded-full bg-braves-gold" />
                In the build queue
              </div>
              <p className="mt-3 text-sm leading-relaxed text-slate-300">{blurb}</p>
            </div>
          </div>

          <ul className="mt-5 grid gap-2 sm:grid-cols-2">
            {features.map((f) => (
              <li key={f} className="flex items-start gap-2 rounded-lg bg-white/[0.03] px-3 py-2 text-sm text-slate-300 ring-1 ring-white/5">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-braves-red" />
                {f}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Reveal>
  );
}
