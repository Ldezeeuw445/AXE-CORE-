import { useNavigate } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { PageShell, PageHeader, AxeCard, AxeButton, EmptyState } from '@/presentation/components/ui/AxeUI';

export default function StubPage({ title = 'Coming soon' }: { title?: string }) {
  const navigate = useNavigate();
  return (
    <PageShell>
      <PageHeader
        eyebrow="AXE CORE"
        title={title}
        description="This surface is reserved in the nav shell and will light up when the module is wired."
      />
      <AxeCard>
        <EmptyState
          title="Module not active yet"
          description="Navigation is ready. The feature layer for this tab is still being connected to live data and agents."
          action={
            <AxeButton onClick={() => navigate('/')}>
              <ArrowLeft size={12} /> Back to Home
            </AxeButton>
          }
        />
      </AxeCard>
    </PageShell>
  );
}
