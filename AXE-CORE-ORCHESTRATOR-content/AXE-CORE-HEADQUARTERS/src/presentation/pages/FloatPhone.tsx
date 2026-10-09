/** De telefoon als eigen venster: dezelfde iPhone met dezelfde apps, los van de app (zwevendeVensters.ts). */
import { FloatChrome } from '@/presentation/components/notities/FloatChrome';
import { IphoneFrame } from '@/presentation/components/devices/IphoneFrame';
import { TelefoonScherm } from '@/presentation/components/devices/TelefoonScherm';
import { TELEFOON_ECHT } from '@/presentation/components/devices/launcher';

export default function FloatPhone() {
  return (
    <FloatChrome
      type="phone"
      titel="Phone"
      kind={
        <div className="axe-float__telefoon" style={{ ['--tel-w' as string]: `${TELEFOON_ECHT.b}px`, ['--tel-h' as string]: `${TELEFOON_ECHT.h}px` }}>
          <IphoneFrame>
            <TelefoonScherm onApp={() => {}} />
          </IphoneFrame>
        </div>
      }
    />
  );
}
