/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Legacy re-export shim — existing service/store files that import from './types'
 * continue to work unchanged. New code should import from './types/index'.
 */

export type {
  RAGContextData,
  BrowserObservationData,
  BrowserHistoryItemData,
} from './types/browser';

export type { CustomAgentData, CLIStateData } from './types/agents';

export type {
  BuildStepData,
  E2EResultData,
  UnifiedPipelineAnalysis,
  ResourceMetrics,
  PipelineExecutionData,
} from './types/pipeline';

export type {
  PredictionData,
  NewsItem,
  RepoTrend,
  OpenSourceStat,
  TrendingTool,
  VideoItem,
  Signal,
  DashboardData,
} from './types/dashboard';

// ── Legacy aliases used by services/stores ──────────────────────────────────
// Some files still import the original names (BuildStep, PipelineExecution, etc.)
// Export them as aliases so nothing breaks.

export type { BuildStepData as BuildStep } from './types/pipeline';
export type { E2EResultData as E2EResult } from './types/pipeline';
export type { PipelineExecutionData as PipelineExecution } from './types/pipeline';
export type { RAGContextData as RAGContext } from './types/browser';
export type { BrowserObservationData as BrowserObservation } from './types/browser';
export type { BrowserHistoryItemData as BrowserHistoryItem } from './types/browser';
export type { CustomAgentData as CustomAgent } from './types/agents';
export type { CLIStateData as CLIState } from './types/agents';

export type { HookConfig, HookResult } from './types/hooks';
export type {
  PermissionRule,
  PermissionScope,
  CheckpointSnapshot,
  ModelProvider,
  ModelRoutingDecision,
  CodeAnalysisResult,
  CodeSymbol,
  CodeDependency,
  ExecutionPlan,
  PlanStep,
} from './types/pipeline-extensions';
