export default function ComingSoon({ title, blurb }: { title: string; blurb: string }) {
  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold">{title}</h1>
      <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.03] p-6 text-white/60">
        <p className="mb-2 font-medium text-white/80">Coming next.</p>
        <p className="text-sm">{blurb}</p>
      </div>
    </div>
  );
}
