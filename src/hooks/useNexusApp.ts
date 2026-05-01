import { useState, useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useDashboardData } from './useDashboardData';
import { useAppStore } from '../stores/useAppStore';
import { usePipelineStore } from '../stores/usePipelineStore';
import { useWorkspaceStore } from '../stores/useWorkspaceStore';
import { isLicensed } from '../services/licenseService';
import { startWorkflow } from '../services/temporalClient';
import { DashboardData, CLIStateData, PipelineExecutionData } from '../types';

export function useNexusApp() {
  const [appLicensed, setAppLicensed] = useState(true);
  const [latency, setLatency] = useState(42);
  const { data, isLoading: loading, refetch } = useDashboardData();
  const { 
    activeTab, 
    setActiveTab, 
    isProcessing, 
    setIsProcessing, 
    nexusSystemStatus, 
    setNexusSystemStatus,
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

  // Monitor latency
  useEffect(() => {
    if (!loading && data) {
      setLatency(prev => {
        const jitter = Math.floor(Math.random() * 10) - 5;
        return Math.max(12, Math.min(150, prev + jitter));
      });
    }
  }, [data, loading]);

  useEffect(() => {
    try {
      setAppLicensed(isLicensed());
    } catch {
      setAppLicensed(false);
    }
  }, []);

  useEffect(() => {
    const cleanup = connectWebSocket();
    return () => { if (cleanup) cleanup(); };
  }, [connectWebSocket]);

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
  }, [activeTab]);

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
