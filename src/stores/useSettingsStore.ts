import { create } from "zustand";
import type { BrainConfig, BrainStatus, IntegrationServiceItem, PipelineConfig, AgentRegistryItem, SettingsState } from "../types/settings";
import { DEFAULT_BRAIN_CONFIG, INTEGRATION_SERVICE_DEFS, DEFAULT_PIPELINE_CONFIG } from "../types/settings";

interface SettingsStore extends SettingsState {
  loading: boolean;
  error: string | null;
  fetchBrainConfig: () => Promise<void>;
  fetchBrainStatus: () => Promise<void>;
  fetchIntegrations: () => Promise<void>;
  fetchPipelineConfig: () => Promise<void>;
  fetchAgents: () => Promise<void>;
  updateBrainConfig: (lanes: BrainConfig["lanes"]) => Promise<boolean>;
  updatePipelineConfig: (cfg: Partial<PipelineConfig>) => Promise<boolean>;
  refreshAll: () => Promise<void>;
}

const API = "/api/settings";

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  brain: DEFAULT_BRAIN_CONFIG,
  brainStatus: { running: false, apiPort: 8000, pythonAvailable: false, brainDir: null, lastRun: null },
  integrations: INTEGRATION_SERVICE_DEFS.map((d) => ({ ...d, connected: false, configured: false })),
  pipeline: DEFAULT_PIPELINE_CONFIG,
  agents: [],
  loading: false,
  error: null,

  fetchBrainConfig: async () => {
    try {
      const res = await fetch(`${API}/brain/config`);
      if (!res.ok) return;
      const data = await res.json();
      set({ brain: { ...get().brain, ...data } });
    } catch (e) {
      set({ error: `Failed to fetch brain config: ${e}` });
    }
  },

  fetchBrainStatus: async () => {
    try {
      const res = await fetch(`${API}/brain/status`);
      if (!res.ok) return;
      const data = await res.json();
      set({ brainStatus: data });
    } catch (e) {
      set({ error: `Failed to fetch brain status: ${e}` });
    }
  },

  fetchIntegrations: async () => {
    try {
      const res = await fetch(`${API}/integrations`);
      if (!res.ok) return;
      const data = await res.json();
      const services = data.services as Record<string, boolean>;
      const updated = get().integrations.map((svc) => ({
        ...svc,
        connected: services[svc.name] ?? false,
        configured: svc.name in services,
      }));
      set({ integrations: updated });
    } catch (e) {
      set({ error: `Failed to fetch integrations: ${e}` });
    }
  },

  updateBrainConfig: async (lanes) => {
    try {
      const res = await fetch(`${API}/brain/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lanes }),
      });
      if (!res.ok) return false;
      await get().fetchBrainConfig();
      return true;
    } catch {
      return false;
    }
  },

  fetchPipelineConfig: async () => {
    try {
      const res = await fetch(`${API}/pipeline`);
      if (!res.ok) return;
      const data = await res.json();
      set({ pipeline: data });
    } catch (e) {
      set({ error: `Failed to fetch pipeline config: ${e}` });
    }
  },

  fetchAgents: async () => {
    try {
      const res = await fetch(`${API}/agents`);
      if (!res.ok) return;
      const data = await res.json();
      set({ agents: data.agents ?? [] });
    } catch (e) {
      set({ error: `Failed to fetch agents: ${e}` });
    }
  },

  updatePipelineConfig: async (cfg) => {
    try {
      const res = await fetch(`${API}/pipeline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cfg),
      });
      if (!res.ok) return false;
      set({ pipeline: { ...get().pipeline, ...cfg } });
      return true;
    } catch {
      return false;
    }
  },

  refreshAll: async () => {
    set({ loading: true, error: null });
    await Promise.all([
      get().fetchBrainConfig(),
      get().fetchBrainStatus(),
      get().fetchIntegrations(),
      get().fetchPipelineConfig(),
      get().fetchAgents(),
    ]);
    set({ loading: false });
  },
}));
