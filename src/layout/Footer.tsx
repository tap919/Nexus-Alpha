import { useState, useEffect } from 'react';

export const Footer = ({ latency = 42 }: { latency?: number }) => {
  const [uptime, setUptime] = useState(99.999);

  useEffect(() => {
    const i = setInterval(() => {
      setUptime(prev => {
        const delta = (Math.random() * 0.002) - 0.001;
        return Math.min(100, Math.max(99.98, prev + delta));
      });
    }, 10000);
    return () => clearInterval(i);
  }, []);

  return (
    <footer className="p-8 border-t border-[#1a1b1e] flex flex-col items-center gap-4 text-[#4a4b50] font-mono text-[10px]">
      <div className="flex gap-8">
        <span>LATENCY: {latency}MS</span>
        <span>UPTIME: {uptime.toFixed(3)}%</span>
        <span>CLUSTER: US-EAST-5</span>
      </div>
      <p>© 2026 NEXUS ALPHA ANALYTICS ENGINE. ALL RIGHTS RESERVED.</p>
    </footer>
  );
};
