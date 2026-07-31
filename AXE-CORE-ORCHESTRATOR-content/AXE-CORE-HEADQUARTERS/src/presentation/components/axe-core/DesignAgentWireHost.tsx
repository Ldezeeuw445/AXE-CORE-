import { useEffect } from 'react';
import { designAgentBridge } from '@/presentation/components/axe-core/designAgentBridge';
import { toast } from '@/presentation/components/shared/toast';

/**
 * Null component — registers Design Mode → Code Agent while Code Studio is mounted.
 * PreviewPanel calls designAgentBridge.send(); this host runs handleAgentSubmit.
 */
export function DesignAgentWireHost({
  onInstruction,
}: {
  onInstruction: (instruction: string) => void;
}) {
  useEffect(() => {
    return designAgentBridge.register((instruction) => {
      toast.success('Design → Code Agent');
      onInstruction(instruction);
    });
  }, [onInstruction]);
  return null;
}
