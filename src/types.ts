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
  status: 'completed' | 'running' | 'pending';
  details: string;
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
}
