import { create } from "zustand";
import type { PipelineExecution, BuildStep, E2EResult } from "../types";
import { runAutomatedPipeline } from "../services/pipelineService";

interface PipelineStore {
  executions: PipelineExecution[];
  activeExecution: PipelineExecution | null;
  wsConnected: boolean;
  wsUrl: string;
  startPipeline: (repos: string[], agentId?: string) => void;
  stopPipeline: () => void;
  clearHistory: () => void;
  setWsConnected: (v: boolean) => void;
  updateExecution: (exec: PipelineExecution) => void;
}

export const usePipelineStore = create<PipelineStore>((set, get) => ({
  executions: [],
  activeExecution: null,
  wsConnected: false,
  wsUrl: typeof window !== "undefined"
    ? `ws://${window.location.hostname}:3001`
    : "ws://localhost:3001",

  startPipeline: (repos, agentId) => {
    const { activeExecution } = get();
    if (activeExecution?.status === "running") return;

    runAutomatedPipeline(repos, agentId, (exec) => {
      set((s) => ({
        activeExecution: { ...exec },
        executions:
          exec.status === "success" || exec.status === "failed"
            ? [exec, ...s.executions.slice(0, 49)]
            : s.executions,
      }));
    });
  },

  stopPipeline: () =>
    set((s) => ({
      activeExecution: s.activeExecution
        ? { ...s.activeExecution, status: "failed" as const }
        : null,
    })),

  clearHistory: () => set({ executions: [], activeExecution: null }),

  setWsConnected: (v) => set({ wsConnected: v }),

  updateExecution: (exec) =>
    set((s) => ({
      activeExecution: exec,
      executions:
        exec.status === "success" || exec.status === "failed"
          ? [exec, ...s.executions.filter((e) => e.id !== exec.id).slice(0, 49)]
          : s.executions,
    })),
}));
