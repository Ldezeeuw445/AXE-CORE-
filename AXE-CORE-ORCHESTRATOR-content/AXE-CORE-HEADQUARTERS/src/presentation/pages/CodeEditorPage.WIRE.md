# Wire CodeStudioExtras into CodeEditorPage

## Imports
```ts
import {
  listWorkspaceDirectory, readWorkspaceFile, writeWorkspaceFile,
  createWorkspaceEntry, deleteWorkspaceEntry, searchWorkspace,
  moveWorkspaceEntry,
  type SearchResult,
} from '@/infrastructure/persistence/workspaceFilesService';
import {
  LiveGitPanel, SplitResizeHandle,
  setDragFilePath, getDragFilePath,
} from '@/presentation/components/axe-core/CodeStudioExtras';
```

## FileTreeItem
- Add `onMove?: (from: string, toFolder: string) => void`
- `draggable`
- `onDragStart` → setDragFilePath
- folders: `onDragOver` preventDefault, `onDrop` → onMove(from, node.path)

## State
```ts
const [splitRatio, setSplitRatio] = useState(0.5);
```

## moveNode
```ts
const moveNode = useCallback(async (from: string, toFolder: string) => {
  const name = from.split('/').pop()!;
  const to = toFolder ? `${toFolder}/${name}` : name;
  if (to === from) return;
  try {
    await moveWorkspaceEntry(from, to);
    // reload root tree
    const nodes = await listWorkspaceDirectory('');
    setFileTree(nodes.map(n => ({ ...n, expanded: false, loaded: n.type === 'file' })));
    setOpenTabs(prev => prev.map(t => t.path === from || t.path.startsWith(from + '/')
      ? { ...t, path: t.path === from ? to : to + t.path.slice(from.length), name: t.path === from ? name : t.name }
      : t));
    if (activeTabPath === from) setActiveTabPath(to);
    toast.success?.(`Moved to ${to}`) ?? toast(`Moved to ${to}`);
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err));
  }
}, [activeTabPath]);
```

## Git sidebar
Replace the whole `sidebarMode === 'git'` block with:
```tsx
{sidebarMode === 'git' && (
  <LiveGitPanel onRunInTerminal={(cmd) => {
    setShowTerminal(true);
    setTimeout(() => termRef.current?.send(cmd + '\n'), 80);
  }} />
)}
```

## Splits
```tsx
<div id="axe-split-container" className={`flex-1 min-h-0 flex ${splitMode === 'horizontal' ? 'flex-col' : 'flex-row'}`}>
  <div style={{ flex: splitMode === 'none' ? 1 : `0 0 ${splitRatio * 100}%`, minWidth: 0, minHeight: 0, display: 'flex' }}>
    <EditorPane ... />
  </div>
  {splitMode !== 'none' && (
    <>
      <SplitResizeHandle orientation={splitMode === 'vertical' ? 'vertical' : 'horizontal'} onRatioChange={setSplitRatio} />
      <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex' }}>
        <EditorPane tab={splitTab} ... />
      </div>
    </>
  )}
</div>
```
