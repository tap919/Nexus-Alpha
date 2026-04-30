import { useQuery } from '@tanstack/react-query';
import { analyzeAIData } from '../services/geminiService';
import type { DashboardData } from '../types';

const DEFAULT_FALLBACK: DashboardData = {
  growthRate: 0, activeDevelopers: 0, totalModels: 0, sentimentScore: 0.5,
  predictions: [], growthHistory: [], signals: [], synergyInsights: [],
  repos: [], trendingTools: [], openSourceStats: [], harvestSources: [],
  news: [], videos: [], buildPipeline: [], customAgents: [], cliState: { activeProvider: 'deepseek', output: [] },
  mcpStatus: { activeServers: 0, connections: 0, lastPing: new Date().toISOString(), protocol: 'MCP/1.0' },
  isMock: true,
};

export function useDashboardData() {
  return useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn: async ({ signal }) => {
      const timeout = AbortSignal.timeout(15000);
      const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
      const result = await analyzeAIData(combined);
      return result;
    },
    staleTime: 4 * 60 * 60 * 1000,
    refetchInterval: 4 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
    retryDelay: 1000,
    placeholderData: DEFAULT_FALLBACK,
  });
}
