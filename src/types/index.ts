/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Barrel export — import everything from '@/types' or './types'
 */

export type { RAGContextData, BrowserObservationData, BrowserHistoryItemData } from './browser';
export type { CustomAgentData, CLIStateData } from './agents';
export type {
  BuildStepData,
  E2EResultData,
  UnifiedPipelineAnalysis,
  ResourceMetrics,
  PipelineExecutionData,
} from './pipeline';
export type {
  PredictionData,
  NewsItem,
  RepoTrend,
  OpenSourceStat,
  TrendingTool,
  VideoItem,
  Signal,
  DashboardData,
} from './dashboard';
export type {
  HookConfig,
  HookResult,
  FixAttempt,
  AutoFixContext,
  HookPhase,
  HookAction,
} from './hooks';
export type {
  PermissionRule,
  PermissionContext,
  PermissionScope,
  PermissionAction,
  CheckpointSnapshot,
  CheckpointRestoreResult,
  ModelProvider,
  ModelRoutingDecision,
  CodeSymbol,
  CodeDependency,
  CodeAnalysisResult,
  ExecutionPlan,
  PlanStep,
  PlanApprovalRequest,
} from './pipeline-extensions';
