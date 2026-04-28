/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from "react";
import { 
  Zap, 
  TrendingUp, 
  Users, 
  Box, 
  Globe, 
  Github, 
  ExternalLink, 
  AlertCircle,
  BarChart3,
  Search,
  Activity,
  Cpu,
  RefreshCcw,
  MessageSquare,
  CheckCircle2,
  XCircle,
  RotateCcw,
  PlayCircle,
  Terminal,
  ChevronRight,
  Upload,
  Bot,
  Eye,
  Database,
  ShieldCheck,
  Share2,
  Terminal as TerminalIcon
} from "lucide-react";
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar
} from "recharts";
import { motion, AnimatePresence } from "motion/react";
import { analyzeAIData } from "./services/geminiService";
import { runAutomatedPipeline } from "./services/pipelineService";
import { DashboardData, PredictionData, NewsItem, RepoTrend, OpenSourceStat, TrendingTool, VideoItem, BuildStep, PipelineExecution, E2EResult, CustomAgent, CLIState, UnifiedPipelineAnalysis, BrowserObservation, RAGContext, BrowserHistoryItem } from "./types";
import { cn } from "./lib/utils";
import { useRef } from "react";

// --- Components ---

const MCPBridgeStatus = ({ status }: { status: DashboardData['mcpStatus'] }) => (
  <div className="bg-[#151619] border border-blue-500/20 rounded-xl p-6 relative overflow-hidden group">
    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform">
      <Cpu size={64} className="text-blue-400" />
    </div>
    <div className="flex items-center gap-2 mb-6">
      <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping" />
      <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">MCP Bridge Active</h3>
    </div>
    <div className="grid grid-cols-2 gap-4">
      <div className="space-y-1">
        <div className="text-[10px] text-[#4a4b50] font-mono uppercase">Node Servers</div>
        <div className="text-xl font-bold text-white font-mono">{status?.activeServers || 0}</div>
      </div>
      <div className="space-y-1 text-right">
        <div className="text-[10px] text-[#4a4b50] font-mono uppercase">L3 Connections</div>
        <div className="text-xl font-bold text-white font-mono">{status?.connections || 0}</div>
      </div>
      <div className="space-y-1">
        <div className="text-[10px] text-[#4a4b50] font-mono uppercase">Protocol</div>
        <div className="text-sm font-bold text-blue-400 font-mono">v{status?.protocol || '1.0.0'}</div>
      </div>
      <div className="space-y-1 text-right">
        <div className="text-[10px] text-[#4a4b50] font-mono uppercase">Latency</div>
        <div className="text-sm font-bold text-emerald-400 font-mono">0.14ms</div>
      </div>
    </div>
    <div className="mt-6 pt-4 border-t border-[#2d2e32] flex justify-between items-center text-[9px] font-mono text-[#4a4b50]">
      <span>LAST_PING: {status?.lastPing ? new Date(status.lastPing).toLocaleTimeString() : 'N/A'}</span>
      <span className="text-blue-500 hover:underline cursor-pointer">RESTART_MCP</span>
    </div>
  </div>
);

const AgentForge = ({ agents, onUpload }: { agents: CustomAgent[], onUpload: () => void }) => (
  <div className="bg-[#151619] border border-[#2d2e32] rounded-xl p-6">
    <div className="flex justify-between items-center mb-6">
      <SectionHeader title="Agent Forge" icon={Cpu} />
      <button 
        onClick={onUpload}
        className="text-[10px] bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-400 font-mono flex items-center gap-2"
      >
        <Upload size={12} /> UPLOAD_AGENT_FOLDER
      </button>
    </div>
    
    <div className="space-y-4">
      {agents.map(agent => (
        <motion.div 
          key={agent.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 bg-[#0a0a0c] border border-[#1a1b1e] rounded-lg group hover:border-blue-500/30 transition-all"
        >
          <div className="flex justify-between items-start mb-2">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 rounded text-blue-400">
                <Bot size={16} />
              </div>
              <div>
                <h4 className="text-sm text-white font-medium">{agent.name}</h4>
                <p className="text-[10px] font-mono text-[#4a4b50] uppercase tracking-wider">{agent.type} • {agent.status}</p>
              </div>
            </div>
            <span className="text-[9px] font-mono text-[#4a4b50]">{new Date(agent.lastActive).toLocaleTimeString()}</span>
          </div>
          {agent.analysis && (
            <p className="text-[11px] text-[#8E9299] font-mono mt-3 leading-relaxed border-l-2 border-blue-500/20 pl-3">
              {agent.analysis}
            </p>
          )}
        </motion.div>
      ))}
      {agents.length === 0 && (
        <div className="text-center py-8 border-2 border-dashed border-[#1a1b1e] rounded-xl">
          <Upload className="mx-auto text-[#2d2e32] mb-2" size={24} />
          <p className="text-xs text-[#4a4b50] font-mono uppercase tracking-widest">Awaiting local agent protocols...</p>
        </div>
      )}
    </div>
  </div>
);

const CLITerminal = ({ state, onCommand, onProviderChange }: { 
  state: CLIState, 
  onCommand: (cmd: string) => void,
  onProviderChange: (provider: 'opencode' | 'openrouter' | 'deepseek') => void
}) => {
  const [input, setInput] = useState('');
  const [pendingProvider, setPendingProvider] = useState<'opencode' | 'openrouter' | 'deepseek' | null>(null);
  const terminalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [state.output]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    onCommand(input);
    setInput('');
  };

  const confirmSwitch = () => {
    if (pendingProvider) {
      onProviderChange(pendingProvider);
      setPendingProvider(null);
    }
  };

  return (
    <div className="bg-[#0a0a0c] border border-[#2d2e32] rounded-xl flex flex-col h-[450px] overflow-hidden shadow-2xl relative">
      {/* Confirmation Overlay */}
      <AnimatePresence>
        {pendingProvider && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 bg-[#0a0a0c]/90 backdrop-blur-sm flex items-center justify-center p-6 text-center"
          >
            <div className="max-w-xs space-y-6">
              <div className="w-12 h-12 bg-blue-500/10 rounded-full flex items-center justify-center text-blue-400 mx-auto animate-pulse">
                <AlertCircle size={24} />
              </div>
              <div className="space-y-2">
                <h4 className="text-sm font-bold text-white uppercase tracking-widest">Confirm Protocol Shift</h4>
                <p className="text-[10px] font-mono text-[#4a4b50] leading-relaxed">
                  You are about to switch from <span className="text-white">{state.activeProvider.toUpperCase()}</span> to <span className="text-blue-400">{pendingProvider.toUpperCase()}</span>.
                  Current terminal context will be recalibrated.
                </p>
              </div>
              <div className="flex gap-3">
                <button 
                  onClick={() => setPendingProvider(null)}
                  className="flex-1 py-2 bg-[#1a1b1e] hover:bg-[#2d2e32] border border-[#2d2e32] rounded text-[9px] font-mono text-[#4a4b50] uppercase tracking-widest transition-all"
                >
                  [ABORT]
                </button>
                <button 
                  onClick={confirmSwitch}
                  className="flex-1 py-2 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/40 rounded text-[9px] font-mono text-blue-400 uppercase tracking-widest transition-all shadow-[0_0_15px_rgba(59,130,246,0.2)]"
                >
                  [CONFIRM_SHIFT]
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="bg-[#151619] px-4 py-2 border-b border-[#2d2e32] flex justify-between items-center">
        <div className="flex items-center gap-2">
          <TerminalIcon size={14} className="text-[#4a4b50]" />
          <span className="text-[10px] font-mono text-[#4a4b50] uppercase tracking-widest">Nexus-Terminal_v1.2.0</span>
        </div>
        <div className="flex gap-2">
          {(['opencode', 'openrouter', 'deepseek'] as const).map(p => (
            <button 
              key={p} 
              onClick={() => {
                if (state.activeProvider !== p) {
                  setPendingProvider(p);
                }
              }}
              className={cn(
                "text-[9px] font-mono px-2 py-0.5 rounded border transition-all",
                state.activeProvider === p 
                  ? "bg-blue-500/20 border-blue-500/40 text-blue-400 ring-1 ring-blue-500/20" 
                  : "bg-[#0a0a0c] border-[#1a1b1e] text-[#4a4b50] hover:border-[#2d2e32] hover:text-[#8E9299]"
              )}
            >
              {p.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      
      <div 
        ref={terminalRef}
        className="flex-1 p-4 font-mono text-[11px] overflow-y-auto space-y-1 custom-scrollbar"
      >
        {state.output.map((line, i) => (
          <div key={i} className={cn(
            line.startsWith('>') ? "text-blue-400" : 
            line.includes('[ERROR]') ? "text-rose-400" : 
            line.includes('[SYSTEM]') ? "text-emerald-400" : "text-[#8E9299]"
          )}>
            {line}
          </div>
        ))}
        <div className="text-white animate-pulse">_</div>
      </div>

      <form onSubmit={handleSubmit} className="p-4 bg-[#151619] border-t border-[#2d2e32] flex gap-3">
        <span className="text-blue-400 font-mono mt-1">$</span>
        <input 
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Execute protocol (e.g. opencode push --agent-v1)..."
          className="flex-1 bg-transparent border-none outline-none text-white font-mono text-xs placeholder:text-[#2d2e32]"
        />
      </form>
    </div>
  );
};

const NexusBrowser = ({ initialMessage, activeRun }: { initialMessage?: string; activeRun?: PipelineExecution | null }) => {
  const [url, setUrl] = useState("https://nexus.alpha/agent/terminal");
  const [localHistory, setLocalHistory] = useState<BrowserHistoryItem[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Initialize local set
  useEffect(() => {
    if (localHistory.length === 0) {
      setLocalHistory([
        {
          id: 'init-1',
          timestamp: new Date().toISOString(),
          url: "https://nexus.alpha/init",
          action: "Initialize",
          summary: "Nexus Agent Browser initialized in isolated sandbox environment.",
          type: 'observation'
        }
      ]);
    }
  }, []);

  useEffect(() => {
    if (initialMessage) {
      setLocalHistory(prev => {
        const newItem: BrowserHistoryItem = {
          id: Math.random().toString(36).substr(2, 5),
          timestamp: new Date().toISOString(),
          url: "https://nexus.alpha/import",
          action: "Context Import",
          summary: initialMessage,
          type: 'audit'
        };
        const next = [...prev, newItem];
        return next.length > 100 ? next.slice(-100) : next;
      });
    }
  }, [initialMessage]);

  const allHistory = [...localHistory, ...(activeRun?.browserHistory || [])].sort((a, b) => 
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const clearHistory = () => {
    setLocalHistory([]);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTo({
          top: scrollRef.current.scrollHeight,
          behavior: 'smooth'
        });
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [allHistory.length]);

  return (
    <div className="flex flex-col h-full bg-[#0a0a0c] border border-[#2d2e32] rounded-xl overflow-hidden shadow-2xl">
      {/* Browser Chrome */}
      <div className="h-10 bg-[#151619] border-b border-[#2d2e32] flex items-center px-4 gap-4">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-rose-500/30" />
          <div className="w-2.5 h-2.5 rounded-full bg-amber-500/30" />
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/30" />
        </div>
        <div className="flex-1 bg-[#0a0a0c] rounded px-3 py-1 text-[10px] font-mono text-[#4a4b50] border border-[#2d2e32] flex justify-between items-center">
          <div className="truncate max-w-[400px]">
             {activeRun?.browserSnapshot ? activeRun.browserSnapshot.url : url}
          </div>
          <RefreshCcw size={10} className="text-[#2d2e32]" />
        </div>
        {activeRun?.browserSnapshot && (
          <div className="flex items-center gap-2 px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded text-[9px] font-mono text-emerald-400">
            <Activity size={10} className="animate-pulse" />
            SYNCHRONOUS_AGENT_ATTACHED
          </div>
        )}
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Main Observation Area */}
        <div ref={scrollRef} className="flex-1 p-6 overflow-y-auto custom-scrollbar font-mono text-xs space-y-6">
          {activeRun?.browserSnapshot && (
            <div className="mb-10">
              <BrowserControl snapshot={activeRun.browserSnapshot} />
            </div>
          )}

          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-[#1a1b1e] pb-2">
               <h5 className="text-[10px] uppercase tracking-[0.2em] text-[#4a4b50]">Chronological Trace</h5>
               <button 
                onClick={clearHistory}
                className="text-[9px] text-[#4a4b50] hover:text-white uppercase transition-colors"
               >
                 [WIPE_BUFFER]
               </button>
            </div>
            
            {allHistory.length === 0 && (
              <div className="py-20 text-center space-y-2 opacity-30">
                <Search size={32} className="mx-auto text-[#4a4b50]" />
                <p className="text-[10px] uppercase tracking-widest text-[#4a4b50]">Log Buffer Empty</p>
              </div>
            )}

            {allHistory.map((item, i) => (
              <motion.div 
                key={item.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className={cn(
                  "p-3 rounded border border-transparent hover:bg-[#151619] transition-colors group",
                  item.type === 'navigation' ? "border-l-2 border-l-blue-500" :
                  item.type === 'click' ? "border-l-2 border-l-amber-500" :
                  item.type === 'input' ? "border-l-2 border-l-emerald-500" :
                  item.type === 'audit' ? "border-l-2 border-l-purple-500" : "border-l-2 border-l-[#2d2e32]"
                )}
              >
                <div className="flex justify-between items-start mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-[#4a4b50]">
                      {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                    <span className={cn(
                      "text-[9px] uppercase px-1.5 py-0.5 rounded-sm font-bold",
                      item.url.startsWith('mcp://') ? "bg-purple-500/10 text-purple-400 border border-purple-500/20" :
                      item.type === 'navigation' ? "bg-blue-500/10 text-blue-400" :
                      item.type === 'click' ? "bg-amber-500/10 text-amber-400" :
                      item.type === 'input' ? "bg-emerald-500/10 text-emerald-400" :
                      item.type === 'audit' ? "bg-purple-500/10 text-purple-400" : "bg-[#2d2e32] text-[#4a4b50]"
                    )}>
                      {item.url.startsWith('mcp://') ? "MCP_FETCH" : item.type}
                    </span>
                    {item.type === 'observation' && activeRun?.rag && (
                      <motion.span 
                        animate={{ opacity: [1, 0.4, 1] }}
                        className="text-[8px] font-mono text-emerald-500 bg-emerald-500/5 px-1 rounded border border-emerald-500/20"
                      >
                        [RAG_INDEXED]
                      </motion.span>
                    )}
                  </div>
                  <span className="text-[9px] text-[#2d2e32] group-hover:text-[#4a4b50] truncate max-w-[200px]">
                    {item.url}
                  </span>
                </div>
                <p className="text-[11px] text-[#8E9299] leading-relaxed">
                  <span className="text-white font-bold">{item.action}:</span> {item.summary}
                </p>
              </motion.div>
            ))}

            <div className="flex gap-2 text-[#4a4b50] pt-4 items-center">
              <span className="text-emerald-500 animate-pulse">●</span>
              <span className="text-[10px] uppercase tracking-widest">Listening for agent events...</span>
              <motion.span 
                animate={{ opacity: [1, 0, 1] }} 
                transition={{ repeat: Infinity, duration: 1 }}
                className="w-1.5 h-3 bg-[#4a4b50] inline-block"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Browser Footer / Status */}
      <div className="p-4 border-t border-[#2d2e32] bg-[#151619]/50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-2 h-2 rounded-full",
            activeRun?.status === 'running' ? "bg-amber-500 animate-ping" : "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"
          )} />
          <div className="flex flex-col">
             <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#8E9299]">
               Agent Status: {activeRun?.status === 'running' ? 'AUTONOMOUS_CONTROL' : 'READY_FOR_PROTOCOL'}
             </span>
             {activeRun?.currentStep && (
               <span className="text-[8px] font-mono text-[#4a4b50] uppercase mt-0.5">
                 Observing Step: {activeRun.currentStep}
               </span>
             )}
          </div>
        </div>
        <div className="flex gap-4">
           <button className="text-[10px] font-mono uppercase text-blue-400 hover:underline">VNC Bridge</button>
           <button className="text-[10px] font-mono uppercase text-emerald-400 hover:underline">Deploy to Cluster</button>
        </div>
      </div>
    </div>
  );
};

const MultiAgentSynthesisLoop = ({ execution }: { execution: PipelineExecution | null }) => {
  if (!execution || execution.status !== 'running') return null;

  return (
    <motion.div 
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="bg-blue-500/5 border border-blue-500/10 rounded-xl p-4 mb-8 overflow-hidden"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-blue-500 animate-ping" />
          <h4 className="text-[10px] font-bold text-blue-400 uppercase tracking-[0.2em] font-mono">Synthesis Engine Active</h4>
        </div>
        <div className="text-[9px] font-mono text-[#4a4b50] uppercase tracking-widest">
          Neuro-Sync: {Math.floor(execution.progress)}%
        </div>
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Agent Collab', icon: Users, status: execution.progress > 20 ? 'COMPLETE' : 'ORCHESTRATING' },
          { label: 'Context Sharding', icon: Share2, status: execution.progress > 40 ? 'STABILIZED' : 'FRAGMENTING' },
          { label: 'Neural Pruning', icon: Cpu, status: execution.progress > 60 ? 'OPTIMIZED' : 'PROCESSING' },
          { label: 'MCP Handshake', icon: Terminal, status: execution.progress > 80 ? 'ESTABLISHED' : 'NEGOTIATING' }
        ].map((item, i) => (
          <div key={i} className="bg-[#0a0a0c]/50 p-3 rounded border border-[#2d2e32] flex flex-col gap-2">
            <div className={cn(
              "w-6 h-6 rounded flex items-center justify-center border",
              item.status === 'COMPLETE' || item.status === 'STABILIZED' || item.status === 'OPTIMIZED' || item.status === 'ESTABLISHED'
                ? "bg-blue-500/10 border-blue-500/20 text-blue-400"
                : "bg-amber-500/5 border-amber-500/10 text-amber-500 animate-pulse"
            )}>
              <item.icon size={12} />
            </div>
            <div className="space-y-1">
              <div className="text-[9px] font-mono text-[#8E9299] uppercase">{item.label}</div>
              <div className={cn(
                "text-[8px] font-mono uppercase tracking-tighter",
                item.status === 'COMPLETE' || item.status === 'STABILIZED' || item.status === 'OPTIMIZED' || item.status === 'ESTABLISHED'
                  ? "text-blue-400" : "text-amber-500"
              )}>
                {item.status}
              </div>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
};

const PipelineVisualizer = ({ steps }: { steps: BuildStep[] }) => (
  <div className="space-y-6">
    {steps.map((step, i) => (
      <motion.div 
        key={i}
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: i * 0.1 }}
        className="relative pl-8 border-l border-[#2d2e32] pb-8 last:pb-0"
      >
        <div className={cn(
          "absolute left-[-5px] top-0 w-2.5 h-2.5 rounded-full",
          step.status === 'completed' ? "bg-emerald-500" :
          step.status === 'running' ? "bg-amber-500 animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.5)]" : "bg-[#2d2e32]"
        )} />
        <div className="bg-[#151619] border border-[#2d2e32] p-4 rounded-xl group hover:border-[#424348] transition-colors">
          <div className="flex justify-between items-start mb-2">
            <h4 className="text-sm font-medium text-white">{step.phase}</h4>
            <span className={cn(
              "text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded",
              step.status === 'completed' ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
              step.status === 'running' ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" : "bg-[#2d2e32] text-[#4a4b50]"
            )}>
              {step.status}
            </span>
          </div>
          <p className="text-xs text-[#8E9299]">{step.details}</p>
        </div>
      </motion.div>
    ))}
  </div>
);

const YouTubePulse = ({ videos }: { videos: VideoItem[] }) => {
  const [playingId, setPlayingId] = useState<number | null>(null);

  const getEmbedUrl = (url: string) => {
    try {
      const urlObj = new URL(url);
      let id = '';
      if (urlObj.hostname === 'youtu.be') {
        id = urlObj.pathname.slice(1);
      } else {
        id = urlObj.searchParams.get('v') || urlObj.pathname.split('/').pop() || '';
      }
      return `https://www.youtube.com/embed/${id}?autoplay=1`;
    } catch (e) {
      return url;
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {videos.map((video, i) => (
        <motion.div 
          key={i}
          whileHover={{ y: -4 }}
          className="bg-[#151619] border border-[#2d2e32] rounded-xl overflow-hidden group"
        >
          <div className="aspect-video bg-[#0a0a0c] relative">
            {playingId === i ? (
              <iframe 
                src={getEmbedUrl(video.url)}
                title={video.title}
                className="w-full h-full border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <>
                <img src={video.thumbnail} alt={video.title} className="w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity" />
                <button 
                  onClick={() => setPlayingId(i)}
                  className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 cursor-pointer"
                >
                  <div className="w-12 h-12 rounded-full border border-white/20 flex items-center justify-center bg-black/60 shadow-xl">
                    <Zap size={24} fill="white" />
                  </div>
                </button>
                <div className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/80 rounded text-[9px] font-mono uppercase text-white">4K SCAN</div>
              </>
            )}
          </div>
          <div className="p-4">
            <h4 className="text-sm font-medium text-white mb-2 line-clamp-1">{video.title}</h4>
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-mono text-[#4a4b50] uppercase">{video.channel}</span>
              <span className="text-[10px] font-mono text-emerald-400">{video.views} Views</span>
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
};

const E2EResultsPanel = ({ results }: { results: E2EResult[] }) => (
  <div className="space-y-3 mt-4">
    <h5 className="text-[10px] font-mono uppercase text-[#4a4b50] tracking-widest border-b border-[#2d2e32] pb-1">Automated Test Suite</h5>
    {results.map((res, i) => (
      <div key={i} className="flex flex-col gap-1 p-2 bg-[#0a0a0c] rounded border border-[#1a1b1e]">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            {res.status === 'passed' ? <CheckCircle2 size={12} className="text-emerald-500" /> : <XCircle size={12} className="text-rose-500" />}
            <span className="text-[11px] font-medium text-[#8E9299]">{res.testName}</span>
          </div>
          <span className="text-[9px] font-mono text-[#4a4b50]">{res.duration}ms</span>
        </div>
        {res.logs.length > 0 && (
          <div className="text-[9px] font-mono text-[#4a4b50] pl-5">
            {res.logs.join(' • ')}
          </div>
        )}
      </div>
    ))}
  </div>
);

const BrowserControl = ({ snapshot }: { snapshot: BrowserObservation }) => (
  <motion.div 
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className="bg-[#0a0a0c] border border-[#2d2e32] rounded-xl overflow-hidden mt-8 shadow-2xl"
  >
    <div className="bg-[#151619] border-b border-[#2d2e32] px-4 py-2 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="flex gap-1.5">
          <div className="w-2 h-2 rounded-full bg-rose-500/50" />
          <div className="w-2 h-2 rounded-full bg-amber-500/50" />
          <div className="w-2 h-2 rounded-full bg-emerald-500/50" />
        </div>
        <div className="bg-[#0a0a0c] border border-[#2d2e32] px-3 py-1 rounded-md text-[9px] font-mono text-[#4a4b50] flex items-center gap-2">
          <Globe size={10} />
          {snapshot.url}
        </div>
      </div>
      <div className="text-[9px] font-mono text-[#4a4b50]">
        VIEWPORT: {snapshot.viewport.w}x{snapshot.viewport.h} (AUTO_SCALED)
      </div>
    </div>
    
    <div className="p-6 bg-[#0a0a0c] min-h-[140px] flex flex-col justify-center items-center relative overflow-hidden">
       {/* Simulated Browser Grid */}
       <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#4a4b50 0.5px, transparent 0.5px)', backgroundSize: '10px 10px' }} />
       
       <div className="relative z-10 text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-[10px] font-mono text-emerald-400 animate-pulse">
             <Eye size={12} />
             AGENT_OBSERVATION: ACTIVE_SURVEILLANCE
          </div>
          <p className="text-xs text-[#8E9299] font-mono max-w-md mx-auto leading-relaxed">
             {snapshot.snapshotDescription}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
             {snapshot.elementsFound.map((el, i) => (
                <span key={i} className="text-[8px] font-mono bg-blue-500/10 border border-blue-500/20 px-1.5 py-0.5 rounded text-blue-400">
                  {el}
                </span>
             ))}
          </div>
       </div>
    </div>
  </motion.div>
);

const RAGIntelligenceDisplay = ({ rag }: { rag: RAGContext }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
     <div className="bg-[#0a0a0c] border border-blue-500/20 p-5 rounded-xl relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-3 opacity-20 group-hover:opacity-100 transition-opacity">
           <Database className="text-blue-500" size={20} />
        </div>
        <div className="text-[10px] font-mono text-blue-400 uppercase tracking-widest mb-3">Knowledge Index Hub</div>
        <div className="flex items-end gap-3 mb-4">
           <div className="text-3xl font-bold text-white leading-none">{rag.indexedDocs.toLocaleString()}</div>
           <div className="text-[10px] font-mono text-[#4a4b50] pb-1 uppercase">Synced Documents</div>
        </div>
        <div className="text-[9px] font-mono text-[#4a4b50] uppercase">Last Vector Sync: {rag.lastSync}</div>
     </div>
     
     <div className="bg-[#0a0a0c] border border-blue-500/20 p-5 rounded-xl">
        <div className="text-[10px] font-mono text-blue-400 uppercase tracking-widest mb-3">Context Retrieval</div>
        <div className="space-y-2">
           {rag.relevantSnippets.map((snippet, i) => (
              <div key={i} className="flex gap-3 items-start group">
                 <div className="w-1 h-1 rounded-full bg-blue-500/40 mt-1.5 shrink-0" />
                 <p className="text-[10px] font-mono text-[#8E9299] leading-relaxed group-hover:text-blue-200 transition-colors">
                    {snippet}
                 </p>
              </div>
           ))}
        </div>
     </div>
  </div>
);

const AuditCertificate = () => (
  <motion.div 
    initial={{ opacity: 0, scale: 0.95 }}
    animate={{ opacity: 1, scale: 1 }}
    className="bg-[#0a0a0c] border border-blue-500/30 p-6 rounded-xl mt-6 relative overflow-hidden group shadow-2xl"
  >
    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-100 transition-opacity">
       <ShieldCheck size={40} className="text-blue-500" />
    </div>
    <div className="flex items-center gap-4 mb-4">
       <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-400 border border-blue-500/20">
          <ShieldCheck size={24} />
       </div>
       <div>
          <h4 className="text-sm font-bold text-white uppercase tracking-widest">Audit Certificate: NEXUS-AUDIT-G7</h4>
          <p className="text-[10px] font-mono text-[#4a4b50]">VERIFIED STATUS: COMPLIANT_LEVEL_3</p>
       </div>
    </div>
    <div className="grid grid-cols-2 gap-4 border-t border-[#1a1b1e] pt-4">
       <div className="space-y-1">
          <div className="text-[9px] font-mono text-[#4a4b50] uppercase">Integrity Hash</div>
          <div className="text-[10px] font-mono text-blue-400 truncate">sha256:0x2f3e...b9a2</div>
       </div>
       <div className="space-y-1">
          <div className="text-[9px] font-mono text-[#4a4b50] uppercase">Vulnerability Count</div>
          <div className="text-[10px] font-mono text-emerald-400">0 CRITICAL / 0 HIGH</div>
       </div>
    </div>
    <div className="mt-4 flex items-center gap-2 text-[9px] font-mono text-[#4a4b50]">
       <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
       DIGITALLY SIGNED VIA NEXUS IMMUTABLE LEDGER
    </div>
  </motion.div>
);

const ActivePipelineRun = ({ execution, onReset, onLaunch, activeAgent }: { 
  execution: PipelineExecution, 
  onReset: () => void, 
  onLaunch: () => void,
  activeAgent?: CustomAgent
}) => {
  const logRef = React.useRef<HTMLDivElement>(null);
  const [showManifest, setShowManifest] = useState(false);
  const [aiInsight, setAiInsight] = useState<{ log: string; insight: string } | null>(null);

  const explainLogWithAI = async (logLine: string) => {
    setAiInsight({ log: logLine, insight: "AI Neuro-Scanner analyzing log trace..." });
    await new Promise(r => setTimeout(r, 1500));
    
    let insight = "This log indicates standard lifecycle activity within the Nexus virtual machine.";
    if (logLine.includes('FATAL')) insight = "Critical failure detected. This is usually caused by a dependency mismatch or a timeout in the E2E cluster. Recommended action: Check for conflicting peer dependencies in synthesized stacks.";
    if (logLine.includes('vulnerability')) insight = "Security scanner identified a risk in a transient dependency. The SLSA protocol is attempting to auto-patch via remote registry headers.";
    if (logLine.includes('metrics')) insight = "System throughput is fluctuating. This cluster is currently undergoing automated vertical scaling to handle the synthesized build load.";
    
    setAiInsight({ log: logLine, insight });
  };

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [execution.logs]);

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-[#151619] border-2 border-emerald-500/20 p-6 rounded-2xl shadow-2xl shadow-emerald-500/5 mb-12"
    >
      <div className="flex justify-between items-center mb-8">
        <div className="flex items-center gap-4">
          <div className={cn(
            "w-12 h-12 rounded-xl flex items-center justify-center",
            execution.status === 'running' ? "bg-emerald-500/10 text-emerald-400 animate-pulse" :
            execution.status === 'success' ? "bg-emerald-500 text-black" : "bg-rose-500 text-white"
          )}>
            {execution.status === 'running' ? <RotateCcw className="animate-spin" /> : 
             execution.status === 'success' ? <CheckCircle2 /> : <AlertCircle />}
          </div>
          <div>
            <h3 className="text-lg font-medium text-white flex items-center gap-3">
              {execution.sourceRepos.length > 1 ? "Synthesized Unified Build" : execution.sourceRepos[0]}
              <div className="flex gap-1 h-3 items-end">
                {[...Array(5)].map((_, i) => (
                  <motion.div 
                    key={i}
                    animate={{ height: [4, 12, 4] }}
                    transition={{ duration: 1, repeat: Infinity, delay: i * 0.1 }}
                    className="w-1 bg-emerald-500/40 rounded-full"
                  />
                ))}
              </div>
            </h3>
            <p className="text-xs font-mono text-[#4a4b50] uppercase tracking-widest mt-1">
              Sources: {execution.sourceRepos.join(', ')}
            </p>
          </div>
        </div>

        {activeAgent && (
          <div className="flex items-center gap-4 px-4 py-2 bg-blue-500/10 border border-blue-500/20 rounded-xl">
            <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400">
              <Cpu size={16} />
            </div>
            <div>
              <div className="text-[10px] font-mono text-blue-400 uppercase tracking-widest leading-none mb-1">Assigned Agent</div>
              <div className="text-xs font-medium text-blue-100">{activeAgent.name}</div>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          {execution.status === 'success' && (
            <button 
              onClick={onLaunch}
              className="text-[10px] font-mono text-black bg-emerald-500 hover:bg-emerald-400 uppercase tracking-widest px-4 py-1.5 rounded font-bold transition-all shadow-[0_0_15px_rgba(16,185,129,0.3)]"
            >
              Utilize Build
            </button>
          )}
          <button 
            onClick={onReset}
            className="text-[10px] font-mono text-[#4a4b50] hover:text-white uppercase tracking-widest border border-[#2d2e32] px-3 py-1 rounded"
          >
            Clear Session
          </button>
        </div>
      </div>

      <AnimatePresence>
        <MultiAgentSynthesisLoop execution={execution} />
      </AnimatePresence>

      {execution.analysis && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-[#0a0a0c] border border-emerald-500/10 p-4 rounded-xl">
             <div className="text-[9px] font-mono text-[#4a4b50] uppercase mb-1">Synthesized Stack</div>
             <div className="text-xs text-emerald-400 font-mono truncate">{execution.analysis.stack}</div>
          </div>
          <div className="bg-[#0a0a0c] border border-emerald-500/10 p-4 rounded-xl">
             <div className="text-[9px] font-mono text-[#4a4b50] uppercase mb-1">Functional Utility</div>
             <div className="text-xs text-emerald-400 font-mono truncate">{execution.analysis.utility}</div>
          </div>
          <div className="bg-[#0a0a0c] border border-emerald-500/10 p-4 rounded-xl">
             <div className="text-[9px] font-mono text-[#4a4b50] uppercase mb-1">Build Target</div>
             <div className="text-xs text-emerald-400 font-mono truncate">{execution.analysis.buildType}</div>
          </div>
          <div className="bg-[#0a0a0c] border border-emerald-500/10 p-4 rounded-xl">
             <div className="text-[9px] font-mono text-[#4a4b50] uppercase mb-1">Nexus Protocol</div>
             <div className="text-xs text-blue-400 font-mono truncate">L3-SYTH-2.5</div>
          </div>
        </div>
      )}

      {/* IDE Hardware Monitor */}
      {execution.metrics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8 bg-[#0a0a0c] p-4 rounded-xl border border-[#2d2e32]">
           <div className="space-y-1">
              <div className="flex justify-between text-[8px] font-mono text-[#4a4b50] uppercase">
                 <span>System CPU</span>
                 <span className={execution.metrics.cpu > 80 ? "text-red-400" : "text-emerald-400"}>{Math.round(execution.metrics.cpu)}%</span>
              </div>
              <div className="h-1 bg-[#151619] rounded-full overflow-hidden">
                <motion.div animate={{ width: `${execution.metrics.cpu}%` }} className="h-full bg-emerald-500/50" />
              </div>
           </div>
           <div className="space-y-1">
              <div className="flex justify-between text-[8px] font-mono text-[#4a4b50] uppercase">
                 <span>Cluster Mem</span>
                 <span className="text-blue-400">{Math.round(execution.metrics.memory)}%</span>
              </div>
              <div className="h-1 bg-[#151619] rounded-full overflow-hidden">
                <motion.div animate={{ width: `${execution.metrics.memory}%` }} className="h-full bg-blue-500/50" />
              </div>
           </div>
           <div className="space-y-1">
              <div className="flex justify-between text-[8px] font-mono text-[#4a4b50] uppercase">
                 <span>I/O Throughput</span>
                 <span className="text-amber-400">{Math.round(execution.metrics.network)} MB/s</span>
              </div>
              <div className="h-1 bg-[#151619] rounded-full overflow-hidden">
                <motion.div animate={{ width: `${(execution.metrics.network / 1000) * 100}%` }} className="h-full bg-amber-500/50" />
              </div>
           </div>
           <div className="space-y-1">
              <div className="flex justify-between text-[8px] font-mono text-[#4a4b50] uppercase">
                 <span>Artifact Disk</span>
                 <span className="text-[#8E9299]">{Math.round(execution.metrics.disk)}%</span>
              </div>
              <div className="h-1 bg-[#151619] rounded-full overflow-hidden">
                <motion.div animate={{ width: `${execution.metrics.disk}%` }} className="h-full bg-[#4a4b50]" />
              </div>
           </div>
        </div>
      )}

      {/* Manifest Explorer (IDE Feature) */}
      <div className="mb-8">
        <button 
          onClick={() => setShowManifest(!showManifest)}
          className="flex items-center gap-2 text-[10px] font-mono text-emerald-400/70 hover:text-emerald-400 uppercase tracking-widest mb-2 transition-colors"
        >
          {showManifest ? "[HIDE_BUILD_MANIFEST]" : "[INSPECT_SYNTHETIC_CONFIG]"}
        </button>
        <AnimatePresence>
          {showManifest && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden bg-[#0a0a0c] border border-[#2d2e32] rounded-xl"
            >
              <pre className="p-4 text-[11px] font-mono text-emerald-500/80 leading-relaxed overflow-x-auto">
                <code>{execution.manifest}</code>
              </pre>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {execution.analysis && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <div className="bg-[#151619] border border-[#2d2e32] p-4 rounded-xl">
             <div className="flex items-center gap-2 mb-2">
               <RefreshCcw size={12} className="text-blue-400" />
               <div className="text-[10px] font-mono text-[#4a4b50] uppercase">Suggested Integration</div>
             </div>
             <p className="text-[11px] text-[#8E9299] font-mono">{execution.analysis.suggestedIntegration}</p>
          </div>
          <div className="bg-[#151619] border border-[#2d2e32] p-4 rounded-xl">
             <div className="flex items-center gap-2 mb-2">
               <Zap size={12} className="text-emerald-400" />
               <div className="text-[10px] font-mono text-[#4a4b50] uppercase">Potential Synergy</div>
             </div>
             <p className="text-[11px] text-[#8E9299] font-mono">{execution.analysis.potentialSynergy}</p>
          </div>
        </div>
      )}

      {/* RAG Context & Browser Control Overlays */}
      {execution.rag && <RAGIntelligenceDisplay rag={execution.rag} />}
      {execution.browserSnapshot && <BrowserControl snapshot={execution.browserSnapshot} />}

      <div className="space-y-6 mt-8">
        <div className="relative h-2 bg-[#0a0a0c] rounded-full overflow-hidden border border-[#1a1b1e]">
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: `${execution.progress}%` }}
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-600 to-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.3)]"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="space-y-4">
            <h5 className="text-[10px] font-mono uppercase text-[#4a4b50] tracking-widest">Execution Steps</h5>
            <div className="space-y-2">
              {execution.steps.map((step, i) => (
                <div key={i} className={cn(
                  "flex items-center justify-between p-3 rounded-lg border transition-all",
                  step.status === 'running' ? "bg-emerald-500/5 border-emerald-500/20" :
                  step.status === 'completed' ? "bg-[#1a1b1e] border-[#2d2e32]" : 
                  step.status === 'failed' ? "bg-rose-500/5 border-rose-500/20" : "bg-[#0a0a0c] border-[#1a1b1e] opacity-40"
                )}>
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-1.5 h-1.5 rounded-full",
                      step.status === 'completed' ? "bg-emerald-500" :
                      step.status === 'running' ? "bg-emerald-400 animate-ping" : 
                      step.status === 'failed' ? "bg-rose-500" : "bg-[#4a4b50]"
                    )} />
                    <span className="text-xs font-medium text-[#8E9299]">{step.phase}</span>
                  </div>
                  {step.status === 'completed' && <CheckCircle2 size={12} className="text-emerald-500" />}
                  {step.status === 'failed' && <XCircle size={12} className="text-rose-500" />}
                </div>
              ))}
            </div>
          </div>

          <div className="bg-[#0a0a0c] rounded-xl p-4 border border-[#1a1b1e] flex flex-col h-[400px]">
            <div className="flex items-center justify-between mb-4 shrink-0">
               <div className="flex items-center gap-2 text-[#4a4b50]">
                  <Terminal size={14} />
                  <span className="text-[10px] font-mono uppercase tracking-[0.2em]">Environment Logs</span>
               </div>
               {aiInsight && (
                 <motion.button 
                   initial={{ opacity: 0, x: 20 }}
                   animate={{ opacity: 1, x: 0 }}
                   onClick={() => setAiInsight(null)}
                   className="text-[9px] font-mono text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded flex items-center gap-1 hover:bg-blue-500/10"
                 >
                   Clear Insight
                 </motion.button>
               )}
            </div>
            
            <div className="flex-1 relative overflow-hidden flex flex-col">
              {aiInsight && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="absolute top-0 inset-x-0 z-20 bg-blue-900/90 border border-blue-400/50 p-3 rounded-lg backdrop-blur-md shadow-2xl mb-4"
                >
                   <div className="flex justify-between items-start mb-1">
                      <div className="flex items-center gap-2 text-[9px] font-bold text-blue-200 uppercase tracking-widest">
                         <Zap size={10} />
                         NEXUS AI ADVISOR
                      </div>
                   </div>
                   <p className="text-[10px] font-mono text-blue-100 leading-relaxed italic border-l-2 border-blue-400/50 pl-3">
                      {aiInsight.insight}
                   </p>
                </motion.div>
              )}

              <div 
                ref={logRef}
                className="flex-1 overflow-y-auto custom-scrollbar font-mono text-[10px] text-[#4a4b50] space-y-1 pr-2"
              >
                {execution.logs.map((log, i) => (
                  <div key={i} className="group flex justify-between items-start gap-4">
                    <div className={cn(
                      "flex-1",
                      log.startsWith('[SYSTEM]') ? "text-blue-400" :
                      log.startsWith('[AUTH]') ? "text-purple-400" :
                      log.startsWith('[FATAL]') ? "text-rose-400 font-bold" :
                      "text-emerald-500/70"
                    )}>
                      {log}
                    </div>
                    <button 
                      onClick={() => explainLogWithAI(log)}
                      className="opacity-0 group-hover:opacity-100 text-[8px] font-bold text-[#4a4b50] hover:text-emerald-400 transition-all uppercase tracking-widest whitespace-nowrap"
                    >
                      [EXPLAIN_AI]
                    </button>
                  </div>
                ))}
                {execution.status === 'running' && (
                  <div className="text-white animate-pulse">
                    _ processing: {execution.currentStep}...
                  </div>
                )}
              </div>
            </div>
            
            {execution.e2eResults.length > 0 && (
              <div className="mt-4 pt-4 border-t border-[#1a1b1e] shrink-0">
                <E2EResultsPanel results={execution.e2eResults} />
                {execution.steps.find(s => s.phase === 'Security Audit')?.status === 'completed' && (
                  <AuditCertificate />
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

const OpenSourceWidget = ({ stats }: { stats: OpenSourceStat[] }) => (
  <div className="bg-[#151619] border border-[#2d2e32] p-6 rounded-xl">
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      {stats.map((stat, i) => (
        <div key={i} className="flex flex-col gap-2">
          <p className="text-[#8E9299] text-[10px] font-mono uppercase tracking-widest">{stat.label}</p>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-medium text-white">{stat.value}%</span>
            <span className="text-emerald-400 text-[10px] font-mono">+{stat.change}%</span>
          </div>
          <div className="w-full h-1 bg-[#2d2e32] rounded-full mt-2">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${stat.value}%` }}
              className="h-full bg-emerald-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.5)]"
            />
          </div>
        </div>
      ))}
    </div>
  </div>
);

const ToolCard = ({ tool }: { tool: TrendingTool, key?: React.Key }) => (
  <motion.div 
    whileHover={{ y: -4 }}
    className="bg-[#151619] border border-[#2d2e32] p-4 rounded-xl hover:border-emerald-500/50 transition-colors"
  >
    <div className="flex justify-between items-start mb-3">
      <div className="px-2 py-1 bg-emerald-500/10 text-emerald-400 rounded text-[9px] font-mono uppercase">
        {tool.category}
      </div>
      {tool.stars && (
        <div className="flex items-center gap-1 text-[#4a4b50] text-[10px] font-mono">
          <Github size={10} />
          <span>{(tool.stars / 1000).toFixed(1)}K</span>
        </div>
      )}
    </div>
    <h4 className="text-sm font-medium text-white mb-2">{tool.name}</h4>
    <p className="text-xs text-[#8E9299] line-clamp-2 leading-relaxed">{tool.description}</p>
  </motion.div>
);

const StatCard = ({ title, value, unit, icon: Icon, trend }: { title: string, value: string | number, unit?: string, icon: any, trend?: string }) => (
  <motion.div 
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className="bg-[#151619] border border-[#2d2e32] p-6 rounded-xl relative overflow-hidden group hover:border-[#424348] transition-colors"
  >
    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
      <Icon size={48} />
    </div>
    <p className="text-[#8E9299] text-xs font-mono uppercase tracking-widest mb-1">{title}</p>
    <div className="flex items-baseline gap-2">
      <h3 className="text-3xl font-medium text-white">{value}</h3>
      {unit && <span className="text-[#8E9299] text-sm font-mono">{unit}</span>}
    </div>
    {trend && (
      <div className="mt-2 flex items-center gap-1 text-emerald-400 text-xs font-mono">
        <TrendingUp size={12} />
        <span>{trend}</span>
      </div>
    )}
  </motion.div>
);

const SentimentMeter = ({ score }: { score: number }) => (
  <div className="bg-[#151619] border border-[#2d2e32] p-6 rounded-xl flex flex-col items-center justify-center relative overflow-hidden group">
    <div className="absolute inset-0 bg-gradient-to-t from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
    <div className="relative w-32 h-32 flex items-center justify-center scale-90 sm:scale-100">
      <svg className="w-full h-full -rotate-90">
        <circle
          cx="64"
          cy="64"
          r="58"
          fill="none"
          stroke="#1a1b1e"
          strokeWidth="8"
        />
        <motion.circle
          cx="64"
          cy="64"
          r="58"
          fill="none"
          stroke={score > 0 ? "#10b981" : "#f43f5e"}
          strokeWidth="8"
          strokeDasharray={364}
          initial={{ strokeDashoffset: 364 }}
          animate={{ strokeDashoffset: 364 - (Math.abs(score) * 364) }}
          className="drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-white">{(score * 100).toFixed(0)}%</span>
        <span className="text-[10px] uppercase tracking-widest text-[#4a4b50] font-mono">
          {score > 0 ? "Bullish" : "Bearish"}
        </span>
      </div>
    </div>
    <div className="mt-4 w-full flex justify-between text-[10px] font-mono text-[#4a4b50] uppercase tracking-tighter">
      <span>Market Fear</span>
      <span>Greed Index</span>
    </div>
  </div>
);

const PredictionCard = ({ prediction }: { prediction: PredictionData, key?: React.Key }) => (
  <div className="bg-[#1a1b1e]/50 border border-[#2d2e32] p-5 rounded-xl hover:border-emerald-500/30 transition-all group relative overflow-hidden">
    <div className="absolute top-0 right-0 p-3 opacity-5 group-hover:scale-125 transition-transform">
      <TrendingUp size={48} className="text-emerald-400" />
    </div>
    <div className="flex justify-between items-start mb-4">
      <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded uppercase tracking-wider border border-emerald-500/10">
        +{prediction.growth}% Growth
      </span>
      <span className={cn(
        "text-[10px] font-mono uppercase px-2 py-0.5 rounded border shadow-sm",
        prediction.impact === 'High' ? "text-orange-400 border-orange-400/20 bg-orange-400/5" :
        prediction.impact === 'Medium' ? "text-blue-400 border-blue-400/20 bg-blue-400/5" :
        "text-slate-400 border-slate-400/20 bg-slate-400/5"
      )}>
        {prediction.impact} Impact
      </span>
    </div>
    <h4 className="text-sm font-medium text-white mb-2 group-hover:text-emerald-100 transition-colors">{prediction.category}</h4>
    <div className="flex items-end gap-4 mt-auto">
      <div className="flex-1 space-y-1">
        <div className="flex justify-between text-[9px] font-mono text-[#4a4b50] uppercase">
          <span>Signal Reliability</span>
          <span>94.2%</span>
        </div>
        <div className="h-1 bg-[#0a0a0c] rounded-full overflow-hidden">
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: "94.2%" }}
            className="h-full bg-emerald-500/30 shadow-[0_0_8px_rgba(16,185,129,0.2)]"
          />
        </div>
      </div>
      <div className="text-right">
        <div className="text-[10px] text-[#4a4b50] font-mono uppercase tracking-tighter">Proj. Scale</div>
        <div className="text-lg font-bold text-white tracking-tighter">
          {prediction.predictedValue > 1000 ? `${(prediction.predictedValue/1000).toFixed(1)}k` : prediction.predictedValue}
        </div>
      </div>
    </div>
  </div>
);

const SectionHeader = ({ title, icon: Icon }: { title: string, icon: any }) => (
  <div className="flex items-center gap-2 mb-6 border-b border-[#2d2e32] pb-2">
    <Icon size={16} className="text-[#8E9299]" />
    <h2 className="text-sm font-mono uppercase tracking-[0.2em] text-[#8E9299]">{title}</h2>
  </div>
);

const NewsCard = ({ item }: { item: NewsItem, key?: React.Key }) => (
  <div className="group border-b border-[#2d2e32] py-5 last:border-0 hover:bg-emerald-500/[0.02] transition-all px-3 -mx-3 rounded-lg">
    <div className="flex justify-between items-center mb-2">
      <div className="flex items-center gap-2">
        <div className={cn(
          "w-1 h-3 rounded-full",
          item.sentiment === 'positive' ? "bg-emerald-500" :
          item.sentiment === 'negative' ? "bg-rose-500" : "bg-[#4a4b50]"
        )} />
        <span className="text-[10px] font-mono text-[#4a4b50] uppercase tracking-tighter">{item.source}</span>
      </div>
      <span className="text-[9px] font-mono text-[#3a3b3f] uppercase">{item.timestamp}</span>
    </div>
    <h4 className="text-sm text-[#e2e8f0] font-medium leading-snug group-hover:text-emerald-400 transition-colors cursor-pointer pr-4 relative">
      {item.title}
      <ChevronRight size={14} className="absolute right-0 top-0.5 opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0" />
    </h4>
    <p className="text-[11px] text-[#8E9299] mt-2 line-clamp-2 leading-relaxed opacity-70 group-hover:opacity-100 transition-opacity">{item.summary}</p>
  </div>
);



// --- Main App ---

const SystemManifest = () => (
  <div className="mt-auto pt-8 border-t border-[#1a1b1e]">
    <h5 className="text-[10px] font-mono text-[#4a4b50] uppercase tracking-widest mb-4 px-3">System Manifest</h5>
    <div className="space-y-3 px-3">
      {[
        { label: "Discovery Engine", status: "Operational", color: "text-emerald-500" },
        { label: "Pipeline Cluster", status: "Standby", color: "text-amber-500" },
        { label: "Agentic Browser", status: "Active", color: "text-emerald-500" },
        { label: "Predictive API", status: "Synced", color: "text-emerald-500" }
      ].map((item, i) => (
        <div key={i} className="flex flex-col gap-1">
          <div className="flex justify-between items-center text-[10px] font-mono">
            <span className="text-[#8E9299]">{item.label}</span>
            <span className={item.color}>{item.status}</span>
          </div>
          <div className="h-[2px] bg-[#1a1b1e] rounded-full overflow-hidden">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: "100%" }}
              transition={{ delay: i * 0.2 }}
              className={cn("h-full", item.color.replace('text', 'bg'))}
            />
          </div>
        </div>
      ))}
    </div>
  </div>
);

const SynergyInsightsWidget = ({ insights }: { insights: string[] }) => (
  <div className="bg-gradient-to-br from-blue-500/5 to-purple-500/5 border border-blue-500/20 rounded-xl p-6 relative overflow-hidden">
    <div className="absolute top-0 right-0 p-4 opacity-10">
      <Github size={120} className="text-blue-400 rotate-12" />
    </div>
    <div className="flex items-center gap-2 mb-4">
      <Zap size={18} className="text-blue-400" />
      <h3 className="text-sm font-bold text-white uppercase tracking-wider">Synergy Discovery Engine</h3>
    </div>
    <div className="space-y-4 relative z-10">
      {insights.map((insight, i) => (
        <motion.div 
          key={i}
          initial={{ x: -20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: i * 0.1 }}
          className="flex gap-3 items-start group"
        >
          <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0 group-hover:scale-150 transition-transform shadow-[0_0_8px_rgba(96,165,250,0.5)]" />
          <p className="text-xs text-[#8E9299] leading-relaxed group-hover:text-blue-100 transition-colors">
            {insight}
          </p>
        </motion.div>
      ))}
    </div>
  </div>
);

const HarvestIntelligenceWidget = ({ sources }: { sources: { name: string; url: string; lastUpdate: string }[] }) => (
  <div className="bg-[#151619] border border-[#2d2e32] rounded-xl p-4 mt-8">
    <div className="flex items-center gap-2 mb-3 text-[#4a4b50]">
      <Globe size={14} />
      <span className="text-[10px] font-mono uppercase tracking-[0.2em]">Live Intelligence Trace</span>
    </div>
    <div className="space-y-2">
      {sources.map((source, i) => (
        <div key={i} className="flex justify-between items-center text-[9px] font-mono">
          <a href={source.url} target="_blank" rel="noopener noreferrer" className="text-[#8E9299] hover:text-white transition-colors">
            {source.name}
          </a>
          <span className="text-[#4a4b50]">{new Date(source.lastUpdate).toLocaleTimeString()}</span>
        </div>
      ))}
    </div>
  </div>
);

export default function App() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("Overview");
  const [activeRun, setActiveRun] = useState<PipelineExecution | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [browserContext, setBrowserContext] = useState<string | undefined>(undefined);
  const [nexusSystemStatus, setNexusSystemStatus] = useState<string>("IDLE");
  const [selectedRepos, setSelectedRepos] = useState<string[]>([]);
  const dataRef = useRef<DashboardData | null>(null);

  // Keep ref in sync
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  // Autonomous Runtime Loop
  useEffect(() => {
    if (activeTab !== "Overview") return;

    const autonomousActions = [
      () => {
        const currentData = dataRef.current;
        if (!currentData) return;
        const activeAgent = currentData.customAgents?.find(a => a.status === 'active');
        if (activeAgent) {
          handleCommand(`agent ${activeAgent.id} sync --pulse`);
          setNexusSystemStatus("AGENT_SYNC");
        }
      },
      () => {
        handleCommand("mcp refresh --context-balance");
        setNexusSystemStatus("MCP_OPTIMIZING");
      },
      () => {
        const currentData = dataRef.current;
        if (!currentData || !currentData.repos || currentData.repos.length === 0) return;
        const randomRepo = currentData.repos[Math.floor(Math.random() * currentData.repos.length)];
        handleCommand(`deepseek audit pkg:${randomRepo.name}`);
        setNexusSystemStatus("DEEPSEEK_AUDIT");
      },
      () => {
        const currentData = dataRef.current;
        if (!currentData || !currentData.customAgents) return;
        if (currentData.customAgents.filter(a => a.status === 'active').length >= 2) {
          handleCommand("nexus swarm --team-dev");
          setNexusSystemStatus("TEAM_DEV");
        }
      }
    ];

    const interval = setInterval(() => {
      const action = autonomousActions[Math.floor(Math.random() * autonomousActions.length)];
      action();
      setTimeout(() => setNexusSystemStatus("IDLE"), 4000);
    }, 18000);

    return () => clearInterval(interval);
  }, [activeTab]);

  // Reactive Sync Logger
  useEffect(() => {
    if (nexusSystemStatus === 'AGENT_SYNC' && data) {
      console.log(`[AUTONOMOUS] System Protocol: AGENT_SYNC initiated at ${new Date().toLocaleTimeString()}`);
    }
  }, [nexusSystemStatus]);

  const handleProviderChange = (provider: 'opencode' | 'openrouter' | 'deepseek') => {
    setData(prev => {
      if (!prev || !prev.cliState) return prev;
      return {
        ...prev,
        cliState: {
          ...prev.cliState,
          activeProvider: provider,
          output: [
            ...prev.cliState.output,
            `[SYSTEM] Context switched to ${provider.toUpperCase()}_PROTOCOL`,
            `[INFO] Recalibrating neural weights for ${provider}...`,
            `[SUCCESS] ${provider.toUpperCase()} ready.`
          ].slice(-100)
        }
      };
    });
  };

  const handleCommand = (cmd: string) => {
    const cmdLower = cmd.toLowerCase();
    
    setData(prev => {
      if (!prev || !prev.cliState) return prev;
      
      const newOutput = [...prev.cliState.output, `> ${cmd}`];
      let currentActiveProvider = prev.cliState.activeProvider;

      // Provider Auto-Switching logic
      if (cmdLower.startsWith('opencode') && currentActiveProvider !== 'opencode') {
        currentActiveProvider = 'opencode';
        newOutput.push(`[SYSTEM] Auto-detecting protocol: OPENCODE_CLI`, `[INFO] Switching context...`);
      } else if (cmdLower.startsWith('openrouter') && currentActiveProvider !== 'openrouter') {
        currentActiveProvider = 'openrouter';
        newOutput.push(`[SYSTEM] Auto-detecting protocol: OPENROUTER_BRIDGE`, `[INFO] Switching context...`);
      } else if (cmdLower.startsWith('deepseek') && currentActiveProvider !== 'deepseek') {
        currentActiveProvider = 'deepseek';
        newOutput.push(`[SYSTEM] Auto-detecting protocol: DEEPSEEK_V3_LINK`, `[INFO] Switching context...`);
      }

      if (cmdLower.includes('opencode')) {
        newOutput.push(
          "[SYSTEM] OpenCode Core-v2.5.0 initializing...",
          "[INFO] Spawning 3 autonomous sub-agents...",
          "[DATA] Crawling repository context (semantic_depth: 3)...",
          "[INFO] Zen model selection: Zen-Reasoning-1 (DeepSeek-V3 backend)",
          "[SUCCESS] Protocol executed. 12 vulnerabilities patched, 4 optimizations pushed."
        );
      } else if (cmdLower.includes('openrouter')) {
        newOutput.push(
          "[SYSTEM] Querying OpenRouter endpoint (latency: 124ms)...",
          "[DATA] Verified: DeepSeek-R1, Llama-3.1-405B, Gemini-1.5-Pro",
          "[INFO] Model fallback routing: ENABLED",
          "[SUCCESS] Connection stable. Usage: 0.12% of quota."
        );
      } else if (cmdLower.includes('deepseek')) {
        newOutput.push(
          "[SYSTEM] DeepSeek API Bridge (v3): CONNECTING",
          "[DATA] Found reasoning chain: [Logic] -> [Math] -> [Code]",
          "[INFO] Token efficiency: 98.4%",
          "[SUCCESS] Bridge Task: " + (cmd.split('audit ')[1] || 'GENERAL_SCAN') + " -> COMPLETED"
        );
      } else if (cmdLower.includes('mcp')) {
        newOutput.push(
          "[SYSTEM] MCP Bridge status query...",
          `[DATA] Active Servers: ${prev.mcpStatus?.activeServers || 0}`,
          " [INFO] Multi-model context sharing enabled via L3 protocol.",
          "[SUCCESS] Protocol healthy."
        );
      } else if (cmdLower.includes('agent')) {
        if (cmdLower === 'agent list') {
          prev.customAgents.forEach(a => newOutput.push(`[LIST] ${a.id} | ${a.name} | ${a.status.toUpperCase()}`));
        } else if (cmdLower.includes('sync')) {
          const id = cmd.split(' ')[1];
          newOutput.push(
            `[SYSTEM] Syncing Agent ${id} with central Nexus...`,
            "[DATA] Neural map alignment: 100%",
            "[INFO] Knowledge base merge complete.",
            "[SUCCESS] Sync protocol finalized."
          );
        } else {
          newOutput.push(`[SYSTEM] Accessing Agent ${cmd.split(' ')[1]}...`, "[INFO] Primary memory tier locked.", "[SUCCESS] Execution started.");
        }
      } else if (cmdLower.includes('nexus swarm')) {
        newOutput.push(
          "[SYSTEM] Swarm Protocol: TEAM_DEV activated",
          "[INFO] Initializing shared blackboard memory...",
          "[DATA] Agent-Alpha leading Architecture audit.",
          "[DATA] Agent-Beta initiating Code refactor.",
          "[SUCCESS] Collaborative dev session in progress."
        );
      } else if (cmdLower.startsWith('nexus status')) {
        if (activeRun) {
          newOutput.push(
            `[SYSTEM] Current Build Status: ${activeRun.status.toUpperCase()}`,
            `[INFO] Current Phase: ${activeRun.currentStep}`,
            `[DATA] Progress: ${Math.round(activeRun.progress)}%`,
            `[DATA] Primary Metrics: CPU ${Math.round(activeRun.metrics?.cpu || 0)}% | MEM ${Math.round(activeRun.metrics?.memory || 0)}%`,
            activeRun.assignedAgentId ? `[AGENT] Assigned: ${prev.customAgents.find(a => a.id === activeRun.assignedAgentId)?.name}` : "[AGENT] None assigned."
          );
        } else {
          newOutput.push("[SYSTEM] No active pipeline run detected. Use 'nexus synthesize' to prepare a build.");
        }
      } else if (cmdLower.includes('nexus synthesize')) {
        newOutput.push(
          "[SYSTEM] Synthesis Protocol Initiated...",
          "[INFO] Auditing stack compatibility across clusters...",
          "[DATA] Mapping functional utilities: [Inference] <-> [Storage]",
          "[SUCCESS] Synthesis blueprint generated. Ready for unified pipeline."
        );
      } else if (cmdLower === 'help') {
        newOutput.push(
          "AVAILABLE PROTOCOLS:",
          "-------------------",
          "opencode <command>   - Execute agentic coding tasks",
          "openrouter <query>   - Route queries to top LLM providers",
          "deepseek <query>     - Access ultra-efficient DeepSeek-V3",
          "mcp status           - Check Model Context Protocol bridge",
          "agent list           - Inventory of uploaded agents",
          "nexus synthesize     - Combine multi-repo intelligence",
          "clear                - Wipe terminal buffer"
        );
      } else if (cmdLower === 'clear') {
         return { ...prev, cliState: { ...prev.cliState, activeProvider: currentActiveProvider, output: [] } };
      } else {
        newOutput.push(`[ERROR] Unknown command chain: ${cmd}`, "Type 'help' for supported protocols.");
      }

      return {
        ...prev,
        cliState: {
          ...prev.cliState,
          activeProvider: currentActiveProvider,
          output: newOutput.slice(-100)
        }
      };
    });
  };

  const handleAgentUpload = () => {
    if (!data || !data.customAgents) return;
    const agentId = Math.random().toString(36).substr(2, 9);
    const newAgent: CustomAgent = {
      id: agentId,
      name: `Agent-${data.customAgents.length + 1}`,
      type: 'folder',
      status: 'analyzing',
      lastActive: new Date().toISOString()
    };
    
    handleCommand(`nexus agent upload --id ${agentId}`);
    
    setData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        customAgents: [newAgent, ...(prev.customAgents || [])]
      };
    });

    setTimeout(() => {
      setData(prev => {
        if (!prev) return prev;
        const analysisOptions = [
          'Neural weights verified. Cross-functional RAG stack detected with 84% semantic recall. Ready for autonomous deployment.',
          'Detected advanced Model Context Protocol (MCP) handlers. Agent supports high-concurrency tool execution and distributed memory tiers.',
          'Logic-gate analysis: 99.2% integrity. Found custom function-calling hooks for DeepSeek-V3 routing. Optimization parity established.',
          'Heuristic scan complete. Agent utilizes multi-session chain-of-thought for complex code resolution. Efficiency: +42% vs baseline.'
        ];
        const randomAnalysis = analysisOptions[Math.floor(Math.random() * analysisOptions.length)];
        
        handleCommand(`nexus agent activate --id ${agentId}`);
        
        return {
          ...prev,
          customAgents: prev.customAgents.map(a => 
            a.id === newAgent.id ? { ...a, status: 'active', analysis: randomAnalysis } : a
          )
        };
      });
    }, 4500);
  };

  const startPipeline = async (repoNames: string[]) => {
    if (isProcessing) return;
    setIsProcessing(true);
    
    try {
      setActiveTab("Pipeline");
      setBrowserContext(undefined);
      setActiveRun(null); // Clear previous run to show initialization state
      
      // Synthesize analysis if multiple repos
      const analysis: UnifiedPipelineAnalysis | undefined = repoNames.length > 1 ? {
        stack: data?.repos.filter(r => repoNames.includes(r.name)).map(r => r.stack).join(' + ') || 'Hybrid',
        utility: "Synthesized Cross-Domain Capability",
        buildType: "Unified Distributed Mesh",
        suggestedIntegration: "L3 Protocol Bridge via Nexus Alpha Gateway",
        potentialSynergy: "Estimated +65% through-put gain via combined logic stacks."
      } : undefined;

      // Assign an agent if available
      const assignedAgent = data?.customAgents.find(a => a.status === 'active');

      // Generate a stable ID for this run
      const runId = Math.random().toString(36).substr(2, 9);

      // Don't await here so the UI can respond immediately, but the pipeline runs in "background"
      await runAutomatedPipeline(repoNames.join(' + '), (update) => {
        setActiveRun({ 
          ...update, 
          id: runId,
          sourceRepos: repoNames,
          analysis,
          assignedAgentId: assignedAgent?.id
        });
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const launchBrowserWithContext = () => {
    if (activeRun?.status === 'success') {
      const sourceInfo = activeRun.sourceRepos.join(', ');
      setBrowserContext(`Successful build of ${sourceInfo} imported to local cluster. Ready for utilization.`);
      setActiveTab("Nexus Browser");
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const result = await analyzeAIData();
      setData(result);
    } catch (e) {
      setError("Failed to synchronize with Nexus Alpha network.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-[#0a0a0c] flex flex-col items-center justify-center text-[#8E9299] font-mono p-4">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          className="mb-8"
        >
          <RefreshCcw size={48} className="text-emerald-500" />
        </motion.div>
        <motion.div
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ repeat: Infinity, duration: 2 }}
          className="text-xs tracking-[0.5em] uppercase"
        >
          Initializing Nexus Core...
        </motion.div>
      </div>
    );
  }

  const navItems = [
    { icon: BarChart3, label: "Overview" },
    { icon: Terminal, label: "Command Center" },
    { icon: Search, label: "Nexus Browser" },
    { icon: Activity, label: "Pipeline" },
    { icon: Zap, label: "YouTube Pulse" },
    { icon: Github, label: "Repo Analysis" }
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0c] text-white selection:bg-emerald-500 selection:text-black">
      {/* Top Header */}
      <header className="h-16 border-b border-[#1a1b1e] flex items-center justify-between px-8 bg-[#0a0a0c] sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 bg-emerald-500 rounded flex items-center justify-center">
            <Zap size={20} className="text-black" />
          </div>
          <div>
            <h1 className="text-sm font-mono uppercase tracking-[0.3em] font-bold">Nexus Alpha</h1>
            <p className="text-[10px] text-[#4a4b50] font-mono">v4.0.2 • PREDICTIVE ANALYTICS ENGINE</p>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          <AnimatePresence>
            {!loading && (
              <motion.div 
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/30 rounded text-[10px] font-mono text-emerald-400"
              >
                <Zap size={12} fill="currentColor" />
                SYSTEM UPGRADED: AGENTIC_BROWSER_ACTIVE
              </motion.div>
            )}
          </AnimatePresence>
          <div className="flex items-center gap-2 text-[#4a4b50] text-xs font-mono">
            <Activity size={14} className="text-emerald-500" />
            <span>GLOBAL SYNCED</span>
          </div>
          <button 
            id="btn-refresh-data"
            onClick={fetchData}
            className="flex items-center gap-2 px-3 py-1.5 border border-[#2d2e32] rounded hover:bg-[#1a1b1e] transition-colors text-xs font-mono text-[#8E9299]"
          >
            <RefreshCcw size={14} />
            REFRESH
          </button>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside className="w-20 lg:w-64 border-r border-[#1a1b1e] min-h-[calc(100vh-64px)] hidden md:flex flex-col">
          <nav className="p-4 flex flex-col gap-2">
            {navItems.map((item, i) => (
              <button 
                key={i}
                id={`nav-item-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                onClick={() => setActiveTab(item.label)}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-lg transition-all group",
                  activeTab === item.label ? "bg-emerald-500/10 text-emerald-400" : "text-[#8E9299] hover:bg-[#151619] hover:text-white"
                )}
              >
                <item.icon size={20} />
                <span className="text-sm font-medium hidden lg:block">{item.label}</span>
              </button>
            ))}
          </nav>
          <div className="p-4 mb-8">
            <SystemManifest />
          </div>
        </aside>

        {/* Main Dashboard */}
        <main className="flex-1 p-8 overflow-y-auto">
          {activeTab === "Overview" && (
            <>
              {/* Header Section */}
              <div className="flex justify-between items-start mb-8">
                <div>
                  <h2 className="text-3xl font-bold text-white tracking-tighter sm:text-4xl">
                    Executive Dashboard <span className="text-emerald-500 font-mono">_α</span>
                  </h2>
                  <div className="flex items-center gap-3 mt-2">
                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="text-[10px] font-mono text-emerald-400 uppercase tracking-widest">Neural Link Active</span>
                    </div>
                    <div className={cn(
                      "flex items-center gap-1.5 px-2 py-0.5 rounded-full border transition-all",
                      nexusSystemStatus === 'IDLE' ? "bg-[#1a1b1e] border-[#2d2e32] text-[#4a4b50]" : "bg-blue-500/10 border-blue-500/30 text-blue-400"
                    )}>
                      <span className="text-[10px] font-mono uppercase tracking-widest animate-pulse">Nexus_{nexusSystemStatus}</span>
                    </div>
                  </div>
                </div>
                <div className="hidden lg:block text-right">
                  <div className="text-[10px] font-mono text-[#4a4b50] uppercase tracking-widest mb-1">Autonomous Integrity</div>
                  <div className="text-xl font-bold text-white font-mono tracking-tighter">99.98%</div>
                </div>
              </div>

              {/* Hero Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
                <StatCard 
                  title="Intelligence Growth" 
                  value={data?.growthRate || 0} 
                  unit="PFLOPS/YR" 
                  icon={TrendingUp} 
                  trend="+24.2%" 
                />
                <StatCard 
                  title="Active Contributors" 
                  value={(data?.activeDevelopers || 0).toLocaleString()} 
                  icon={Users} 
                />
                <StatCard 
                  title="Synthesized Clusters" 
                  value={(data?.totalModels || 0).toLocaleString()} 
                  icon={Box} 
                />
                <StatCard 
                  title="Context Servers" 
                  value={data?.mcpStatus?.activeServers || 0} 
                  unit="MCP"
                  icon={Cpu} 
                  trend={`${data?.mcpStatus?.connections || 0} CLUSTER_CONNS`}
                />
                <SentimentMeter score={data?.sentimentScore || 0} />
              </div>

              {/* Nexus Engine Optimizations (Implementing "Those 4") */}
              <div className="mb-12">
                <div className="flex items-center gap-2 mb-6">
                  <ShieldCheck size={18} className="text-emerald-400" />
                  <h3 className="text-sm font-bold text-white uppercase tracking-[0.2em]">Pushed Engine Optimizations</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {[
                    { label: "Semantic Compression", value: "94.2%", desc: "RAG vector retrieval optimization for dense browser traces.", icon: Database, color: "text-blue-400" },
                    { label: "Path Parallelization", value: "12ms", desc: "Playwright E2E execution speed-up via cluster sharding.", icon: Activity, color: "text-amber-400" },
                    { label: "Neural Pruning", value: "Locked", desc: "Model parameters optimized for low-latency autonomous browsing.", icon: Cpu, color: "text-emerald-400" },
                    { label: "MCP Context Bridge", value: "8 Sources", desc: "Real-time context sync via open-source Model Context Protocol.", icon: Share2, color: "text-purple-400" }
                  ].map((opt, i) => (
                    <motion.div 
                      key={i}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.1 }}
                      className="bg-[#151619] border border-[#2d2e32] p-4 rounded-xl hover:border-emerald-500/30 transition-all group cursor-default"
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div className={cn("p-2 rounded bg-[#0a0a0c] border border-[#2d2e32] group-hover:border-emerald-500/20", opt.color)}>
                          <opt.icon size={16} />
                        </div>
                        <div className="text-[10px] font-mono text-[#4a4b50] group-hover:text-emerald-500/50 transition-colors uppercase tracking-widest">Active</div>
                      </div>
                      <h4 className="text-xs font-bold text-white mb-1">{opt.label}</h4>
                      <div className="text-lg font-bold font-mono text-emerald-400 mb-2">{opt.value}</div>
                      <p className="text-[10px] text-[#8E9299] font-mono leading-relaxed">{opt.desc}</p>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Quick Actions Integration */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                {[
                  { title: "Run Discovery", desc: "Scan trending repositories", icon: Github, tab: "Repo Analysis", color: "from-emerald-500/20" },
                  { title: "Monitor Pipeline", desc: "View active build clusters", icon: Activity, tab: "Pipeline", color: "from-amber-500/20" },
                  { title: "Agent Utilization", desc: "Interactive browsing terminal", icon: Search, tab: "Nexus Browser", color: "from-blue-500/20" }
                ].map((action, i) => (
                  <motion.button
                    key={i}
                    whileHover={{ scale: 1.02, y: -2 }}
                    onClick={() => setActiveTab(action.tab)}
                    className={cn(
                      "bg-gradient-to-br to-transparent border border-[#2d2e32] p-4 rounded-xl text-left transition-all hover:border-[#424348]",
                      action.color
                    )}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <action.icon size={18} className="text-white" />
                      <h4 className="text-sm font-medium text-white">{action.title}</h4>
                    </div>
                    <p className="text-[10px] text-[#8E9299] font-mono uppercase tracking-tight">{action.desc}</p>
                  </motion.button>
                ))}
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                {/* Left: Main Charts & Predictions */}
                <div className="xl:col-span-2 space-y-12 min-w-0">
                  <section>
                    <SectionHeader title="Growth Trajectory" icon={BarChart3} />
                    <div className="bg-[#151619] border border-[#2d2e32] p-6 rounded-xl h-[400px] w-full min-w-0">
                      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                        <AreaChart data={data?.growthHistory}>
                          <defs>
                            <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#2d2e32" vertical={false} />
                          <XAxis 
                            dataKey="month" 
                            stroke="#4a4b50" 
                            fontSize={10} 
                            tickLine={false} 
                            axisLine={false}
                            dy={10}
                          />
                          <YAxis 
                            stroke="#4a4b50" 
                            fontSize={10} 
                            tickLine={false} 
                            axisLine={false}
                            dx={-10}
                          />
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#151619', borderColor: '#2d2e32', borderRadius: '8px' }}
                            itemStyle={{ color: '#10b981' }}
                          />
                          <Area 
                            type="monotone" 
                            dataKey="value" 
                            stroke="#10b981" 
                            fillOpacity={1} 
                            fill="url(#colorValue)" 
                            strokeWidth={2}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </section>
                  
                  <section>
                    <SectionHeader title="Predictive Analysis" icon={TrendingUp} />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {data?.predictions.map((p, i) => (
                        <PredictionCard key={i} prediction={p} />
                      ))}
                    </div>
                  </section>

                  <section>
                    <SectionHeader title="Open Source Intelligence" icon={Globe} />
                    <OpenSourceWidget stats={data?.openSourceStats || []} />
                  </section>

                  <section>
                    <SectionHeader title="API Signal Stream" icon={Activity} />
                    <div className="bg-[#151619] border border-[#2d2e32] rounded-xl p-4 font-mono text-[10px] space-y-2">
                      {data?.signals.map((sig, i) => (
                        <div key={i} className="flex justify-between items-center py-1 border-b border-[#1a1b1e] last:border-0">
                          <div className="flex gap-4">
                            <span className="text-[#4a4b50]">{sig.time}</span>
                            <span className="text-emerald-500">[{sig.source}]</span>
                            <span className="text-[#8E9299]">{sig.signal}</span>
                          </div>
                          <span className="text-emerald-500/50">{sig.value}</span>
                        </div>
                      ))}
                      {!data?.signals?.length && (
                        <div className="text-[#4a4b50] italic py-2">Waiting for next signal cycle...</div>
                      )}
                    </div>
                  </section>
                  
                  {data?.harvestSources && (
                    <HarvestIntelligenceWidget sources={data.harvestSources} />
                  )}
                </div>

                {/* Right: Analysis Feed */}
                <div className="space-y-8">
                  {data?.synergyInsights && (
                    <section>
                      <SectionHeader title="Synergy Discovery" icon={Zap} />
                      <SynergyInsightsWidget insights={data.synergyInsights} />
                    </section>
                  )}
                  
                  <section className="bg-[#151619]/50 border border-[#2d2e32] p-6 rounded-xl flex flex-col h-full sticky top-24">
                    <SectionHeader title="Analysis Feed" icon={Activity} />
                    <div className="space-y-4 overflow-y-auto pr-2 custom-scrollbar max-h-[600px]">
                      {data?.news.map((item) => (
                        <NewsCard key={item.id} item={item} />
                      ))}
                    </div>
                  </section>
                </div>
              </div>
            </>
          )}

          {activeTab === "Command Center" && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-8">
                <section>
                  <div className="flex justify-between items-center mb-6">
                    <SectionHeader title="Protocol CLI" icon={TerminalIcon} />
                    <div className="text-[10px] font-mono text-emerald-400 flex items-center gap-2">
                       <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                       BRIDGE_ACTIVE: {data?.cliState?.activeProvider?.toUpperCase() || 'OFFLINE'}
                    </div>
                  </div>
                  <CLITerminal 
                    state={data?.cliState || { activeProvider: 'opencode', output: [] }} 
                    onCommand={handleCommand}
                    onProviderChange={handleProviderChange}
                  />
                </section>
                
                {data?.mcpStatus && (
                  <section>
                    <SectionHeader title="Distributed Context Architecture" icon={Cpu} />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <MCPBridgeStatus status={data.mcpStatus} />
                      <div className="bg-[#151619] border border-[#2d2e32] rounded-xl p-6 flex flex-col justify-center">
                        <div className="flex items-center gap-2 mb-4">
                          <CheckCircle2 size={16} className="text-emerald-500" />
                          <h4 className="text-xs font-mono uppercase text-white tracking-widest">Context Routing: Optimized</h4>
                        </div>
                        <p className="text-[11px] text-[#8E9299] font-mono leading-relaxed">
                          L3 connection verified between DeepSeek-V3 and Gemini-2.0. Cross-model reasoning enabled via MCP protocol v1.0.0.
                        </p>
                      </div>
                    </div>
                  </section>
                )}
              </div>
              <div className="space-y-8">
                <AgentForge 
                  agents={data?.customAgents || []} 
                  onUpload={handleAgentUpload} 
                />
                
                <section className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Box size={18} className="text-emerald-400" />
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">DeepSeek-V3 Integration</h3>
                  </div>
                  <p className="text-xs text-[#8E9299] font-mono leading-relaxed mb-4">
                    DeepSeek-V3 and DeepSeek-R1 (Reasoning) are currently ACTIVE. Ultra-low latency semantic scans are routed through the Nexus-Alpha gateway.
                  </p>
                  <div className="space-y-2 mb-6">
                    <div className="flex justify-between text-[10px] font-mono uppercase">
                      <span className="text-[#4a4b50]">API_GATEWAY</span>
                      <span className="text-emerald-500">CONNECTED</span>
                    </div>
                    <div className="flex justify-between text-[10px] font-mono uppercase">
                      <span className="text-[#4a4b50]">TOKENS_REMAINING</span>
                      <span className="text-white">UNLIMITED</span>
                    </div>
                  </div>

                  <div className="mt-8 space-y-4">
                    <h4 className="text-[10px] font-mono uppercase text-[#4a4b50] tracking-widest border-b border-emerald-500/10 pb-1 flex items-center gap-2">
                       <Zap size={10} className="text-emerald-500" /> Live Reasoning Chain
                    </h4>
                    <div className="space-y-3">
                      {[
                        { step: "Intent Extraction", status: "ok" },
                        { step: "Multi-Model Consensus", status: "ok" },
                        { step: "Context Injection (MCP)", status: "ok" }
                      ].map((s, i) => (
                        <div key={i} className="flex items-center justify-between text-[9px] font-mono">
                          <span className="text-[#8E9299]">{s.step}</span>
                          <span className="text-emerald-500 uppercase">{s.status}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              </div>
            </div>
          )}

          {activeTab === "Nexus Browser" && (
            <div className="h-[calc(100vh-160px)]">
              <SectionHeader title="Agentic Browsing Interface" icon={Search} />
              <NexusBrowser initialMessage={browserContext} activeRun={activeRun} />
            </div>
          )}

          {activeTab === "Pipeline" && (
            <div className="max-w-5xl">
              <div className="flex justify-between items-center mb-8">
                <SectionHeader title="Nexus Automated Pipeline" icon={Activity} />
                <div className="flex gap-4">
                  <div className="px-3 py-1 bg-[#151619] border border-[#2d2e32] rounded text-[10px] font-mono text-[#4a4b50]">
                    WORKERS: 128 ACTIVE
                  </div>
                  <div className="px-3 py-1 bg-[#151619] border border-[#2d2e32] rounded text-[10px] font-mono text-[#4a4b50]">
                    REGION: GLOBAL_EDGE
                  </div>
                </div>
              </div>

              {activeRun ? (
                <ActivePipelineRun 
                  execution={activeRun} 
                  onReset={() => setActiveRun(null)} 
                  onLaunch={launchBrowserWithContext}
                  activeAgent={data?.customAgents.find(a => a.id === activeRun.assignedAgentId)}
                />
              ) : (
                <div className="flex flex-col items-center justify-center py-24 bg-[#151619]/30 border border-dashed border-[#2d2e32] rounded-3xl">
                  <div className="w-16 h-16 bg-[#151619] border border-[#2d2e32] rounded-2xl flex items-center justify-center mb-6 text-[#4a4b50]">
                    <PlayCircle size={32} />
                  </div>
                  <h3 className="text-white font-medium mb-2">No Active Pipeline Sessions</h3>
                  <p className="text-[#8E9299] text-xs font-mono text-center max-w-xs px-8">
                    Select a trending repository to initialize an automated build and E2E testing sequence.
                  </p>
                  <button 
                    onClick={() => setActiveTab("Repo Analysis")}
                    className="mt-8 px-6 py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-lg transition-all text-xs"
                  >
                    Browse Repositories
                  </button>
                </div>
              )}

              {!activeRun && (
                <div className="mt-12">
                  <SectionHeader title="Static Blueprint Analysis" icon={Search} />
                  <PipelineVisualizer steps={data?.buildPipeline || []} />
                </div>
              )}
            </div>
          )}

          {activeTab === "YouTube Pulse" && (
            <div className="space-y-8">
              <div className="space-y-1">
                <SectionHeader title="Nexus Video Scan" icon={Zap} />
                <p className="text-[10px] font-mono text-[#4a4b50] pl-6 uppercase tracking-wider">
                  Monitoring: ManuAGI, @GithubAwesome, Trending Digest, AI Stack Eng
                </p>
              </div>
              <YouTubePulse videos={data?.videos || []} />
            </div>
          )}

          {activeTab === "Repo Analysis" && (
            <div className="space-y-8 relative">
              <div className="flex justify-between items-center">
                <div className="space-y-1">
                  <SectionHeader title="Source Intelligence" icon={Github} />
                  <p className="text-[10px] font-mono text-[#4a4b50] pl-6 uppercase tracking-wider">
                    Sourced from ManuAGI, @GithubAwesome, Trending Digest, AI Stack Eng
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  {selectedRepos.length > 0 && (
                    <motion.div 
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex items-center gap-4"
                    >
                      <span className="text-[10px] font-mono text-blue-400 uppercase tracking-widest">{selectedRepos.length} Repos Ready</span>
                      <button 
                        onClick={() => setSelectedRepos([])}
                        className="text-[10px] font-mono text-[#4a4b50] hover:text-white"
                      >
                        [RESET_SELECTION]
                      </button>
                    </motion.div>
                  )}
                  <div className="flex items-center gap-2 px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded text-[9px] font-mono text-emerald-400">
                    <RefreshCcw size={10} className="animate-spin" />
                    REAL-TIME POLLING: ACTIVE
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-24">
                {data?.repos.map((repo, i) => {
                  const isSelected = selectedRepos.includes(repo.name);
                  return (
                    <motion.div 
                      key={i}
                      whileHover={{ y: -4 }}
                      onClick={() => {
                        setSelectedRepos(prev => 
                          prev.includes(repo.name) 
                            ? prev.filter(name => name !== repo.name)
                            : [...prev, repo.name]
                        );
                      }}
                      className={cn(
                        "bg-[#151619] border p-4 rounded-xl group cursor-pointer transition-all relative overflow-hidden",
                        isSelected ? "border-emerald-500/50 ring-1 ring-emerald-500/20 shadow-[0_0_20px_rgba(16,185,129,0.1)]" : "border-[#2d2e32] hover:border-[#424348]"
                      )}
                    >
                      {isSelected && (
                         <div className="absolute top-0 right-0 p-2 text-emerald-500">
                            <CheckCircle2 size={14} />
                         </div>
                      )}
                      
                      <div className="flex justify-between items-start mb-4">
                        <div className="min-w-0">
                          <h4 className="text-sm font-medium text-white flex items-center gap-2 group-hover:text-emerald-400 transition-colors truncate">
                            {repo.name}
                            <ExternalLink size={12} className="text-[#4a4b50]" />
                          </h4>
                          <div className="flex gap-2 mt-2">
                            {repo.tags.slice(0, 2).map((tag, j) => (
                              <span key={j} className="text-[9px] font-mono bg-[#1a1b1e] border border-[#2d2e32] px-1.5 py-0.5 rounded text-[#8E9299]">
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-xs font-mono text-[#8E9299]">{repo.stars.toLocaleString()}</div>
                          <div className="text-[10px] font-mono text-emerald-400">+{repo.growth}%</div>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-3 mb-4 mt-6 border-t border-[#1a1b1e] pt-4">
                        <div>
                          <div className="text-[8px] font-mono text-[#4a4b50] uppercase mb-1">Stack Spectrum</div>
                          <div className="text-[10px] text-[#A1A1AA] font-mono truncate">{repo.stack || 'ANALYST_PENDING'}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-[8px] font-mono text-[#4a4b50] uppercase mb-1">Functional Utility</div>
                          <div className="text-[10px] text-[#A1A1AA] font-mono truncate">{repo.utility || 'ANALYST_PENDING'}</div>
                        </div>
                        <div>
                          <div className="text-[8px] font-mono text-[#4a4b50] uppercase mb-1">Build Archetype</div>
                          <div className="text-[10px] text-[#A1A1AA] font-mono truncate">{repo.buildType || 'ANALYST_PENDING'}</div>
                        </div>
                      </div>

                      <div className="mt-4 p-2 bg-[#0a0a0c] rounded border border-[#2d2e32]/50 text-[9px] font-mono text-[#62646b] leading-relaxed">
                        <span className="text-emerald-500/80 mr-1 uppercase">Analysis:</span>
                        {repo.aiAnalysis}
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              {/* Floating Action Bar */}
              <AnimatePresence>
                {selectedRepos.length > 0 && (
                  <motion.div 
                    initial={{ y: 100, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 100, opacity: 0 }}
                    className="fixed bottom-12 left-1/2 -translate-x-1/2 z-[60] w-full max-w-2xl px-4"
                  >
                    <div className="bg-[#151619] border-2 border-emerald-500/30 p-4 rounded-2xl shadow-2xl shadow-emerald-500/20 flex flex-col md:flex-row items-center justify-between gap-4 backdrop-blur-xl">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-500">
                           <Zap size={20} />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-white uppercase tracking-widest">NEXUS_SYNTHESIS_ENGINE</p>
                          <p className="text-[10px] font-mono text-emerald-500/70">ORCHESTRATING {selectedRepos.length} REPOSITORIES</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <button 
                          onClick={() => setSelectedRepos([])}
                          className="px-4 py-2 text-[10px] font-mono text-[#8E9299] hover:text-white uppercase tracking-widest"
                        >
                          Cancel
                        </button>
                        <button 
                          id="btn-synthesize-action"
                          onClick={() => startPipeline(selectedRepos)}
                          disabled={activeRun?.status === 'running'}
                          className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-xl text-xs uppercase tracking-widest shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all flex items-center gap-2"
                        >
                          <Activity size={14} />
                          Synthesize & Build
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </main>
      </div>

      {/* Footer Branding */}
      <footer className="p-8 border-t border-[#1a1b1e] flex flex-col items-center gap-4 text-[#4a4b50] font-mono text-[10px]">
        <div className="flex gap-8">
          <span>LATENCY: 42MS</span>
          <span>UPTIME: 99.999%</span>
          <span>CLUSTER: US-EAST-5</span>
        </div>
        <p>© 2026 NEXUS ALPHA ANALYTICS ENGINE. ALL RIGHTS RESERVED.</p>
      </footer>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #2d2e32;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #4a4b50;
        }
      `}</style>
    </div>
  );
}

