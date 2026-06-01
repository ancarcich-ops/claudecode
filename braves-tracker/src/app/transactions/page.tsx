import { ArrowLeftRight } from 'lucide-react';
import ComingSoon from '@/components/ComingSoon';

export default function TransactionsPage() {
  return (
    <ComingSoon
      icon={ArrowLeftRight}
      kicker="Roster Moves"
      title="Transactions"
      blurb="A live feed of promotions, demotions, IL moves, signings, and releases across the system — pulled from the MLB Stats API transactions endpoint for the Braves organization."
      features={[
        'Promotions & demotions',
        'Injured-list moves',
        'Signings & releases',
        'Filter by affiliate',
      ]}
    />
  );
}
