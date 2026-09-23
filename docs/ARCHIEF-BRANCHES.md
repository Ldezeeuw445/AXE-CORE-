# Archief: branches van de oude historie

`orchestrator` begon op 9 september 2026 met een verse wortel (`a11873bb`). De
takken hieronder hangen aan de historie van dávoor en hebben **geen enkele
gemeenschappelijke voorouder** met `orchestrator`. `git merge` weigert ze dan
ook botweg — dat is geen instelling die je omzet, het zijn twee losse bomen.

## Ze missen niets

Gemeten op 10 september 2026: van elk van deze takken zijn de laatst gewijzigde
bestanden opgezocht in `orchestrator`. **Geen enkel bestand ontbrak daar.** Waar
ze verschillen, is `orchestrator` de nieuwere. Het werk uit deze takken zit
opgeslokt in de snapshot waar `orchestrator` mee begon; wat hier staat is de
historie ervan, niet de inhoud.

Ze zijn dus veilig te verwijderen, en dit bestand is de reden dat dat kan: zolang
de commit-sha hier staat, is elke tak terug te halen.

## Eentje terughalen

    git fetch origin
    git branch <naam> <sha>

## Alle 52 archiveren als tag en dan opruimen

Draai dit op een machine met push-rechten voor tags (de agent-sessie krijgt
daar 403 op):

    grep -E '^\| `' docs/ARCHIEF-BRANCHES.md | awk -F'`' '{print $2, $4}' \
      | while read b s; do git tag -f "archief/$b" "$s"; done
    git push origin 'refs/tags/archief/*'
    grep -E '^\| `' docs/ARCHIEF-BRANCHES.md | awk -F'`' '{print $2}' \
      | xargs -n 20 git push origin --delete

Pas als `git ls-remote --tags origin 'refs/tags/archief/*'` 52 regels geeft,
is het veilig om te verwijderen.

## Let op: `main` staat er ook tussen

De standaardtak van deze repo is `orchestrator` (bevestigd via
`git ls-remote --symref origin HEAD`), niet `main`. `main` is oude historie en
staat 1400+ commits van `orchestrator` af zonder gedeelde voorouder. Hij mag
dus weg — maar gooi een tak die `main` heet bewust weg en niet per ongeluk in
een `xargs`, want op de meeste repo's is dat wél de hoofdtak.

## De takken

| branch | sha | datum | laatste commit |
|---|---|---|---|
| `AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS` | `6e7b97cd280127cd3140ba0972b4f2d161e544d0` | 2026-07-17 | Add file upload endpoint and improve code editor UI |
| `axe/ml-improvements` | `00d75b17299fa84c12dc3b0f0374f856c65c4779` | 2026-07-29 | Add machine learning overview |
| `axe/obsidian-reflection-memory` | `19c424d09f11aa3b935b1949f6a67a7009a00175` | 2026-07-27 | feat: auto-write Obsidian reflections from every trust decis |
| `chore/axe-core-api-from-vps` | `189f876e3fae87ca5669e5e025bcfb6d72804a1c` | 2026-08-18 | Capture the running axe-core-api from the VPS |
| `claude/axe-core-architecture-7hm314` | `abb4bf6cab117b0f3d95f5cb69d58e92e50a9a0e` | 2026-07-23 | Stop leaking VITE_AXE_API_KEY from MCPCenter — endpoint do |
| `claude/axe-core-clean-architecture-82ig1d` | `cce964a36a80ba3d58840b1cedda1278cc5f570d` | 2026-07-20 | refactor: layer AXE-CORE-HEADQUARTERS frontend with clean ar |
| `claude/axe-core-clean-architecture-fxzudb` | `7af21b2ac5e0f9c222d7c88e3b05258468f5c34c` | 2026-07-20 | refactor: finish layer decoupling, enforce boundaries with E |
| `claude/axe-core-connection-404-ugyd5e` | `152c531d6c83955687461896b3e019d45e15a3e6` | 2026-07-29 | Remove redundant Conversation widget from left drawer — si |
| `claude/axe-core-refactor-14mjy7` | `f22b99b6d5db19d69f3576df51c315d379d53e38` | 2026-07-20 | refactor(headquarters): introduce clean architecture layers  |
| `claude/axe-core-refactor-5xdbof` | `d802e6dcef14ad9c79c22f432f15676efd2c9d34` | 2026-07-20 | refactor(headquarters): reorganize src into clean architectu |
| `claude/axe-neural-brain-ui-jznywh` | `113309e95e3734fb1cdab30efaa8fe76037853b3` | 2026-08-04 | feat(neural): rebuild Neural brain view as full Global Memor |
| `claude/stealth-ai-demand-fusion-ou4dux` | `fc1cf898846f99aaae37681c67ea175b612db216` | 2026-08-10 | fix(revenue/kits): deploy failed with 'cannot be run in a no |
| `cursor/axon-memory-mcp-3292` | `98e67f5f27bd7bffbd2373076bd2b7068e0b7121` | 2026-09-01 | Add axon-memory MCP server to Cursor project config |
| `cursor/comet-browser-3292` | `03f5f6416306886e617e4c49e4311b4c4d70f7ed` | 2026-09-02 | Add lightweight browser demo entry (browser-demo.html) |
| `feat/android-shell-support` | `076d719d40ae9c45d23c63a63d77d8c1140731de` | 2026-08-18 | Make the web build work inside the AXE Core Android shell |
| `feat/axe-approval-gated-awareness` | `950a1f97bda4f4cd0444e34c50567713124e265d` | 2026-07-29 | feat: connect awareness proposals to approval flow |
| `feat/axe-mobile-system` | `393b0f65edf3c485747d098a0c34ddacf17f576f` | 2026-08-16 | Add AXE mobile command system |
| `feat/durable-task-kernel` | `5c1444ddc62bc615ab1b4f7288092b2ce5ef1c82` | 2026-08-16 | feat(orchestrator): add durable task execution kernel |
| `feat/global-error-toaster` | `7c118814d48e96fc1dfaa2cdd87d792c302d4fe1` | 2026-07-29 | feat: add global Sonner error feedback |
| `feat/home-stage` | `15a6541604f4a9fca6058c21592328e041e2bfe7` | 2026-09-08 | De linkerbalk was een kopie van zeven tabs, op alle 27 pagin |
| `feat/phone-fullscreen-chart` | `f9295a133845de6b7f7d7547d556290da8f3d6bd` | 2026-08-18 | Give the chart the whole screen inside the Android shell |
| `feat/sphere-hologram-portal` | `d4fc8d36389a5f4b26047781534f10573c52bf13` | 2026-08-01 | feat(sphere): code projection layout for hologram portal |
| `feature/3d-brain-memory` | `36c3f5515cc29ad69866857b0ff9721030856660` | 2026-08-03 | feat(neural): full 3D particle brain memory on Home — rota |
| `feature/codeeditor-design-agent-wire` | `bf32f6a5d9e619c9bf0bb31a7c04867cadc450ae` | 2026-07-31 | fix: restore full CodeEditorPage.tsx (revert broken shim) |
| `feature/codeeditor-design-agent-wire-restore` | `6199ec6c2fdea999535afaf2126a04afb9086841` | 2026-07-31 | feat: wire Design Mode → Code Agent in CodeEditorPage (ful |
| `feature/codeeditor-wire-applied` | `f5e4f091757049bdfd0cc0bc0fb0c7128e2132bb` | 2026-08-01 | ci: trigger apply-design-wire on this branch |
| `feature/design-agent-wire-final` | `887c300424d0b9e3d825f078c1bbcd792523fae5` | 2026-08-01 | chore: codeeditor wire b64 part00 |
| `feature/design-mode-preview-and-files-move` | `20cfc03ef41028bcd47c38e97967a28bce08ccbe` | 2026-07-31 | docs(vps): snippet for POST /files/move to paste into main.p |
| `feature/thinkthanks` | `38ed065256ee6cc919213f15fb3faf8aae4976b5` | 2026-08-05 | fix(memory): make writes actually reach global_memory |
| `feature/unified-global-brain` | `938b99111f568c08ee13ff73771e989fdce275f8` | 2026-08-03 | fix: syntax error in fallbackSaveRagMemory |
| `feature/vector-memory-embeddings` | `f7e6a1b379b76744a16e9dcbdfde5c0458aa570c` | 2026-08-03 | fix: relative import for embeddings in knowledge.py |
| `feature/wire-design-to-agent` | `b127cff5e503758d2f2ee248bd9d15a53ea24221` | 2026-07-31 | docs: Design Mode → Code Agent wire-up steps |
| `feature/zed-like-code-editor` | `6fedb877267fe2522a370f349825870ff31426df` | 2026-07-31 | feat(code-studio): wire LiveGitPanel, drag-resize splits, fi |
| `fix/brain-scorecard-narrow` | `6e8e7942b1b9ba62a17c798ebe1f938fea32f1b7` | 2026-08-18 | Brain and Scorecard tabs on a narrow screen |
| `fix/chat-type-and-files-move` | `b406fd8ea8695786183181497a3f30b0bd4fe100` | 2026-08-01 | fix: larger SidebarChat type + VPS POST /files/move endpoint |
| `fix/code-studio-persist-and-agent` | `e36ecc30fd04507c242b16fdd559ccd46ee6f3ba` | 2026-08-01 | fix: real apply_code_studio_fixes.py |
| `fix/durable-task-migration` | `0226d6d0fd1db8484a9a29686eadce29caccf3cc` | 2026-08-16 | fix(orchestrator): make durable task migration production-sa |
| `fix/killswitch-trades-journal` | `b9e5809b92df6a51e4802fa926839d87bf237a26` | 2026-09-08 | Fix: live trade reconciler only reconciled one account |
| `fix/larger-axe-chat-type` | `e1fd4a9bbb4521ae5c98dc34241ee90ea972d3a5` | 2026-07-29 | fix: increase AXE chat message font size |
| `fix/neural-black-bg` | `1580f12d5f9287db85de6bb2e673d603e652077e` | 2026-08-03 | style(obsidian-graph): pure black background to match Neural |
| `fix/no-paper-account-sizing` | `f92b1e52cabec196a8503bf77979bdfcc63f3175` | 2026-08-18 | Never size against the paper account |
| `fix/no-paper-fills` | `06053da30d964cb9901223798d6f92f32dcd56b5` | 2026-08-18 | Stop inventing fills and starting capital |
| `fix/session-memory-noise` | `3c4e3ce1fbfd51f39743ee5f78321b72b1c05fc4` | 2026-08-18 | Stop writing one memory per app launch |
| `fix/sphere-actually-visible` | `f415e3d0d89694e6a5e3995d02a4b66a7eedbab4` | 2026-08-01 | fix(home): keep SphereStage mounted + force Core when living |
| `fix/sphere-interactive-maplibre` | `f9e4b2cbb0dae783a566aad1a1c08284d9499fb1` | 2026-08-02 | fix(sphere): always use interactive MapLibre on Home (skip b |
| `fix/sphere-living-on-home` | `282d1a99a84b8cdace3e21fad7a044a8db3d0a46` | 2026-08-01 | fix(sphere): XR stays on Home — no Maps3D tab fallback |
| `fix/sphere-map-always-project` | `54d19c6a0beec1be4b184253788b71daa5bae10d` | 2026-08-01 | fix(maps3d): honor lat/lng/label query from sphere 3D button |
| `fix/sphere-map-large-square` | `8978476a5b027a773240831c1c2295b429e8e69b` | 2026-08-02 | feat(sphere): large square map portal for comfortable pan/zo |
| `fix/sphere-map-xl-gestures` | `e1da59b6c9b0fad42643e82c4a53b823d7f751e2` | 2026-08-02 | fix(sphere): better pan/zoom — uncontrolled Google map, gr |
| `fix/sphere-map-xr` | `ecaea6f3a82502b263ad0195014b2d52c809f827` | 2026-08-01 | feat(sphere): install SphereXR on app bootstrap |
| `main` | `d1ef5c13a7821b733a88583636f62bb54f47c1b6` | 2026-07-29 | feat(ui): upgrade HolographicSphere to cinematic 3D visual s |
| `ui-god-mode-sphere` | `350849434e0ed63bd1c7db86f001f6836f0f3e09` | 2026-07-28 | feat(ui): upgrade HolographicSphere with cinematic postproce |
