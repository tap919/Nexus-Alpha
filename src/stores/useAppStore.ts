import { create } from 'zustand';
import type { TabName } from '../layout/Sidebar';

interface AppStore {
  activeTab: TabName;
  isProcessing: boolean;
  browserContext: string | undefined;
  nexusSystemStatus: string;
  selectedRepos: string[];
  
  setActiveTab: (tab: TabName) => void;
  setIsProcessing: (processing: boolean) => void;
  setBrowserContext: (context: string | undefined) => void;
  setNexusSystemStatus: (status: string) => void;
  setSelectedRepos: (repos: string[]) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  activeTab: 'Composer',
  isProcessing: false,
  browserContext: undefined,
  nexusSystemStatus: 'IDLE',
  selectedRepos: [],
  
  setActiveTab: (activeTab) => set({ activeTab }),
  setIsProcessing: (isProcessing) => set({ isProcessing }),
  setBrowserContext: (browserContext) => set({ browserContext }),
  setNexusSystemStatus: (nexusSystemStatus) => set({ nexusSystemStatus }),
  setSelectedRepos: (selectedRepos) => set({ selectedRepos }),
}));
