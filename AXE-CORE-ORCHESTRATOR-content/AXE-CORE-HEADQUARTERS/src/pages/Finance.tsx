import { motion } from 'framer-motion';
import { WidgetCard } from '@/components/widgets/WidgetCard';
import { MetricDisplay } from '@/components/widgets/MetricDisplay';
import { ProgressRing } from '@/components/widgets/ProgressRing';

export default function Finance() {
  return (
    <motion.div
      className="p-6 h-full overflow-y-auto"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
    >
      <h1 className="text-page-title font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
        Finance Hub
      </h1>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <WidgetCard title="Net Worth">
          <MetricDisplay value="$284,750" label="+3.2% this month" delta={3.2} />
        </WidgetCard>
        <WidgetCard title="Monthly Income">
          <MetricDisplay value="$12,400" label="Recurring + freelance" />
        </WidgetCard>
        <WidgetCard title="Monthly Expenses">
          <MetricDisplay value="$4,820" label="-8% vs last month" delta={-8} />
        </WidgetCard>
        <WidgetCard title="Savings Rate">
          <div className="flex justify-center py-1">
            <ProgressRing value={61} label="Rate" size="sm" />
          </div>
        </WidgetCard>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <WidgetCard title="Crypto Holdings">
          <div className="space-y-2">
            {[
              { asset: 'BTC', amount: '0.45', value: '$28,350', change: '+5.2%' },
              { asset: 'ETH', amount: '4.2', value: '$14,280', change: '+3.1%' },
              { asset: 'SOL', amount: '25', value: '$3,875', change: '-2.4%' },
            ].map((crypto) => (
              <div key={crypto.asset} className="flex items-center justify-between py-1.5">
                <span className="text-small font-medium" style={{ color: 'var(--text-primary)' }}>{crypto.asset}</span>
                <span className="text-xs-custom font-mono-data" style={{ color: 'var(--text-secondary)' }}>{crypto.amount}</span>
                <span className="text-xs-custom font-mono-data" style={{ color: 'var(--text-primary)' }}>{crypto.value}</span>
                <span className="text-xs-custom" style={{ color: crypto.change.startsWith('+') ? 'var(--success)' : 'var(--error)' }}>{crypto.change}</span>
              </div>
            ))}
          </div>
        </WidgetCard>
        <WidgetCard title="Subscriptions">
          <div className="space-y-2">
            {[
              { name: 'Claude Pro', cost: '$20/mo', category: 'AI' },
              { name: 'GitHub Copilot', cost: '$10/mo', category: 'Dev' },
              { name: 'Vercel Pro', cost: '$20/mo', category: 'Hosting' },
              { name: 'Linear', cost: '$8/mo', category: 'Productivity' },
            ].map((sub) => (
              <div key={sub.name} className="flex items-center justify-between py-1.5">
                <span className="text-small" style={{ color: 'var(--text-primary)' }}>{sub.name}</span>
                <span className="text-xs-custom" style={{ color: 'var(--text-muted)' }}>{sub.category}</span>
                <span className="text-xs-custom font-mono-data" style={{ color: 'var(--text-secondary)' }}>{sub.cost}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 pt-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
            <span className="text-small" style={{ color: 'var(--text-secondary)' }}>
              Monthly total: <span className="font-mono-data" style={{ color: 'var(--text-primary)' }}>$58/mo</span>
            </span>
          </div>
        </WidgetCard>
      </div>
    </motion.div>
  );
}
