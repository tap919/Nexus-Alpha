import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useDashboardData } from './useDashboardData';
import { useAppStore } from '../stores/useAppStore';
import { usePipelineStore } from '../stores/usePipelineStore';
import { useWorkspaceStore } from '../stores/useWorkspaceStore';
import { startWorkflow } from '../services/temporalClient';
import { useCodeixStore } from '../services/codeixService';
import { DashboardData } from '../types';
import { useNexusAuth } from './useNexusAuth';
import { useNexusStatus } from './useNexusStatus';

export function useNexusApp() {
  const { data, isLoading: loading, refetch } = useDashboardData();
  const { appLicensed } = useNexusAuth();
  const { latency, nexusSystemStatus, setNexusSystemStatus } = useNexusStatus(loading, !!data);
  
  const { 
    activeTab, 
    setActiveTab, 
    isProcessing, 
    setIsProcessing, 
    selectedRepos
  } = useAppStore();
  
  const dataRef = useRef<DashboardData | null>(null);
  const activeRun = usePipelineStore((s) => s.activeExecution);
  const connectWebSocket = usePipelineStore((s) => s.connectWebSocket);
  const addNotification = useWorkspaceStore((s) => s.addNotification);
  const queryClient = useQueryClient();

  useEffect(() => { dataRef.current = data ?? null; }, [data]);

  const setData = useCallback((updater: (prev: DashboardData | null) => DashboardData | null) => {
    queryClient.setQueryData(['dashboard'], (old: DashboardData | undefined) => {
      const prev = old ?? null;
      return updater(prev);
    });
  }, [queryClient]);

  useEffect(() => {
    const cleanup = connectWebSocket();
    return () => { if (cleanup) cleanup(); };
  }, [connectWebSocket]);

  // Initialize Codeix
  useEffect(() => {
    const initCodeix = async () => {
      const codeix = useCodeixStore.getState();
      const loaded = await codeix.loadFromDisk('.');
      if (!loaded && !codeix.index && !codeix.isIndexing) {
        console.log('[Nexus] Starting initial codebase indexing...');
        await codeix.createIndex('.');
        await codeix.saveIndex('.');
      }
    };
    initCodeix();
  }, []);

  // Autonomous runtime loop
  useEffect(() => {
    if (activeTab !== 'Overview') return;

    const interval = setInterval(async () => {
      const actions = [
        async () => {
          const d = dataRef.current;
          if (!d) return;
          const agent = d.customAgents?.find(a => a.status === 'active');
          if (agent) {
            try {
              await startWorkflow('agentSyncWorkflow', [{
                agentId: agent.id,
                status: 'syncing',
                lesson: 'Periodic sync pulse',
                success: true,
              }]);
              setNexusSystemStatus('AGENT_SYNC');
            } catch { }
          }
        },
        async () => {
          try {
            await startWorkflow('fetchDashboardWorkflow', []);
            setNexusSystemStatus('DATA_FETCH');
          } catch { }
        },
      ];

      const action = actions[Math.floor(Math.random() * actions.length)];
      await action();
      setTimeout(() => setNexusSystemStatus('IDLE'), 4000);
    }, 18000);

    return () => clearInterval(interval);
  }, [activeTab, setNexusSystemStatus]);

  return {
    data,
    loading,
    latency,
    appLicensed,
    activeTab,
    setActiveTab,
    nexusSystemStatus,
    activeRun,
    setData,
    selectedRepos,
    isProcessing,
    setIsProcessing,
    refetch
  };
}
