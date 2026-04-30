import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { FileDiff, Check, X, Code, Send } from 'lucide-react';

interface FileChange {
  id: string;
  filePath: string;
  originalContent: string;
  newContent: string;
  status: 'pending' | 'accepted' | 'rejected';
}

const MOCK_CHANGES: FileChange[] = [
  {
    id: '1',
    filePath: 'src/components/App.tsx',
    originalContent: 'function App() {\n  return <div>Hello</div>;\n}',
    newContent: 'function App() {\n  return <main className="flex">Hello World</main>;\n}',
    status: 'pending'
  },
  {
    id: '2',
    filePath: 'src/utils/api.ts',
    originalContent: 'export const get = (url) => fetch(url);',
    newContent: 'export const get = async (url: string) => {\n  const res = await fetch(url);\n  return res.json();\n};',
    status: 'pending'
  }
];

export const ComposerTab = () => {
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [changes, setChanges] = useState<FileChange[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setIsGenerating(true);
    setError(null);
    try {
      const response = await fetch('/api/composer/generate', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-api-key': 'nexus-alpha-dev-key'
        },
        body: JSON.stringify({ prompt }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (data.success) {
        setChanges(data.changes);
      } else {
        setError(data.error || 'Generation failed');
      }
    } catch (err) {
      console.error('Composer Error:', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAccept = async (id: string) => {
    const change = changes.find(c => c.id === id);
    if (!change) return;

    try {
      const response = await fetch('/api/composer/apply', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-api-key': 'nexus-alpha-dev-key'
        },
        body: JSON.stringify({ filePath: change.filePath, content: change.newContent }),
      });
      const data = await response.json();
      if (data.success) {
        setChanges(prev => prev.map(c => c.id === id ? { ...c, status: 'accepted' } : c));
      }
    } catch (err) {
      console.error('Apply Error:', err);
    }
  };

  const handleReject = (id: string) => {
    setChanges(prev => prev.map(c => c.id === id ? { ...c, status: 'rejected' } : c));
  };

  return (
    <div className="flex flex-col h-[calc(100vh-180px)] p-6 space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <FileDiff className="w-8 h-8 text-indigo-400" />
        <div>
          <h2 className="text-2xl font-bold font-mono text-white">Composer</h2>
          <p className="text-sm text-gray-400">Multi-Agent Code Synthesis & Diff Engine</p>
        </div>
      </div>

      <div className="relative">
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder="Describe the multi-file changes you want to make..."
          className="w-full h-32 bg-[#1A1A1A] border border-gray-700 rounded-xl p-4 text-white font-mono text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 resize-none"
        />
        <button
          onClick={handleGenerate}
          disabled={!prompt.trim() || isGenerating}
          className="absolute bottom-4 right-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white font-mono text-sm flex items-center gap-2 transition-colors"
        >
          {isGenerating ? 'Synthesizing...' : 'Generate Changes'}
          <Send className="w-4 h-4" />
        </button>
      </div>

      {error && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-xs font-mono"
        >
          {error}
        </motion.div>
      )}

      <div className="flex-1 overflow-y-auto space-y-6">
        <AnimatePresence>
          {changes.map(change => (
            <motion.div
              key={change.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={`border rounded-xl overflow-hidden ${change.status === 'accepted' ? 'border-green-500/50' : change.status === 'rejected' ? 'border-red-500/50' : 'border-gray-700'}`}
            >
              <div className="flex justify-between items-center bg-[#1A1A1A] p-3 border-b border-gray-700">
                <div className="flex items-center gap-2">
                  <Code className="w-4 h-4 text-gray-400" />
                  <span className="font-mono text-sm text-gray-300">{change.filePath}</span>
                </div>
                {change.status === 'pending' && (
                  <div className="flex items-center gap-2">
                    <button onClick={() => handleReject(change.id)} className="p-1.5 text-red-400 hover:bg-red-400/10 rounded-md transition-colors"><X className="w-4 h-4" /></button>
                    <button onClick={() => handleAccept(change.id)} className="p-1.5 text-green-400 hover:bg-green-400/10 rounded-md transition-colors"><Check className="w-4 h-4" /></button>
                  </div>
                )}
                {change.status !== 'pending' && (
                  <span className={`text-xs font-mono px-2 py-1 rounded-full ${change.status === 'accepted' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                    {change.status.toUpperCase()}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 divide-x divide-gray-700 bg-[#0F0F11]">
                <div className="p-4 overflow-x-auto">
                  <pre className="text-xs font-mono text-red-300/80"><code>{change.originalContent}</code></pre>
                </div>
                <div className="p-4 overflow-x-auto bg-green-950/10">
                  <pre className="text-xs font-mono text-green-300"><code>{change.newContent}</code></pre>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
};
