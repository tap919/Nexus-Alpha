import React, { useEffect, useState } from 'react';
import { Shield, Search, FileText, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import { SectionHeader } from '../components/SectionHeader';

interface AuditEntry {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  target: string;
  metadata: any;
  status: 'success' | 'failure' | 'warning';
}

export const AuditTab: React.FC = () => {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  const fetchLogs = async () => {
    try {
      const resp = await fetch('/api/audit/logs');
      if (resp.ok) {
        const data = await resp.json();
        setLogs(data.reverse());
      }
    } catch (err) {
      console.error('Failed to fetch audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    const timer = setInterval(fetchLogs, 5000);
    return () => clearInterval(timer);
  }, []);

  const filteredLogs = logs.filter(l => 
    l.action.toLowerCase().includes(filter.toLowerCase()) ||
    l.target.toLowerCase().includes(filter.toLowerCase()) ||
    l.actor.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <SectionHeader title="System Audit Log" icon={Shield} />
      <p className="text-[#4a4b50] text-xs font-mono mt-2 mb-8 uppercase tracking-widest">
        Immutable record of all agent actions, permission checks, and pipeline executions
      </p>

      <div className="mb-6 relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#4a4b50]">
          <Search size={14} />
        </div>
        <input
          type="text"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Filter audit entries..."
          className="w-full bg-[#0a0a0c] border border-[#2d2e32] rounded-xl pl-10 pr-4 py-3 text-white text-xs font-mono placeholder-[#4a4b50] outline-none focus:border-purple-500/50 transition-colors"
        />
      </div>

      <div className="bg-[#0a0a0c] border border-[#1a1b1e] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#151619] border-b border-[#2d2e32]">
                <th className="px-4 py-3 text-[10px] font-mono text-[#4a4b50] uppercase tracking-wider">Timestamp</th>
                <th className="px-4 py-3 text-[10px] font-mono text-[#4a4b50] uppercase tracking-wider">Actor</th>
                <th className="px-4 py-3 text-[10px] font-mono text-[#4a4b50] uppercase tracking-wider">Action</th>
                <th className="px-4 py-3 text-[10px] font-mono text-[#4a4b50] uppercase tracking-wider">Target</th>
                <th className="px-4 py-3 text-[10px] font-mono text-[#4a4b50] uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1a1b1e]">
              {filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-white/[0.02] transition-colors group">
                  <td className="px-4 py-3 text-[10px] font-mono text-white/40">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-[10px] font-mono text-white/60 bg-white/5 px-2 py-0.5 rounded">
                      {log.actor}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[10px] font-mono text-purple-400 font-bold uppercase">
                    {log.action}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-[10px] font-mono text-white/80 truncate max-w-md" title={log.target}>
                      {log.target}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {log.status === 'success' && <CheckCircle size={12} className="text-emerald-500" />}
                      {log.status === 'warning' && <AlertTriangle size={12} className="text-amber-500" />}
                      {log.status === 'failure' && <AlertTriangle size={12} className="text-red-500" />}
                      <span className={`text-[10px] font-mono uppercase ${
                        log.status === 'success' ? 'text-emerald-500' : 
                        log.status === 'warning' ? 'text-amber-500' : 'text-red-500'
                      }`}>
                        {log.status}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredLogs.length === 0 && !loading && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-[#4a4b50] text-xs font-mono">
                    No audit entries found matching your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
