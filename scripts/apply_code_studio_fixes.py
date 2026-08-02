#!/usr/bin/env python3
"""Apply Code Studio fixes to CodeEditorPage.tsx (persist agent, name dialog, shell/git)."""
from pathlib import Path
import re

path = Path("AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS/src/presentation/pages/CodeEditorPage.tsx")
text = path.read_text(encoding="utf-8")
if "CodeStudioNameDialog" in text and "shellLike" in text:
    print("Already patched — skip")
    raise SystemExit(0)

old_imp = "import { toast } from '@/presentation/components/shared/toast';"
new_imp = (
    "import { toast } from '@/presentation/components/shared/toast';\n"
    "import {\n"
    "  CodeStudioNameDialog,\n"
    "  loadAgentMessages, saveAgentMessages,\n"
    "  loadAgentInput, saveAgentInput,\n"
    "} from '@/presentation/components/axe-core/CodeStudioNameDialog';"
)
if old_imp not in text:
    raise SystemExit("import toast not found")
text = text.replace(old_imp, new_imp, 1)

if "apiExecuteOpenHands, execCommand" not in text:
    text = text.replace(
        "import { apiExecuteOpenHands } from '@/infrastructure/gateways/axeCoreApiService';",
        "import { apiExecuteOpenHands, execCommand } from '@/infrastructure/gateways/axeCoreApiService';",
        1,
    )

text = text.replace(
    "const [agentMessages, setAgentMessages] = useState<AgentMessage[]>([]);",
    "const [agentMessages, setAgentMessages] = useState<AgentMessage[]>(() => loadAgentMessages<AgentMessage>());",
    1,
)
text = text.replace(
    "const [agentInput, setAgentInput] = useState('');",
    "const [agentInput, setAgentInput] = useState(() => loadAgentInput());",
    1,
)

old_scroll = (
    "  useEffect(() => {\n"
    "    agentChatRef.current?.scrollTo(0, agentChatRef.current.scrollHeight);\n"
    "  }, [agentMessages]);\n"
)
persist = old_scroll + (
    "\n"
    "  useEffect(() => { saveAgentMessages(agentMessages); }, [agentMessages]);\n"
    "  useEffect(() => { saveAgentInput(agentInput); }, [agentInput]);\n"
)
if old_scroll not in text:
    raise SystemExit("scroll effect not found")
text = text.replace(old_scroll, persist, 1)

text = text.replace(
    "const isMobile = useIsMobile();",
    "const [nameDialog, setNameDialog] = useState<{ kind: 'file' | 'folder' } | null>(null);\n  const isMobile = useIsMobile();",
    1,
)

pat = re.compile(
    r"  const addFile = useCallback\(async \(\) => \{.*?  \}, \[\]\);\n",
    re.S,
)
new_add = (
    "  const addFile = useCallback(() => { setNameDialog({ kind: 'file' }); }, []);\n"
    "  const addFolder = useCallback(() => { setNameDialog({ kind: 'folder' }); }, []);\n"
    "\n"
    "  const handleNameDialogSubmit = useCallback(async (name: string) => {\n"
    "    const kind = nameDialog?.kind;\n"
    "    setNameDialog(null);\n"
    "    if (!kind || !name.trim()) return;\n"
    "    const path = name.trim().replace(/^\\/+/, '');\n"
    "    try {\n"
    "      await createWorkspaceEntry(path, kind);\n"
    "      if (kind === 'file') {\n"
    "        setFileTree(prev => [...prev, { path, name: path.split('/').pop() ?? path, type: 'file', loaded: true }]);\n"
    "        await openFile(path);\n"
    "      } else {\n"
    "        setFileTree(prev => [...prev, { path, name: path.split('/').pop() ?? path, type: 'folder', expanded: false, loaded: false }]);\n"
    "      }\n"
    "      toast.success(kind === 'file' ? `Created ${path}` : `Folder ${path}`);\n"
    "    } catch (err) {\n"
    "      toast.error(err instanceof Error ? err.message : String(err));\n"
    "    }\n"
    "  }, [nameDialog, openFile]);\n"
)
text2, n = pat.subn(new_add, text, count=1)
if n != 1:
    raise SystemExit(f"addFile/addFolder replace failed n={n}")
text = text2

marker = "    setAgentMessages(prev => [...prev, { role: 'status', text: '🔍 Gathering context…' }]);\n    const result = await runLocalAgent("
if marker not in text:
    raise SystemExit("runLocalAgent marker not found")
shell_block = (
    "    // Shell / git style tasks: run for real via VPS exec\n"
    "    const shellLike = /^(git|npm|npx|pnpm|yarn|pip|python|python3|node|cargo|go|docker|curl|wget|ls|cd|pwd|cat|mkdir|rm|mv|cp|chmod|echo|which|head|tail|grep|rg|find)\\b/i.test(instruction.trim())\n"
    "      || /\\b(git\\s+(pull|push|clone|fetch|status|checkout|commit|branch|log|diff|add|remote|stash)|clone\\s+https?:|pull\\s+(this|the)\\s+repo)\\b/i.test(instruction);\n"
    "\n"
    "    if (shellLike) {\n"
    "      setAgentMessages(prev => [...prev, { role: 'status', text: 'Running on VPS workspace…' }]);\n"
    "      try {\n"
    "        const root = activeTab ? activeTab.path.split('/')[0] : '';\n"
    "        const cmd = root && !/^cd\\b/i.test(instruction.trim())\n"
    "          ? `cd ${JSON.stringify(root)} && ${instruction.trim()}`\n"
    "          : instruction.trim();\n"
    "        const result = await execCommand(cmd, 120);\n"
    "        const out = [result.stdout, result.stderr].filter(Boolean).join('\\n').trim() || '(no output)';\n"
    "        const textOut = `$ ${instruction.trim()}\\nexit ${result.exit_code ?? '?'}${result.timed_out ? ' (timed out)' : ''}\\n\\n${out.slice(0, 6000)}`;\n"
    "        setAgentMessages(prev => [...prev.slice(0, -1), { role: 'agent', text: textOut, patches: [] }]);\n"
    "        if (result.exit_code === 0) {\n"
    "          void reloadTree();\n"
    "          setShowTerminal(true);\n"
    "          setTimeout(() => termRef.current?.send(cmd + '\\n'), 80);\n"
    "        }\n"
    "      } catch (err) {\n"
    "        setAgentMessages(prev => [...prev.slice(0, -1), {\n"
    "          role: 'agent',\n"
    "          text: `Command failed: ${err instanceof Error ? err.message : String(err)}`,\n"
    "          patches: [],\n"
    "        }]);\n"
    "      }\n"
    "      setAgentBusy(false);\n"
    "      return;\n"
    "    }\n"
    "\n"
)
text = text.replace(marker, shell_block + marker, 1)
text = text.replace(
    "  }, [agentInput, agentBusy, activeTab, agentMode, agentEngine, voice]);",
    "  }, [agentInput, agentBusy, activeTab, agentMode, agentEngine, voice, reloadTree]);",
    1,
)

old_return = (
    "  return (\n"
    "    <motion.div className=\"h-full flex flex-col relative\" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>\n"
    "      <AnimatePresence>\n"
    "        {paletteOpen && ("
)
new_return = (
    "  return (\n"
    "    <motion.div className=\"h-full flex flex-col relative\" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>\n"
    "      <CodeStudioNameDialog\n"
    "        open={!!nameDialog}\n"
    "        title={nameDialog?.kind === 'folder' ? 'New folder path' : 'New file path'}\n"
    "        placeholder={nameDialog?.kind === 'folder' ? 'src/components' : 'src/App.tsx'}\n"
    "        onSubmit={(v) => { void handleNameDialogSubmit(v); }}\n"
    "        onCancel={() => setNameDialog(null)}\n"
    "      />\n"
    "      <AnimatePresence>\n"
    "        {paletteOpen && ("
)
if old_return not in text:
    raise SystemExit("return not found")
text = text.replace(old_return, new_return, 1)

path.write_text(text, encoding="utf-8")
print("Patched CodeEditorPage OK")
