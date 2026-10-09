/** Het zwevende notitiesvenster: een eigen Tauri-venster boven het hele bureaublad (zwevendeVensters.ts). */
import { FloatChrome } from '@/presentation/components/notities/FloatChrome';
import { NotitiesApp } from '@/presentation/components/notities/NotitiesApp';

export default function FloatNotes() {
  return <FloatChrome type="notes" titel="Notes" kind={<NotitiesApp />} />;
}
