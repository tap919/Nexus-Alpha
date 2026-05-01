/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { lazy, Suspense } from 'react';
import { motion } from 'motion/react';
import { RefreshCcw } from 'lucide-react';

import { Header } from '../layout/Header';
import { Sidebar } from '../layout/Sidebar';
import { Footer } from '../layout/Footer';
import { OverviewTab } from '../views/OverviewTab';
import { ComposerTab } from '../views/ComposerTab';
import { LicenseGate } from '../views/LicenseGate';
import { GlobalCommandBar } from './GlobalCommandBar';
import { useNexusApp } from '../hooks/useNexusApp';

// Lazy-loaded views
const CommandCenterTab = lazy(() => import('../views/CommandCenterTab').then(m => ({ default: m.CommandCenterTab })));
const PipelineTab = lazy(() => import('../views/PipelineTab').then(m => ({ default: m.PipelineTab })));
const SettingsTab = lazy(() => import('../views/SettingsTab').then(m => ({ default: m.SettingsTab })));
const ActivityTab = lazy(() => import('../views/ActivityTab').then(m => ({ default: m.ActivityTab })));
const HistoryTab = lazy(() => import('../views/HistoryTab').then(m => ({ default: m.HistoryTab })));
const AuditTab = lazy(() => import('../views/AuditTab').then(m => ({ default: m.AuditTab })));

export default function App() {
  const {
    data,
    loading,
    latency,
    appLicensed,
    activeTab,
    setActiveTab,
    nexusSystemStatus,
    activeRun,
    selectedRepos,
    refetch
  } = useNexusApp();

  if (!appLicensed) return <LicenseGate />;

  return (
    <div className="flex h-screen bg-[#0A0A0B] text-gray-300 font-sans overflow-hidden">
      <GlobalCommandBar />
      
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

      <main className="flex-1 flex flex-col relative overflow-hidden">
        {/* Top Glow Decor */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-indigo-500/10 blur-[120px] rounded-full pointer-events-none" />
        
        <Header 
          status={nexusSystemStatus} 
          latency={latency} 
          activeRun={activeRun}
          selectedRepos={selectedRepos}
        />

        <div className="flex-1 overflow-y-auto relative z-10">
          <div className="max-w-[1600px] mx-auto w-full">
            <Suspense fallback={
              <div className="flex items-center justify-center h-[60vh]">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                >
                  <RefreshCcw className="w-8 h-8 text-indigo-500/50" />
                </motion.div>
              </div>
            }>
              {activeTab === 'Overview' && <OverviewTab />}
              {activeTab === 'Composer' && <ComposerTab />}
              {activeTab === 'Command Center' && <CommandCenterTab />}
              {activeTab === 'Pipeline' && <PipelineTab />}
              {activeTab === 'Activity' && <ActivityTab />}
              {activeTab === 'History' && <HistoryTab />}
              {activeTab === 'Audit' && <AuditTab />}
              {activeTab === 'Settings' && <SettingsTab />}
            </Suspense>
          </div>
        </div>

        <Footer />
      </main>
    </div>
  );
}
