import { motion } from 'framer-motion';
import { WidgetCard } from '@/presentation/components/widgets/WidgetCard';
import { DollarSign, TrendingUp, PiggyBank, CreditCard, Plus } from 'lucide-react';

export default function Finance() {
  return (
    <motion.div
      className="p-6 h-full overflow-y-auto"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
    >
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-page-title font-semibold" style={{ color: 'var(--text-primary)' }}>Finance Hub</h1>
        <button
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs-custom"
          style={{ background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.2)', color: 'var(--accent-cyan)' }}
        >
          <Plus size={12} /> Connect data source
        </button>
      </div>

      {/* Empty metric cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        {[
          { title: 'Net Worth', icon: TrendingUp, color: '#10B981' },
          { title: 'Monthly Income', icon: DollarSign, color: '#3B82F6' },
          { title: 'Monthly Expenses', icon: CreditCard, color: '#F59E0B' },
          { title: 'Savings Rate', icon: PiggyBank, color: '#8B5CF6' },
        ].map(({ title, icon: Icon, color }) => (
          <WidgetCard key={title} title={title}>
            <div className="flex flex-col items-center justify-center py-4 gap-2">
              <Icon size={20} style={{ color, opacity: 0.4 }} />
              <span className="text-xs-custom" style={{ color: 'var(--text-muted)' }}>No data connected</span>
            </div>
          </WidgetCard>
        ))}
      </div>

      {/* Connect prompt */}
      <WidgetCard title="CONNECT FINANCIAL DATA">
        <div className="py-8 flex flex-col items-center gap-3 text-center">
          <DollarSign size={36} style={{ color: 'var(--text-muted)', opacity: 0.25 }} />
          <div>
            <p className="text-small font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
              Finance Hub — Coming Soon
            </p>
            <p className="text-xs-custom max-w-sm" style={{ color: 'var(--text-muted)' }}>
              Connect bank accounts, crypto wallets, and subscriptions via Plaid, CoinGecko,
              or CSV import. Data syncs to your Supabase and shows live metrics here.
            </p>
          </div>
          <div className="flex gap-2 mt-2 flex-wrap justify-center">
            {['Plaid (bank)', 'CoinGecko (crypto)', 'CSV import'].map(s => (
              <span
                key={s}
                className="text-[10px] px-2.5 py-1 rounded-full"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-muted)' }}
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      </WidgetCard>
    </motion.div>
  );
}
