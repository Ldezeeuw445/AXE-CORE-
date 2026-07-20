import { useNavigate } from 'react-router';
import { motion } from 'framer-motion';
import { TrendingUp, MessageSquare, ArrowRight } from 'lucide-react';

const apps = [
  {
    id: 'trading',
    name: 'Trading OS',
    description: 'Market analysis, trade execution, and portfolio management',
    icon: TrendingUp,
    path: '/trading',
    color: '#22D3EE',
    status: 'online',
  },
  {
    id: 'companion',
    name: 'AXE Companion',
    description: 'Your personal AI assistant for daily tasks and conversations',
    icon: MessageSquare,
    path: '/',
    color: '#3B82F6',
    status: 'online',
  },
];

export default function AppsPage() {
  const navigate = useNavigate();

  return (
    <motion.div
      className="p-6 h-full overflow-y-auto"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
    >
      <h1 className="text-page-title font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
        Apps
      </h1>
      <p className="text-body mb-6" style={{ color: 'var(--text-secondary)' }}>
        Your AXE applications — Trading OS and AXE Companion
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
        {apps.map((app) => (
          <button
            key={app.id}
            onClick={() => navigate(app.path)}
            className="group relative flex flex-col items-start p-5 rounded-xl border transition-all duration-200 hover:scale-[1.02] text-left"
            style={{
              backgroundColor: 'rgba(255,255,255,0.02)',
              borderColor: 'rgba(255,255,255,0.06)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = app.color + '40';
              e.currentTarget.style.backgroundColor = app.color + '08';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)';
              e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.02)';
            }}
          >
            <div className="flex items-center gap-3 mb-3">
              <div
                className="flex items-center justify-center rounded-lg"
                style={{
                  width: 44,
                  height: 44,
                  backgroundColor: app.color + '15',
                  border: `1px solid ${app.color}30`,
                }}
              >
                <app.icon size={22} style={{ color: app.color }} />
              </div>
              <div>
                <h3 className="text-base font-semibold" style={{ color: '#FFFFFF' }}>
                  {app.name}
                </h3>
                <span
                  className="text-[10px] uppercase tracking-wider font-medium px-1.5 py-0.5 rounded"
                  style={{
                    backgroundColor: app.status === 'online' ? 'rgba(34,197,94,0.15)' : 'rgba(234,179,8,0.15)',
                    color: app.status === 'online' ? '#22C55E' : '#EAB308',
                  }}
                >
                  {app.status}
                </span>
              </div>
            </div>
            <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
              {app.description}
            </p>
            <div className="flex items-center gap-1 text-xs font-medium mt-auto" style={{ color: app.color }}>
              Open app <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
            </div>
          </button>
        ))}
      </div>
    </motion.div>
  );
}
