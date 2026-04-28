/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface PredictionData {
  category: string;
  currentValue: number;
  predictedValue: number;
  growth: number;
  impact: 'High' | 'Medium' | 'Low';
}

export interface NewsItem {
  id: string;
  title: string;
  source: string;
  timestamp: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  summary: string;
  url: string;
}

export interface RepoTrend {
  name: string;
  stars: number;
  forks: number;
  growth: number;
  tags: string[];
  aiAnalysis?: string;
  stack?: string;
  utility?: string;
  buildType?: string;
}

export interface OpenSourceStat {
  label: string;
  value: number;
  change: number;
}

export interface TrendingTool {
  name: string;
  description: string;
  category: string;
  stars?: number;
}

export interface VideoItem {
  id: string;
  title: string;
  thumbnail: string;
  channel: string;
  views: string;
  url: string;
}

export interface BuildStep {
  id: string;
  phase: string;
  status: 'completed' | 'running' | 'pending' | 'failed';
  details: string;
}

export interface E2EResult {
  testName: string;
  status: 'passed' | 'failed';
  duration: number;
  logs: string[];
}

export interface UnifiedPipelineAnalysis {
  stack: string;
  utility: string;
  buildType: string;
  suggestedIntegration: string;
  potentialSynergy: string;
}

export interface ResourceMetrics {
  cpu: number;
  memory: number;
  disk: number;
  network: number;
}

export interface RAGContext {
  indexedDocs: number;
  relevantSnippets: string[];
  lastSync: string;
}

export interface BrowserObservation {
  url: string;
  viewport: { w: number; h: number };
  snapshotDescription: string;
  elementsFound: string[];
}

export interface BrowserHistoryItem {
  id: string;
  timestamp: string;
  url: string;
  action: string;
  summary: string;
  type: 'navigation' | 'click' | 'input' | 'audit' | 'observation';
}

export interface PipelineExecution {
  id: string;
  sourceRepos: string[];
  currentStep: string;
  progress: number;
  status: 'idle' | 'running' | 'success' | 'failed';
  steps: BuildStep[];
  e2eResults: E2EResult[];
  logs: string[];
  analysis?: UnifiedPipelineAnalysis;
  manifest?: string;
  metrics?: ResourceMetrics;
  assignedAgentId?: string;
  rag?: RAGContext;
  browserSnapshot?: BrowserObservation;
  browserHistory?: BrowserHistoryItem[];
}

export interface Signal {
  time: string;
  source: string;
  signal: string;
  value: string;
}

export interface DashboardData {
  growthRate: number;
  activeDevelopers: number;
  totalModels: number;
  sentimentScore: number;
  predictions: PredictionData[];
  news: NewsItem[];
  repos: RepoTrend[];
  growthHistory: { month: string; value: number }[];
  openSourceStats: OpenSourceStat[];
  trendingTools: TrendingTool[];
  videos: VideoItem[];
  buildPipeline: BuildStep[];
  pipelineExecutions?: PipelineExecution[];
  signals: Signal[];
  synergyInsights?: string[];
  harvestSources?: { name: string; url: string; lastUpdate: string }[];
  customAgents: CustomAgent[];
  cliState: CLIState;
  mcpStatus?: {
    activeServers: number;
    connections: number;
    lastPing: string;
    protocol: string;
  };
}

export interface CustomAgent {
  id: string;
  name: string;
  type: 'script' | 'folder' | 'config';
  status: 'active' | 'analyzing' | 'error';
  analysis?: string;
  lastActive: string;
  fileCount?: number;
}

export interface CLIState {
  activeProvider: 'opencode' | 'openrouter' | 'deepseek';
  lastCommand?: string;
  output: string[];
}
