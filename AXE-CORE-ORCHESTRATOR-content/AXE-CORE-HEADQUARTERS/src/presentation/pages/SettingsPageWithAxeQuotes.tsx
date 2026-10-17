import SettingsPage from '@/presentation/pages/SettingsPage';
import { usePhoneApp } from '@/presentation/pages/phone/usePhoneApp';
import PhoneSettings from '@/presentation/pages/phone/PhoneSettings';

/** Quotes live inside SettingsPage scroll (Voice → Quotes → Trust). */
export default function SettingsPageWithAxeQuotes() {
  const phone = usePhoneApp();
  if (phone) return <PhoneSettings />;
  return <SettingsPage />;
}
