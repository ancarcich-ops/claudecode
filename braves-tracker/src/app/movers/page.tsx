import { TrendingUp } from 'lucide-react';
import ComingSoon from '@/components/ComingSoon';

export default function MoversPage() {
  return (
    <ComingSoon
      icon={TrendingUp}
      kicker="Trends"
      title="Risers & Slumpers"
      blurb="A nightly job snapshots every player's stats so a trend engine can flag who's heating up or cooling off — rolling last-7 / last-15 vs. season, with level context."
      features={[
        'Hot & cold flags',
        'Rolling 7 / 15-game windows',
        'Promotion-watch alerts',
        'Powered by nightly snapshots',
      ]}
    />
  );
}
