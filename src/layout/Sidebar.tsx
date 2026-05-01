import { useState, type ElementType } from 'react';
import { Sparkles, BarChart3, Terminal, Activity, Zap, History, Settings, ChevronDown, ChevronRight, LayoutDashboard, Workflow, Shield } from 'lucide-react';
import { cn } from '../lib/utils';
import { SystemManifest } from './SystemManifest';

export type TabName = 'Composer' | 'Overview' | 'Command Center' | 'Pipeline' | 'Settings' | 'Activity' | 'History' | 'Audit';

const PRIMARY_ITEMS: { icon: ElementType; label: TabName }[] = [
  { icon: Sparkles, label: 'Composer' },
];

const ADVANCED_ITEMS: { icon: ElementType; label: TabName }[] = [
  { icon: BarChart3, label: 'Overview' },
  { icon: Activity, label: 'Pipeline' },
  { icon: Zap, label: 'Activity' },
  { icon: History, label: 'History' },
  { icon: Shield, label: 'Audit' },
  { icon: Terminal, label: 'Command Center' },
  { icon: Settings, label: 'Settings' },
];

interface SidebarProps {
  activeTab: TabName;
  onTabChange: (tab: TabName) => void;
}

export const Sidebar = ({ activeTab, onTabChange }: SidebarProps) => {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  return (
    <aside className="w-20 lg:w-64 border-r border-[#1a1b1e] min-h-[calc(100vh-64px)] hidden md:flex flex-col">
      <nav className="p-4 flex flex-col gap-1 flex-1">
        {PRIMARY_ITEMS.map((item) => (
          <button
            key={item.label}
            id={`nav-item-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
            aria-label={item.label}
            aria-current={activeTab === item.label ? 'page' : undefined}
            onClick={() => onTabChange(item.label)}
            className={cn(
              'flex items-center gap-3 p-3 rounded-lg transition-all group focus-visible:ring-2 focus-visible:ring-emerald-500/50',
              activeTab === item.label
                ? 'bg-emerald-500/10 text-emerald-400'
                : 'text-[#9CA3AF] hover:bg-[#151619] hover:text-white',
            )}
          >
            <item.icon size={20} />
            <span className="text-sm font-medium hidden lg:block">{item.label}</span>
          </button>
        ))}

        <button
          aria-label={advancedOpen ? 'Collapse advanced menu' : 'Expand advanced menu'}
          aria-expanded={advancedOpen}
          onClick={() => setAdvancedOpen(!advancedOpen)}
          className={cn(
            'flex items-center gap-3 p-3 rounded-lg transition-all group mt-2 text-[#6B7280] hover:text-[#9CA3AF] hover:bg-[#151619] focus-visible:ring-2 focus-visible:ring-emerald-500/50',
          )}
        >
          {advancedOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <span className="text-[10px] font-mono uppercase tracking-[0.2em] hidden lg:block">Advanced</span>
        </button>

        {advancedOpen && ADVANCED_ITEMS.map((item) => (
          <button
            key={item.label}
            id={`nav-item-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
            aria-label={item.label}
            aria-current={activeTab === item.label ? 'page' : undefined}
            onClick={() => onTabChange(item.label)}
            className={cn(
              'flex items-center gap-3 p-3 rounded-lg transition-all group focus-visible:ring-2 focus-visible:ring-emerald-500/50',
              activeTab === item.label
                ? 'bg-emerald-500/10 text-emerald-400'
                : 'text-[#9CA3AF] hover:bg-[#151619] hover:text-white',
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
  );
};
