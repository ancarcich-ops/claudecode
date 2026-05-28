import Link from "next/link";

export default function EmptyState({
  emoji,
  title,
  subtitle,
  ctaHref,
  ctaLabel,
}: {
  emoji: string;
  title: string;
  subtitle?: string;
  ctaHref?: string;
  ctaLabel?: string;
}) {
  return (
    <div className="card flex flex-col items-center gap-2 px-6 py-12 text-center">
      <span className="text-5xl">{emoji}</span>
      <p className="font-display text-lg font-semibold text-ink">{title}</p>
      {subtitle && <p className="max-w-xs text-sm text-mute">{subtitle}</p>}
      {ctaHref && ctaLabel && (
        <Link href={ctaHref} className="btn btn-primary mt-2 px-5 py-2">
          {ctaLabel}
        </Link>
      )}
    </div>
  );
}
