import { motion } from 'framer-motion';

interface StubPageProps {
  title: string;
  description?: string;
}

export default function StubPage({ title, description }: StubPageProps) {
  return (
    <motion.div
      className="p-6 h-full flex items-center justify-center"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
    >
      <div
        className="max-w-lg w-full p-8 rounded-xl text-center"
        style={{
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
        }}
      >
        <div
          className="text-4xl mb-4 inline-flex items-center justify-center rounded-full"
          style={{
            width: '64px',
            height: '64px',
            backgroundColor: 'var(--bg-hover)',
            color: 'var(--accent-cyan)',
          }}
        >
          ◆
        </div>
        <h1
          className="text-page-title font-semibold mb-2"
          style={{ color: 'var(--text-primary)' }}
        >
          {title}
        </h1>
        <p className="text-body" style={{ color: 'var(--text-secondary)' }}>
          {description || `${title} module is under development. Full implementation coming in the next phase.`}
        </p>
      </div>
    </motion.div>
  );
}
