import { Star } from 'lucide-react';
import ComingSoon from '@/components/ComingSoon';

export default function ProspectsPage() {
  return (
    <ComingSoon
      icon={Star}
      kicker="Top of the System"
      title="Prospects"
      blurb="A seeded Braves Top-30 you can re-rank anytime, each linked to live stats and a player profile. Numbers come straight from the MLB Stats API — never hand-typed."
      features={[
        'Editable Top-30 rankings',
        'Per-player profiles with live stats',
        'Position & level filters',
        'Age-relative-to-level signal',
      ]}
    />
  );
}
