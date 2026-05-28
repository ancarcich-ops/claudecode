// "Did Daddy deliver?" — a playful scoreboard of who satisfied the cravings.
export default function Scoreboard({
  daddy,
  geena,
  takeout,
  unmet,
  momName,
  partnerName,
}: {
  daddy: number;
  geena: number;
  takeout: number;
  unmet: number;
  momName: string;
  partnerName: string;
}) {
  const met = daddy + geena + takeout;
  const total = met + unmet;
  const rate = total ? Math.round((met / total) * 100) : 0;

  const rows = [
    { label: partnerName, value: daddy, emoji: "🦸", accent: true },
    { label: momName, value: geena, emoji: "💪" },
    { label: "Takeout", value: takeout, emoji: "🛵" },
  ];

  return (
    <section className="card p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-ink">
          Did {partnerName} deliver?
        </h2>
        <span className="chip">{rate}% satisfied</span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        {rows.map((r) => (
          <div
            key={r.label}
            className={`rounded-2xl border p-3 text-center ${
              r.accent ? "border-accent/40 bg-accent/10" : "border-border bg-panel2"
            }`}
          >
            <div className="text-2xl">{r.emoji}</div>
            <div className="mt-1 font-display text-2xl font-bold text-ink">{r.value}</div>
            <div className="truncate text-xs text-mute">{r.label}</div>
          </div>
        ))}
      </div>

      {unmet > 0 && (
        <p className="mt-3 text-center text-xs text-mute">
          {unmet} craving{unmet === 1 ? "" : "s"} still waiting to be satisfied 👀
        </p>
      )}
    </section>
  );
}
