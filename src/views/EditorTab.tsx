import { useState } from 'react';
import { motion } from 'motion/react';
import { CodeEditor } from '../components/CodeEditor';
import { FileCode, FolderOpen, Plus, Search, Settings, X } from 'lucide-react';

interface FileTab {
  id: string;
  name: string;
  language: string;
  content: string;
}

const defaultFiles: FileTab[] = [
  { id: '1', name: 'main.ts', language: 'typescript', content: `// Welcome to Nexus Alpha Editor\n// Start building your application\n\nfunction greet(name: string): string {\n  return \`Hello, \${name}!\`;\n}\n\nconsole.log(greet('Developer'));` },
  { id: '2', name: 'utils.ts', language: 'typescript', content: `export function formatDate(date: Date): string {\n  return date.toLocaleDateString('en-US', {\n    year: 'numeric',\n    month: 'long',\n    day: 'numeric'\n  });\n}` },
];

export default function EditorTab() {
  const [files, setFiles] = useState<FileTab[]>(defaultFiles);
  const [activeFileId, setActiveFileId] = useState('1');

  const activeFile = files.find(f => f.id === activeFileId);

  const handleSave = (content: string) => {
    setFiles(files.map(f => f.id === activeFileId ? { ...f, content } : f));
    console.log('File saved:', activeFile?.name);
  };

  return (
    <div className="flex h-full">
      <div className="w-48 border-r border-gray-800 bg-[#1a1a1a] flex flex-col">
        <div className="p-3 border-b border-gray-800">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Explorer</span>
            <button className="p-1 hover:bg-gray-800 rounded text-gray-500 hover:text-white">
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <div className="relative">
            <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
            <input 
              type="text" 
              placeholder="Search files..."
              className="w-full bg-[#252526] text-sm text-gray-300 pl-7 pr-2 py-1 rounded border border-transparent focus:border-indigo-500/50 outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          <div className="flex items-center gap-1 text-gray-400 text-sm mb-2 px-1">
            <FolderOpen className="w-4 h-4" />
            <span>src</span>
          </div>
          {files.map(file => (
            <button
              key={file.id}
              onClick={() => setActiveFileId(file.id)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left transition-colors ${
                activeFileId === file.id 
                  ? 'bg-indigo-500/20 text-indigo-300' 
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`}
            >
              <FileCode className="w-4 h-4" />
              {file.name}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center bg-[#1a1a1a] border-b border-gray-800 overflow-x">
          {files.map(file => (
            <div 
              key={file.id}
              className={`flex items-center gap-2 px-3 py-2 border-r border-gray-800 cursor-pointer transition-colors ${
                activeFileId === file.id 
                  ? 'bg-[#1e1e1e] text-white' 
                  : 'text-gray-400 hover:bg-[#252526] hover:text-white'
              }`}
              onClick={() => setActiveFileId(file.id)}
            >
              <FileCode className="w-4 h-4" />
              <span className="text-sm">{file.name}</span>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setFiles(files.filter(f => f.id !== file.id));
                  if (activeFileId === file.id && files.length > 1) {
                    setActiveFileId(files.find(f => f.id !== file.id)?.id || '');
                  }
                }}
                className="p-0.5 hover:bg-gray-700 rounded opacity-60 hover:opacity-100"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>

        <div className="flex-1 min-h-0 p-4 bg-[#1e1e1e]">
          {activeFile && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="h-full"
            >
              <CodeEditor
                initialValue={activeFile.content}
                language={activeFile.language}
                onSave={handleSave}
              />
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
