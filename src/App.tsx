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
  MessageSquare
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
import { DashboardData, PredictionData, NewsItem, RepoTrend, OpenSourceStat, TrendingTool, VideoItem, BuildStep } from "./types";
import { cn } from "./lib/utils";

// --- Components ---

const NexusBrowser = () => {
  const [url, setUrl] = useState("https://nexus.alpha/agent/terminal");
  const [history, setHistory] = useState<string[]>([
    "[SYSTEM] Agent initialized in isolated sandbox.",
    "[SCAN] Analyzing local environment...",
    "[STATUS] Ready for cross-origin browsing."
  ]);

  return (
    <div className="flex flex-col h-full bg-[#0a0a0c] border border-[#2d2e32] rounded-xl overflow-hidden">
      <div className="h-10 bg-[#151619] border-b border-[#2d2e32] flex items-center px-4 gap-4">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-rose-500/50" />
          <div className="w-2.5 h-2.5 rounded-full bg-amber-500/50" />
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/50" />
        </div>
        <div className="flex-1 bg-[#0a0a0c] rounded px-3 py-1 text-[10px] font-mono text-[#8E9299] border border-[#2d2e32] shadow-inner">
          {url}
        </div>
      </div>
      <div className="flex-1 p-6 font-mono text-xs overflow-y-auto custom-scrollbar">
        <div className="space-y-2">
          {history.map((line, i) => (
            <div key={i} className={cn(
              line.startsWith("[") ? "text-emerald-500" : "text-[#8E9299]"
            )}>
              {line}
            </div>
          ))}
          <div className="flex gap-2 text-white">
            <span className="text-emerald-500">nexus@alpha:~ $</span>
            <motion.span 
              animate={{ opacity: [1, 0, 1] }} 
              transition={{ repeat: Infinity, duration: 1 }}
              className="w-1.5 h-4 bg-emerald-500 inline-block align-middle"
            />
          </div>
        </div>
      </div>
      <div className="p-4 border-t border-[#2d2e32] bg-[#151619]/50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#8E9299]">Agent Active: Web Research Subsystem</span>
        </div>
        <button className="text-[10px] font-mono uppercase text-emerald-400 hover:underline">Deploy to Cluster</button>
      </div>
    </div>
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

const YouTubePulse = ({ videos }: { videos: VideoItem[] }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
    {videos.map((video, i) => (
      <motion.div 
        key={i}
        whileHover={{ y: -4 }}
        className="bg-[#151619] border border-[#2d2e32] rounded-xl overflow-hidden group"
      >
        <div className="aspect-video bg-[#0a0a0c] relative">
          <img src={video.thumbnail} alt={video.title} className="w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity" />
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40">
            <div className="w-12 h-12 rounded-full border border-white/20 flex items-center justify-center bg-black/60 shadow-xl">
              <Zap size={24} fill="white" />
            </div>
          </div>
          <div className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/80 rounded text-[9px] font-mono uppercase text-white">4K SCAN</div>
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

const SectionHeader = ({ title, icon: Icon }: { title: string, icon: any }) => (
  <div className="flex items-center gap-2 mb-6 border-b border-[#2d2e32] pb-2">
    <Icon size={16} className="text-[#8E9299]" />
    <h2 className="text-sm font-mono uppercase tracking-[0.2em] text-[#8E9299]">{title}</h2>
  </div>
);

const NewsCard = ({ item }: { item: NewsItem, key?: React.Key }) => (
  <div className="group border-b border-[#2d2e32] py-4 last:border-0 hover:bg-[#1a1b1e] transition-colors px-2 -mx-2 rounded-md">
    <div className="flex justify-between items-start mb-1">
      <span className="text-[10px] font-mono text-[#4a4b50] uppercase">{item.source} • {item.timestamp}</span>
      <div className={cn(
        "w-2 h-2 rounded-full",
        item.sentiment === 'positive' ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" :
        item.sentiment === 'negative' ? "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]" : "bg-[#4a4b50]"
      )} />
    </div>
    <h4 className="text-sm text-white font-medium group-hover:text-emerald-400 transition-colors cursor-pointer">{item.title}</h4>
    <p className="text-xs text-[#8E9299] mt-2 line-clamp-2">{item.summary}</p>
  </div>
);

const PredictionRow = ({ prediction }: { prediction: PredictionData, key?: React.Key }) => (
  <div className="grid grid-cols-[1fr,100px,100px,80px] gap-4 py-4 border-b border-[#2d2e32] items-center group">
    <div>
      <h4 className="text-sm text-white font-medium">{prediction.category}</h4>
      <p className={cn(
        "text-[10px] font-mono uppercase tracking-wider mt-1",
        prediction.impact === 'High' ? "text-rose-400" :
        prediction.impact === 'Medium' ? "text-amber-400" : "text-emerald-400"
      )}>Impact: {prediction.impact}</p>
    </div>
    <div className="text-xs font-mono text-[#8E9299]">{prediction.currentValue}%</div>
    <div className="text-xs font-mono text-emerald-400">+{prediction.growth}%</div>
    <div className="flex justify-end">
      <div className="w-full h-1 bg-[#2d2e32] rounded-full relative overflow-hidden">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${prediction.predictedValue}%` }}
          className="absolute inset-y-0 left-0 bg-emerald-500"
        />
      </div>
    </div>
  </div>
);

// --- Main App ---

export default function App() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("Overview");

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
        <aside className="w-20 lg:w-64 border-r border-[#1a1b1e] min-h-[calc(100vh-64px)] hidden md:block">
          <nav className="p-4 flex flex-col gap-2">
            {navItems.map((item, i) => (
              <button 
                key={i}
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
        </aside>

        {/* Main Dashboard */}
        <main className="flex-1 p-8 overflow-y-auto">
          {activeTab === "Overview" && (
            <>
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
                  title="Deployed Models" 
                  value={(data?.totalModels || 0).toLocaleString()} 
                  icon={Box} 
                />
                <StatCard 
                  title="Sentiment Pulse" 
                  value={(data?.sentimentScore || 0).toFixed(2)} 
                  unit="/ 1.0" 
                  icon={Activity} 
                  trend="BULLISH"
                />
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
                    <SectionHeader title="Open Source Intelligence" icon={Globe} />
                    <OpenSourceWidget stats={data?.openSourceStats || []} />
                  </section>

                  <section>
                    <SectionHeader title="API Signal Stream" icon={Activity} />
                    <div className="bg-[#151619] border border-[#2d2e32] rounded-xl p-4 font-mono text-[10px] space-y-2">
                      {[
                        { time: "20:38:12", source: "GITHUB_V3", signal: "PULL_REQUEST_SPIKE", load: "0.12ms" },
                        { time: "20:38:05", source: "REDDIT_ML", signal: "SENTIMENT_SHIFT", sentiment: "BULLISH" },
                        { time: "20:37:58", source: "ARXIV_FEED", signal: "NEW_PAPER_DETECTED", count: "12" }
                      ].map((sig, i) => (
                        <div key={i} className="flex justify-between items-center py-1 border-b border-[#1a1b1e] last:border-0">
                          <div className="flex gap-4">
                            <span className="text-[#4a4b50]">{sig.time}</span>
                            <span className="text-emerald-500">[{sig.source}]</span>
                            <span className="text-[#8E9299]">{sig.signal}</span>
                          </div>
                          <span className="text-emerald-500/50">{sig.load || sig.sentiment || sig.count}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>

                {/* Right: Analysis Feed */}
                <div className="space-y-8">
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

          {activeTab === "Nexus Browser" && (
            <div className="h-[calc(100vh-160px)]">
              <SectionHeader title="Agentic Browsing Interface" icon={Search} />
              <NexusBrowser />
            </div>
          )}

          {activeTab === "Pipeline" && (
            <div className="max-w-3xl">
              <SectionHeader title="Build & Deployment Pipeline" icon={Activity} />
              <PipelineVisualizer steps={data?.buildPipeline || []} />
            </div>
          )}

          {activeTab === "YouTube Pulse" && (
            <div className="space-y-8">
              <SectionHeader title="Nexus Video Scan" icon={Zap} />
              <YouTubePulse videos={data?.videos || []} />
            </div>
          )}

          {activeTab === "Repo Analysis" && (
            <div className="space-y-8">
              <div className="flex justify-between items-center">
                <SectionHeader title="Trending Repositories" icon={Github} />
                <div className="flex items-center gap-2 px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded text-[9px] font-mono text-emerald-400">
                  <RefreshCcw size={10} className="animate-spin" />
                  REAL-TIME POLLING: ACTIVE
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {data?.repos.map((repo, i) => (
                  <motion.div 
                    key={i}
                    whileHover={{ scale: 1.02 }}
                    className="bg-[#151619] border border-[#2d2e32] p-4 rounded-xl flex justify-between items-start"
                  >
                    <div>
                      <h4 className="text-sm font-medium text-white flex items-center gap-2">
                        {repo.name}
                        <ExternalLink size={12} className="text-[#4a4b50]" />
                      </h4>
                      <div className="flex gap-2 mt-2">
                        {repo.tags.map((tag, j) => (
                          <span key={j} className="text-[9px] font-mono bg-[#1a1b1e] border border-[#2d2e32] px-1.5 py-0.5 rounded text-[#8E9299]">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-mono text-[#8E9299]">{repo.stars.toLocaleString()}</div>
                      <div className="text-[10px] font-mono text-emerald-400">+{repo.growth}%</div>
                    </div>
                  </motion.div>
                ))}
              </div>
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

