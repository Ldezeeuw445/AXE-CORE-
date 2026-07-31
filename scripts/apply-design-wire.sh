#!/usr/bin/env bash
set -euo pipefail
FILE="AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS/src/presentation/pages/CodeEditorPage.tsx"

if [[ ! -f "$FILE" ]]; then
  echo "Missing $FILE"
  exit 1
fi

# Already wired?
if grep -q 'DesignAgentWireHost' "$FILE"; then
  echo "Already wired — skip"
  exit 0
fi

python3 - <<'PY'
from pathlib import Path
path = Path("AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS/src/presentation/pages/CodeEditorPage.tsx")
text = path.read_text(encoding="utf-8")

imp_old = "import { PreviewPanel } from '@/presentation/components/axe-core/PreviewPanel';\n"
imp_new = (
    "import { PreviewPanel } from '@/presentation/components/axe-core/PreviewPanel';\n"
    "import { DesignAgentWireHost } from '@/presentation/components/axe-core/DesignAgentWireHost';\n"
)
if imp_old not in text:
    raise SystemExit('import anchor not found')
text = text.replace(imp_old, imp_new, 1)

old_sub = """  const handleAgentSubmit = useCallback(async () => {
    const instruction = agentInput.trim();
    if (!instruction || agentBusy) return;
    setAgentInput('');"""
new_sub = """  const handleAgentSubmit = useCallback(async (overrideInstruction?: string) => {
    const instruction = (overrideInstruction ?? agentInput).trim();
    if (!instruction || agentBusy) return;
    setAgentInput('');"""
if old_sub not in text:
    raise SystemExit('handleAgentSubmit anchor not found')
text = text.replace(old_sub, new_sub, 1)

old_stop = "  const stopAgentLoop = useCallback(() => { agentAbortRef.current?.abort(); }, []);\n"
new_stop = """  const stopAgentLoop = useCallback(() => { agentAbortRef.current?.abort(); }, []);

  const onDesignInstruction = useCallback((instruction: string) => {
    setShowAgent(true);
    void handleAgentSubmit(instruction);
  }, [handleAgentSubmit]);
"""
if old_stop not in text:
    raise SystemExit('stopAgentLoop anchor not found')
text = text.replace(old_stop, new_stop, 1)

old_ret = "  return (\n    <motion.div className=\"h-full flex flex-col relative\" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>\n"
new_ret = "  return (\n    <motion.div className=\"h-full flex flex-col relative\" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>\n      <DesignAgentWireHost onInstruction={onDesignInstruction} />\n"
if old_ret not in text:
    raise SystemExit('return anchor not found')
text = text.replace(old_ret, new_ret, 1)

old_prev = "{showPreview && <PreviewPanel isMobile={isMobile} onClose={() => setShowPreview(false)} />}"
new_prev = """{showPreview && (
          <PreviewPanel
            isMobile={isMobile}
            onClose={() => setShowPreview(false)}
            onSendToAgent={onDesignInstruction}
          />
        )}"""
if old_prev not in text:
    raise SystemExit('PreviewPanel anchor not found')
text = text.replace(old_prev, new_prev, 1)

path.write_text(text, encoding="utf-8")
print("Wired Design Mode → Code Agent in", path)
PY
