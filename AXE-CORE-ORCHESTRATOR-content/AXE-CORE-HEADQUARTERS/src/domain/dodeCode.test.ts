import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Zes keer op één dag bleek code te bestaan, getest te zijn, en door niemand
 * te worden aangeroepen: applyAgentReinforcement, proxyErrorMessage,
 * computerRelay, de --m-*-kleurtokens, en twee andere. Elke keer: gebouwd,
 * en de leiding nooit aangesloten (zie WERKVERDELING.md, COWORK 2).
 *
 * Deze test bewaakt niet OF zulke gevallen bestaan -- dat rapport staat in
 * SCHOONMAAK.md -- maar dat er geen NIEUWE bijkomen. Hij loopt zelf door
 * src/**\/*.{ts,tsx}, zoekt exports op het hoogste niveau, en controleert of
 * de naam ook ergens ANDERS voorkomt (een ander bronbestand of een test).
 * Komt hij nergens anders voor, dan moet hij op de uitzonderingslijst staan
 * met een reden -- staat hij er niet op, dan faalt de test.
 *
 * De lijst hieronder is de stand van vandaag (295 gevallen, gemeten
 * tijdens de schoonmaak-inventarisatie van 9 september 2026 -- zie
 * SCHOONMAAK.md hoofdstuk 2c voor het volledige rapport per geval). Los je er
 * een op, haal hem van de lijst. Vind de test een nieuwe, voeg je hem toe
 * ALLEEN als je hebt uitgezocht dat hij echt bedoeld is om (nog) niet
 * aangeroepen te worden -- anders sluit je hem aan.
 *
 * Bewuste beperking: deze test bewaakt geëxporteerde functies binnen een
 * bestand dat meedraait. Een heel bestand dat onbereikbaar is vanaf
 * src/app/main.tsx (SCHOONMAAK.md hoofdstuk 1) vereist de volledige
 * import-graaf van de app -- te kwetsbaar om in een snelle unit-test te
 * herhalen. Die controle blijft handwerk.
 */

const REPO_ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');
const SRC_ROOT = path.join(REPO_ROOT, 'src');

// [bestand relatief aan de repo-root, exportnaam] -- gevonden 9 sept 2026,
// geen aanroeper buiten het eigen bestand. Detail per geval: SCHOONMAAK.md.
const UITZONDERINGEN: ReadonlyArray<readonly [string, string]> = [
  ['src/application/agents/agenticEditBridge.ts', 'runEditCodeTool'],
  ['src/application/agents/agenticEngine.ts', 'isAgenticModeEnabled'],
  ['src/application/agents/agenticEngine.ts', 'setAgenticMode'],
  ['src/application/agents/codeEditorAgent.ts', 'clearPendingEdit'],
  ['src/application/agents/codeEditorAgent.ts', 'getEditStats'],
  ['src/application/agents/codeEditorAgent.ts', 'getRecentEdits'],
  ['src/application/agents/langGraphOrchestrator.ts', 'classifyBranch'],
  ['src/application/agents/langGraphOrchestrator.ts', 'orderSlotsForBranch'],
  ['src/application/browser/browserAIService.ts', 'getBrowserAIHealth'],
  ['src/application/browser/browserAIService.ts', 'pollBrowserAITask'],
  ['src/application/sphere/sphereDirector.ts', 'directFromAssistantMessage'],
  ['src/application/sphere/sphereDirector.ts', 'projectionFromAttachment'],
  ['src/application/sphere/sphereDirector.ts', 'projectionFromResolved'],
  ['src/application/sphere/toolBridge.ts', 'presentToolResult'],
  ['src/application/sphere/toolBridge.ts', 'projectionFromToolResult'],
  ['src/application/system/axeBootstrap.ts', 'maybeDailyGreeting'],
  ['src/application/system/axeBootstrap.ts', 'maybeNightlyReview'],
  ['src/application/system/axeBootstrap.ts', 'maybeSeedObsidianWelcome'],
  ['src/application/system/axeBootstrap.ts', 'maybeSyncObsidianVault'],
  ['src/application/system/axeBootstrap.ts', 'warmLocalOllamaAtBoot'],
  ['src/application/system/axeBootstrap.ts', 'warmPrimaryAtBoot'],
  ['src/application/system/systemService.ts', 'getServiceState'],
  ['src/application/tools/toolRegistry.phone.ts', 'phoneStatusLine'],
  ['src/application/tradingIntel/agentAutopilot.ts', 'getAutopilotIntervalMin'],
  ['src/application/tradingIntel/agentAutopilot.ts', 'isAutopilotEnabled'],
  ['src/application/tradingIntel/agentAutopilot.ts', 'maybeSelfTest'],
  ['src/application/tradingIntel/cycleJournalService.ts', 'loadCycleJournal'],
  ['src/application/tradingIntel/deskAgentModels.ts', 'modelForAgent'],
  ['src/application/tradingIntel/deskDecisionsService.ts', 'gradeDecision'],
  ['src/application/tradingIntel/liveTradeReconciler.ts', 'decisionFromTag'],
  ['src/application/tradingIntel/liveTradeReconciler.ts', 'validStrategyTag'],
  ['src/application/tradingIntel/researchRotation.ts', 'leadSymbol'],
  ['src/application/tradingIntel/tradingAgentEngine.ts', 'latestIntelForSymbol'],
  ['src/application/workflows/workflowBuilder.ts', 'intentToWorkflowSpec'],
  ['src/application/workflows/workflowBuilder.ts', 'validateWorkflowSpec'],
  ['src/domain/catalogs/eveSkills.ts', 'getAllEveSkills'],
  ['src/domain/chatRouting.ts', 'forcePrimaryVoice'],
  ['src/domain/chatRouting.ts', 'limitSimpleChatSlots'],
  ['src/domain/memory/hubClassifier.ts', 'hubForAgentRow'],
  ['src/domain/navRegistry.ts', 'loadDynamicNavItems'],
  ['src/domain/providers.ts', 'applyPrimarySlot'],
  ['src/domain/providers.ts', 'limitChatIdentityCascade'],
  ['src/domain/providers.ts', 'resolveOllamaModel'],
  ['src/domain/proxyProvider.ts', 'wordtHernoemd'],
  ['src/domain/replyLanguage.ts', 'ttsPreviewLine'],
  ['src/domain/skills/skillCatalog.ts', 'getBuiltinSkill'],
  ['src/domain/skills/skillCatalog.ts', 'skillsByCategory'],
  ['src/domain/tools/toolSchemas.ts', 'promptBudget'],
  ['src/domain/tradingIntel/decisionFunnel.ts', 'meanOfLast'],
  ['src/domain/tradingIntel/decisionFunnel.ts', 'returnsOf'],
  ['src/infrastructure/config/audioUnlock.ts', 'isAudioUnlocked'],
  ['src/infrastructure/config/providerConnectionDefaults.ts', 'getDefaultProviderBaseUrl'],
  ['src/infrastructure/config/providerConnectionDefaults.ts', 'getProxyProviderBaseUrl'],
  ['src/infrastructure/gateways/airtopService.ts', 'airtopClose'],
  ['src/infrastructure/gateways/airtopService.ts', 'airtopLoadUrl'],
  ['src/infrastructure/gateways/airtopService.ts', 'airtopReachable'],
  ['src/infrastructure/gateways/axeCoreApiService.ts', 'apiAgentsStatus'],
  ['src/infrastructure/gateways/axeCoreApiService.ts', 'apiApproveTask'],
  ['src/infrastructure/gateways/axeCoreApiService.ts', 'apiExecuteCrewAI'],
  ['src/infrastructure/gateways/axeCoreApiService.ts', 'apiGetPatch'],
  ['src/infrastructure/gateways/axeCoreApiService.ts', 'apiGetTask'],
  ['src/infrastructure/gateways/axeCoreApiService.ts', 'apiHookLangGraph'],
  ['src/infrastructure/gateways/axeCoreApiService.ts', 'apiHookN8n'],
  ['src/infrastructure/gateways/axeCoreApiService.ts', 'apiListTasks'],
  ['src/infrastructure/gateways/axeCoreApiService.ts', 'apiRejectTask'],
  ['src/infrastructure/gateways/axeCoreApiService.ts', 'apiRunLangGraph'],
  ['src/infrastructure/gateways/axeCoreApiService.ts', 'apiTriggerN8n'],
  ['src/infrastructure/gateways/axeCoreApiService.ts', 'claimDurableTask'],
  ['src/infrastructure/gateways/axeCoreApiService.ts', 'decideDurableTaskApproval'],
  ['src/infrastructure/gateways/axeCoreApiService.ts', 'ghListRepos'],
  ['src/infrastructure/gateways/axeCoreApiService.ts', 'heartbeatDurableTask'],
  ['src/infrastructure/gateways/axeCoreApiService.ts', 'mcpListServers'],
  ['src/infrastructure/gateways/axeCoreApiService.ts', 'mcpSaveServers'],
  ['src/infrastructure/gateways/axeCoreApiService.ts', 'memStats'],
  ['src/infrastructure/gateways/axeCoreApiService.ts', 'n8nActivate'],
  ['src/infrastructure/gateways/axeCoreApiService.ts', 'n8nDeactivate'],
  ['src/infrastructure/gateways/axeCoreApiService.ts', 'n8nExecute'],
  ['src/infrastructure/gateways/axeCoreApiService.ts', 'n8nGetWorkflow'],
  ['src/infrastructure/gateways/axeCoreApiService.ts', 'n8nListExecutions'],
  ['src/infrastructure/gateways/axeCoreApiService.ts', 'n8nUpdateWorkflow'],
  ['src/infrastructure/gateways/axeCoreApiService.ts', 'requestDurableTaskApproval'],
  ['src/infrastructure/gateways/axeCoreApiService.ts', 'transitionDurableTask'],
  ['src/infrastructure/gateways/axeCoreApiService.ts', 'vercelGetDeployment'],
  ['src/infrastructure/gateways/brokerConnector.ts', 'brokerAccountSummary'],
  ['src/infrastructure/gateways/brokerConnector.ts', 'setBrokerConnection'],
  ['src/infrastructure/gateways/companionToolsService.ts', 'triggerCompanionCorrelation'],
  ['src/infrastructure/gateways/computerRelay.ts', 'deviceCanRun'],
  ['src/infrastructure/gateways/e2bService.ts', 'e2bRunPython'],
  ['src/infrastructure/gateways/exaSearchService.ts', 'saveExaApiKey'],
  ['src/infrastructure/gateways/firecrawlService.ts', 'firecrawlSearch'],
  ['src/infrastructure/gateways/geminiLiveService.ts', 'isGeminiLiveAvailable'],
  ['src/infrastructure/gateways/geminiLiveService.ts', 'stopGeminiLive'],
  ['src/infrastructure/gateways/globalTts.ts', 'getActiveTtsProvider'],
  ['src/infrastructure/gateways/globalTts.ts', 'stopGlobalTts'],
  ['src/infrastructure/gateways/kimiClawService.ts', 'browserCloseSession'],
  ['src/infrastructure/gateways/kimiClawService.ts', 'browserHealth'],
  ['src/infrastructure/gateways/kimiClawService.ts', 'browserSession'],
  ['src/infrastructure/gateways/kimiClawService.ts', 'clawDeepResearch'],
  ['src/infrastructure/gateways/kimiClawService.ts', 'clawScrape'],
  ['src/infrastructure/gateways/kimiClawService.ts', 'kimiCodeDebug'],
  ['src/infrastructure/gateways/kimiClawService.ts', 'kimiWorkAnalyzeDocument'],
  ['src/infrastructure/gateways/kimiClawService.ts', 'kimiWorkExtractEntities'],
  ['src/infrastructure/gateways/livekitService.ts', 'loadVoiceSettings'],
  ['src/infrastructure/gateways/livekitService.ts', 'saveVoiceSettings'],
  ['src/infrastructure/gateways/llmGateway.ts', 'callWithFallbackDetailed'],
  ['src/infrastructure/gateways/localBridgeService.ts', 'isLocalBridgeUp'],
  ['src/infrastructure/gateways/localBridgeService.ts', 'localBridgeUnavailableReason'],
  ['src/infrastructure/gateways/localBridgeService.ts', 'localList'],
  ['src/infrastructure/gateways/localOllama.ts', 'invalidateLocalOllamaProbe'],
  ['src/infrastructure/gateways/localOllama.ts', 'listLocalOllamaModels'],
  ['src/infrastructure/gateways/lseGateway.ts', 'lseCandles'],
  ['src/infrastructure/gateways/lseGateway.ts', 'lseCatalog'],
  ['src/infrastructure/gateways/lseGateway.ts', 'lseSeries'],
  ['src/infrastructure/gateways/maps3d/ollamaApi.ts', 'isOllamaAvailable'],
  ['src/infrastructure/gateways/maps3d/ollamaApi.ts', 'listOllamaModels'],
  ['src/infrastructure/gateways/maps3d/ollamaApi.ts', 'queryOllama'],
  ['src/infrastructure/gateways/maps3d/ollamaApi.ts', 'queryOllamaStream'],
  ['src/infrastructure/gateways/metaApiBudget.ts', '__budgetLimits'],
  ['src/infrastructure/gateways/metaApiService.ts', 'clearMetaApiConfig'],
  ['src/infrastructure/gateways/metaApiService.ts', 'metaApiCancelOrder'],
  ['src/infrastructure/gateways/metaApiService.ts', 'metaApiListSymbols'],
  ['src/infrastructure/gateways/metaApiService.ts', 'metaApiListSymbolsFor'],
  ['src/infrastructure/gateways/n8nService.ts', 'deleteExecution'],
  ['src/infrastructure/gateways/n8nService.ts', 'deleteWorkflow'],
  ['src/infrastructure/gateways/n8nService.ts', 'getExecution'],
  ['src/infrastructure/gateways/n8nService.ts', 'getExecutions'],
  ['src/infrastructure/gateways/n8nService.ts', 'getWorkflow'],
  ['src/infrastructure/gateways/n8nService.ts', 'listWorkflows'],
  ['src/infrastructure/gateways/n8nService.ts', 'retryExecution'],
  ['src/infrastructure/gateways/n8nService.ts', 'triggerWebhook'],
  ['src/infrastructure/gateways/phoneBridgeService.ts', 'phoneIsReady'],
  ['src/infrastructure/gateways/qdrantService.ts', 'qdrantEnsureCollection'],
  ['src/infrastructure/gateways/qdrantService.ts', 'qdrantSearch'],
  ['src/infrastructure/gateways/qdrantService.ts', 'qdrantUpsertText'],
  ['src/infrastructure/gateways/repoHealthService.ts', 'assertReposReadyForBuild'],
  ['src/infrastructure/gateways/repoHealthService.ts', 'validateAllRepos'],
  ['src/infrastructure/gateways/researchSources.ts', 'fetchEodHistory'],
  ['src/infrastructure/gateways/researchSources.ts', 'perigonLimits'],
  ['src/infrastructure/gateways/researchSources.ts', 'saveResearchSourceKeys'],
  ['src/infrastructure/gateways/smartThingsService.ts', 'getSmartThingsToken'],
  ['src/infrastructure/gateways/smartThingsService.ts', 'setSmartThingsToken'],
  ['src/infrastructure/gateways/unusualWhalesGateway.ts', '__resetUwKeyCache'],
  ['src/infrastructure/gateways/unusualWhalesGateway.ts', 'fetchFlowAlerts'],
  ['src/infrastructure/gateways/unusualWhalesGateway.ts', 'fetchMarketTide'],
  ['src/infrastructure/gateways/whisperService.ts', 'isRecording'],
  ['src/infrastructure/gateways/whisperService.ts', 'recordUtterance'],
  ['src/infrastructure/gateways/whisperService.ts', 'resolveWhisperConfig'],
  ['src/infrastructure/gateways/whisperService.ts', 'transcribeAudio'],
  ['src/infrastructure/gateways/windowManagerService.ts', 'listMonitors'],
  ['src/infrastructure/gateways/windowManagerService.ts', 'restoreWindowLayout'],
  ['src/infrastructure/maps/googleMaps3DLoader.ts', 'loadMaps3D'],
  ['src/infrastructure/persistence/capabilityService.ts', 'getCapability'],
  ['src/infrastructure/persistence/capabilityService.ts', 'invalidateCapabilityCache'],
  ['src/infrastructure/persistence/capabilityService.ts', 'loadLocalCapabilities'],
  ['src/infrastructure/persistence/continuousMemoryService.ts', 'rememberSessionOpen'],
  ['src/infrastructure/persistence/crewToolsConfigService.ts', 'saveCrewToolsConfig'],
  ['src/infrastructure/persistence/demoTradingService.ts', 'positionFor'],
  ['src/infrastructure/persistence/embeddingService.ts', 'localEmbed'],
  ['src/infrastructure/persistence/globalBrainService.ts', 'syncObsidianIntoGlobalBrain'],
  ['src/infrastructure/persistence/globalMemoryService.ts', 'getBestSpecialist'],
  ['src/infrastructure/persistence/globalMemoryService.ts', 'initializeGlobalMemory'],
  ['src/infrastructure/persistence/globalMemoryService.ts', 'loadMemoriesByCategory'],
  ['src/infrastructure/persistence/globalMemoryService.ts', 'logSystemEvent'],
  ['src/infrastructure/persistence/globalMemoryService.ts', 'recordAgentPerformance'],
  ['src/infrastructure/persistence/globalMemoryService.ts', 'recordProviderPerformance'],
  ['src/infrastructure/persistence/globalMemoryService.ts', 'recordSpecialistMatch'],
  ['src/infrastructure/persistence/llmModelRegistryService.ts', 'getDefaultLlmModelRegistry'],
  ['src/infrastructure/persistence/llmModelRegistryService.ts', 'loadLlmModelRegistry'],
  ['src/infrastructure/persistence/memoryRecorder.ts', 'flushMemoryNow'],
  ['src/infrastructure/persistence/memoryRecorder.ts', 'pendingMemoryCount'],
  ['src/infrastructure/persistence/memoryStatsService.ts', 'getMemoryGrowthHistory'],
  ['src/infrastructure/persistence/obsidianMemoryService.ts', 'extractWikilinks'],
  ['src/infrastructure/persistence/obsidianVaultSyncService.ts', 'noteToMarkdown'],
  ['src/infrastructure/persistence/obsidianVaultSyncService.ts', 'pullNotesFromVault'],
  ['src/infrastructure/persistence/obsidianVaultSyncService.ts', 'syncAllNotesToVault'],
  ['src/infrastructure/persistence/ragMemoryService.ts', 'initializeRagMemory'],
  ['src/infrastructure/persistence/repoConfigService.ts', 'getRepoById'],
  ['src/infrastructure/persistence/repoConfigService.ts', 'setCodeWriteMode'],
  ['src/infrastructure/persistence/runtimeEditsService.ts', 'loadAgentOverrides'],
  ['src/infrastructure/persistence/runtimeLayoutService.ts', 'loadNodePositions'],
  ['src/infrastructure/persistence/runtimeLayoutService.ts', 'saveNodePositions'],
  ['src/infrastructure/persistence/sharedMemory.ts', 'batchSetMemory'],
  ['src/infrastructure/persistence/sharedMemory.ts', 'cleanupExpiredMemory'],
  ['src/infrastructure/persistence/sharedMemory.ts', 'getMemory'],
  ['src/infrastructure/persistence/sharedMemory.ts', 'getMemoryValue'],
  ['src/infrastructure/persistence/sharedMemory.ts', 'listMemoryKeys'],
  ['src/infrastructure/persistence/sharedMemory.ts', 'loadAgentContext'],
  ['src/infrastructure/persistence/sharedMemory.ts', 'saveAgentContext'],
  ['src/infrastructure/persistence/skillRegistryService.ts', 'listSkillsGrouped'],
  ['src/infrastructure/persistence/skillRegistryService.ts', 'loadCustomSkills'],
  ['src/infrastructure/persistence/skillRegistryService.ts', 'loadSkillAssignments'],
  ['src/infrastructure/persistence/skillRegistryService.ts', 'saveCustomSkills'],
  ['src/infrastructure/persistence/skillRegistryService.ts', 'saveSkillAssignments'],
  ['src/infrastructure/persistence/thinkTankGit.ts', 'isProtectedBranch'],
  ['src/infrastructure/persistence/thinkTankGit.ts', 'resolveWriteBranch'],
  ['src/infrastructure/persistence/thinkTankGit.ts', 'thinkTankBranchName'],
  ['src/infrastructure/persistence/thinkThanksService.ts', 'extractUrls'],
  ['src/infrastructure/persistence/thinkThanksService.ts', 'getThinkThanksItem'],
  ['src/infrastructure/persistence/thinkThanksService.ts', 'isInstagramUrl'],
  ['src/infrastructure/persistence/thinkThanksService.ts', 'upsertThinkThanksItem'],
  ['src/infrastructure/persistence/tradeNotesService.ts', 'tradeNoteMarkdown'],
  ['src/infrastructure/persistence/tradingAccountsService.ts', 'renameAccount'],
  ['src/infrastructure/persistence/tradingAgentBrain.ts', 'brainStats'],
  ['src/infrastructure/persistence/tradingAgentBrain.ts', 'buildBrainContext'],
  ['src/infrastructure/persistence/tradingAgentBrain.ts', 'recordCorrelation'],
  ['src/infrastructure/persistence/tradingIntelService.ts', 'addToWatchlist'],
  ['src/infrastructure/persistence/tradingIntelService.ts', 'archiveIntelReport'],
  ['src/infrastructure/persistence/tradingIntelService.ts', 'getIntelReport'],
  ['src/infrastructure/persistence/tradingIntelService.ts', 'inferAssetClass'],
  ['src/infrastructure/persistence/tradingIntelService.ts', 'removeFromWatchlist'],
  ['src/infrastructure/persistence/tradingLedgerService.ts', 'bestStrategyForPair'],
  ['src/infrastructure/persistence/tradingRiskService.ts', 'applyPresetToAccount'],
  ['src/infrastructure/persistence/tradingRiskService.ts', 'loadRiskPresets'],
  ['src/infrastructure/persistence/tradingRiskService.ts', 'saveRiskPresets'],
  ['src/infrastructure/persistence/unifiedMemoryService.ts', 'layerOf'],
  ['src/infrastructure/persistence/unifiedMemoryService.ts', 'loadUnifiedMemoryCounts'],
  ['src/infrastructure/persistence/userSettingsService.ts', 'deleteSetting'],
  ['src/infrastructure/persistence/userSettingsService.ts', 'loadAgentModelChoicesDurable'],
  ['src/infrastructure/supabase/supabaseClient.ts', 'resetSupabaseClient'],
  ['src/infrastructure/ui/nativePrompt.ts', 'nativePrompt'],
  ['src/presentation/components/axe-core/AgentChatHub.tsx', 'AgentChatHub'],
  ['src/presentation/components/axe-core/ArchitectureRedesign.tsx', 'ArchitectureRedesign'],
  ['src/presentation/components/axe-core/ChatToolbar.tsx', 'ChatToolbar'],
  ['src/presentation/components/axe-core/CodeEditor.tsx', 'CodeEditor'],
  ['src/presentation/components/axe-core/CodeStudioNameDialog.tsx', 'CodeStudioNameDialog'],
  ['src/presentation/components/axe-core/CodeStudioNameDialog.tsx', 'loadAgentInput'],
  ['src/presentation/components/axe-core/CodeStudioNameDialog.tsx', 'loadAgentMessages'],
  ['src/presentation/components/axe-core/CodeStudioNameDialog.tsx', 'saveAgentInput'],
  ['src/presentation/components/axe-core/CodeStudioNameDialog.tsx', 'saveAgentMessages'],
  ['src/presentation/components/axe-core/DesignAgentWireHost.tsx', 'DesignAgentWireHost'],
  ['src/presentation/components/axe-core/MemoryPanel.tsx', 'MemoryPanel'],
  ['src/presentation/components/axe-core/OrganizationCanvas.tsx', 'OrganizationCanvas'],
  ['src/presentation/components/axe-core/SidebarChat.tsx', 'SidebarChat'],
  ['src/presentation/components/axe-core/sceneBackdrop.tsx', 'heeftPlaat'],
  ['src/presentation/components/axe-core/sceneBackdrop.tsx', 'useIsGlassLook'],
  ['src/presentation/components/axe-core/sphere/SphereXR.ts', 'checkXRSupport'],
  ['src/presentation/components/axe-core/sphere/projections/Map3DProjection.tsx', 'Map3DProjection'],
  ['src/presentation/components/axe-core/sphere/projections/Map3DProjection.tsx', 'Map3DProjectionRoot'],
  ['src/presentation/components/axe-core/sphere/projections/Map3DProjection.tsx', 'hasGoogle3DMaps'],
  ['src/presentation/components/axe-core/sphere/projections/MapProjection.tsx', 'MapProjection'],
  ['src/presentation/components/axe-core/terrain/terrainEngine.ts', 'createNoise2D'],
  ['src/presentation/components/browser/AxeSpherePanel.tsx', 'AxeSpherePanel'],
  ['src/presentation/components/browser/NavigationBar.tsx', 'NavigationBar'],
  ['src/presentation/components/browser/SidebarPanels.tsx', 'SidebarPanels'],
  ['src/presentation/components/shared/GlassPanel.tsx', 'GlassPanel'],
  ['src/presentation/components/surface/Surface.tsx', 'Chip'],
  ['src/presentation/components/surface/Surface.tsx', 'GhostButton'],
  ['src/presentation/components/trading/StrategyDot.tsx', 'StrategyDots'],
  ['src/presentation/components/trading/StrategyDot.tsx', 'TimeframeMarks'],
  ['src/presentation/components/trading/companion/PositionLabelsOverlay.tsx', 'slTpDraftKeyForOrder'],
  ['src/presentation/components/trading/companion/PositionLabelsOverlay.tsx', 'slTpDraftKeyForPosition'],
  ['src/presentation/components/trading/companion/chartTheme.ts', 'readChartThemeKey'],
  ['src/presentation/components/trading/companion/chartTheme.ts', 'readGridStyle'],
  ['src/presentation/components/trading/companion/chartTheme.ts', 'writeChartThemeKey'],
  ['src/presentation/components/trading/companion/chartTheme.ts', 'writeGridStyle'],
  ['src/presentation/components/trading/companion/indicatorMapping.ts', 'describeResolvedLayers'],
  ['src/presentation/components/trading/companion/indicatorMapping.ts', 'resolveIndicatorNames'],
  ['src/presentation/components/trading/companion/indicatorMath.ts', 'stddevSeries'],
  ['src/presentation/components/trading/companion/symbolFormat.ts', 'contractSizeForSymbol'],
  ['src/presentation/components/trading/companion/symbolFormat.ts', 'isEquityCfdSymbol'],
  ['src/presentation/components/trading/companion/symbolFormat.ts', 'isForexPairSymbol'],
  ['src/presentation/components/trading/companion/symbolFormat.ts', 'pointValueForSymbol'],
  ['src/presentation/components/trading/smcDetect.ts', 'detectFib'],
  ['src/presentation/components/trading/smcDetect.ts', 'detectFvgs'],
  ['src/presentation/components/trading/smcDetect.ts', 'detectIfvgs'],
  ['src/presentation/components/trading/smcDetect.ts', 'detectOrderBlocks'],
  ['src/presentation/components/trading/smcDetect.ts', 'detectPdhPdl'],
  ['src/presentation/components/widgets/HabitTrackerWidget.tsx', 'HabitTrackerWidget'],
  ['src/presentation/components/widgets/MetricDisplay.tsx', 'MetricDisplay'],
  ['src/presentation/components/widgets/ProgressRing.tsx', 'ProgressRing'],
  ['src/presentation/components/widgets/SmartHomeWidget.tsx', 'SmartHomeWidget'],
  ['src/presentation/components/widgets/SmartRingWidget.tsx', 'SmartRingWidget'],
  ['src/presentation/maps3d/audio.ts', 'playAlertSound'],
  ['src/presentation/maps3d/audio.ts', 'playBeep'],
  ['src/presentation/maps3d/audio.ts', 'playClick'],
  ['src/presentation/maps3d/audio.ts', 'playHoverSound'],
  ['src/presentation/maps3d/audio.ts', 'playPingSound'],
  ['src/presentation/maps3d/audio.ts', 'playSelectSound'],
  ['src/presentation/maps3d/audio.ts', 'playSuccess'],
  ['src/presentation/maps3d/audio.ts', 'playWarning'],
  ['src/presentation/maps3d/eventIcons.tsx', 'getIconForEvent'],
  ['src/presentation/maps3d/exportMap.ts', 'drawHighResTacticalMap'],
  ['src/presentation/maps3d/exportMap.ts', 'exportMapToCanvas'],
  ['src/presentation/maps3d/useGoogleMaps3D.ts', 'useGoogleMaps3D'],
  ['src/presentation/pages/StubPage.tsx', 'StubPage'],
  ['src/presentation/pages/tradingIntel/AccountBookCard.tsx', 'AccountBookMain'],
  ['src/presentation/pages/tradingIntel/AccountBookCard.tsx', 'AccountBookStats'],
  ['src/presentation/pages/tradingIntel/AccountColumns.tsx', 'AccountGrid'],
  ['src/presentation/pages/tradingIntel/AccountScorecard.tsx', 'AccountBookAnalytics'],
  ['src/presentation/pages/tradingIntel/AccountScorecard.tsx', 'AccountBreakerCard'],
  ['src/presentation/pages/tradingIntel/AccountScorecard.tsx', 'AccountRiskCard'],
  ['src/presentation/pages/tradingIntel/PnlCalendar.tsx', 'PnlCalendar'],
  ['src/presentation/pages/tradingIntel/StatusStrip.tsx', 'StatusStrip'],
  ['src/presentation/store/installWhisperVoice.ts', 'isVoiceConversationActive'],
  ['src/presentation/store/voiceStore.ts', 'markLoadedAsPersisted'],
];

const EXPORT_RE =
  /^\s*export\s+(?:default\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)|^\s*export\s+const\s+([A-Za-z0-9_]+)\s*(?::[^=]+)?=\s*(?:async\s*)?\(|^\s*export\s+const\s+([A-Za-z0-9_]+)\s*(?::[^=]+)?=\s*(?:async\s*)?[A-Za-z0-9_]+\s*=>/;

function alleBronbestanden(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.git') continue;
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...alleBronbestanden(full));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

describe('geen nieuwe geëxporteerde functie zonder aanroeper', () => {
  const bestanden = alleBronbestanden(SRC_ROOT);
  const inhoud = new Map<string, string>();
  for (const f of bestanden) inhoud.set(f, readFileSync(f, 'utf8'));

  it('elke gevonden export zonder aanroeper staat op de uitzonderingslijst', () => {
    const uitzonderingSet = new Set(UITZONDERINGEN.map(([f, n]) => `${f}::${n}`));
    const nieuweGevallen: string[] = [];

    for (const f of bestanden) {
      if (f.endsWith('.test.ts') || f.endsWith('.test.tsx')) continue;
      const relPad = path.relative(REPO_ROOT, f).split(path.sep).join('/');
      const tekst = inhoud.get(f) ?? '';
      const regels = tekst.split('\n');
      const gezien = new Set<string>();

      for (const regel of regels) {
        const m = EXPORT_RE.exec(regel);
        if (!m) continue;
        const naam = m[1] ?? m[2] ?? m[3];
        if (!naam || naam.length < 3 || gezien.has(naam)) continue;
        gezien.add(naam);

        const woordgrens = new RegExp(`\\b${naam}\\b`);
        const elders = bestanden.some((ander) => {
          if (ander === f) return false;
          return woordgrens.test(inhoud.get(ander) ?? '');
        });

        if (!elders && !uitzonderingSet.has(`${relPad}::${naam}`)) {
          nieuweGevallen.push(`${naam} (${relPad})`);
        }
      }
    }

    expect(
      nieuweGevallen,
      'Nieuwe export zonder aanroeper gevonden. Sluit hem aan op de plek waar hij ' +
        'nuttig is, of zet hem bewust op de uitzonderingslijst in dit bestand met een reden.',
    ).toEqual([]);
  });

  it('de uitzonderingslijst zelf bevat geen dubbele vermeldingen', () => {
    const sleutels = UITZONDERINGEN.map(([f, n]) => `${f}::${n}`);
    expect(new Set(sleutels).size).toBe(sleutels.length);
  });
});
