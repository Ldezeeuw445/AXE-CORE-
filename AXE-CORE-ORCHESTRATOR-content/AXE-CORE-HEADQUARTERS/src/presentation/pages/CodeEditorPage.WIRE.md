# Design Mode → Code Agent (final 3 lines)

`PreviewPanel` already calls `designAgentBridge.send(instruction)` when you click **→ Code Agent**.
Register the handler once inside `CodeEditorPage` (near other agent hooks):

```ts
import { designAgentBridge } from '@/presentation/components/axe-core/designAgentBridge';

// After handleAgentSubmit is defined:
useEffect(() => {
  return designAgentBridge.register((instruction) => {
    setShowAgent(true);
    void handleAgentSubmit(instruction);
  });
}, [handleAgentSubmit]);
```

Also allow override instruction:

```ts
const handleAgentSubmit = useCallback(async (overrideInstruction?: string) => {
  const instruction = (overrideInstruction ?? agentInput).trim();
  // ...rest unchanged
```
