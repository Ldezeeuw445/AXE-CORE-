# APPLIED — Design Mode → Code Agent

This branch wires CodeEditorPage. See commit for DesignAgentWireHost + CodeEditorPage changes.

## What was applied
1. `import { DesignAgentWireHost } from '.../DesignAgentWireHost'`
2. `handleAgentSubmit(overrideInstruction?: string)` uses `(overrideInstruction ?? agentInput).trim()`
3. `onDesignInstruction` + `<DesignAgentWireHost onInstruction={onDesignInstruction} />`
4. PreviewPanel `onSendToAgent={onDesignInstruction}`
