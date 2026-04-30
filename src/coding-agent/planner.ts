import { logger } from '../lib/logger';
import type { AppSpec, ArchitecturePlan, GeneratedFile, TechStack } from './types';
import { matchTemplate } from './templates/registry';
import { generateText, generateJson } from './llmClient';

const CTX = 'CodingAgentPlanner';

export async function generatePlan(spec: AppSpec): Promise<ArchitecturePlan> {
  logger.info(CTX, 'Planning architecture', { description: spec.description.slice(0, 80) });

  const template = matchTemplate(spec.description, spec.appType);
  const baseFiles = template.getFiles(spec.description);

  if (spec.appType === 'custom' && !spec.features?.length) {
    return buildBasicPlan(spec, template, baseFiles);
  }

  try {
    return await generateLLMPlan(spec, template, baseFiles);
  } catch (err) {
    logger.warn(CTX, 'LLM planning failed, using template', err);
    return buildBasicPlan(spec, template, baseFiles);
  }
}

async function generateLLMPlan(
  spec: AppSpec,
  template: { appType: string; name: string; defaultTechStack: Required<TechStack> },
  baseFiles: GeneratedFile[],
): Promise<ArchitecturePlan> {
  const prompt = `You are an expert software architect. Given this app description, generate a detailed architecture plan.

APP DESCRIPTION: "${spec.description}"
${spec.features?.length ? `FEATURES: ${spec.features.join(', ')}` : ''}
APP TYPE: ${spec.appType || 'custom'}

Respond with a JSON object containing:
1. "appType": the app type string
2. "techStack": { frontend: string, backend: string, database: string, css: string }
3. "files": array of { path: string, content: string } — ALL files needed for this app. Include package.json with correct dependencies, tsconfig, vite config, entry points, components, pages, API routes, etc.
4. "dependencies": object of npm dependencies
5. "devDependencies": object of npm dev dependencies
6. "scripts": object of npm scripts
7. "summary": one-line description of the architecture

IMPORTANT rules:
- Use Vite + React + TypeScript for frontend
- Use Express + TypeScript for backend if needed
- Use SQLite (better-sqlite3) if a database is needed
- Use Tailwind CSS for styling
- Every file must have complete, working code — no placeholders
- Prefer functional components with hooks
- Include proper TypeScript types
- Handle loading, error, and empty states in all components
- Use react-router-dom if multiple pages are needed
- Keep it simple but complete`;

  const plan = await generateJson<ArchitecturePlan>(prompt, { temperature: 0.2 });

  if (!plan.files?.length) {
    return buildBasicPlan(spec, template, baseFiles);
  }

  const defaultStack = template.defaultTechStack;
  return {
    appType: (plan.appType || spec.appType || 'custom') as ArchitecturePlan['appType'],
    techStack: {
      frontend: plan.techStack?.frontend || defaultStack.frontend,
      backend: plan.techStack?.backend || defaultStack.backend,
      database: plan.techStack?.database || defaultStack.database,
      css: plan.techStack?.css || defaultStack.css,
    },
    files: plan.files.map(f => ({
      path: f.path,
      content: f.content,
    })),
    dependencies: plan.dependencies || getDefaultDeps(plan.techStack),
    devDependencies: plan.devDependencies || getDefaultDevDeps(plan.techStack),
    scripts: plan.scripts || getDefaultScripts(plan.techStack),
    summary: plan.summary || `${spec.description} — built with ${template.defaultTechStack.frontend}`,
  };
}

function buildBasicPlan(
  spec: AppSpec,
  template: { appType: string; name: string; defaultTechStack: Required<TechStack> },
  baseFiles: GeneratedFile[],
): ArchitecturePlan {
  const deps = getDefaultDeps(template.defaultTechStack);
  const devDeps = getDefaultDevDeps(template.defaultTechStack);

  const allDeps = { ...deps };
  for (const [k, v] of Object.entries(devDeps)) {
    allDeps[k] = v;
  }

  const files = baseFiles.map(f => ({ ...f }));
  const existingPaths = new Set(files.map(f => f.path));

  const needsRouter = spec.description.toLowerCase().includes('router') ||
    spec.description.toLowerCase().includes('page') ||
    spec.description.toLowerCase().includes('navigation') ||
    spec.description.toLowerCase().includes('chat') ||
    spec.description.toLowerCase().includes('message') ||
    spec.description.toLowerCase().includes('messaging') ||
    spec.description.toLowerCase().includes('social') ||
    spec.description.toLowerCase().includes('profile') ||
    spec.description.toLowerCase().includes('community') ||
    spec.description.toLowerCase().includes('weather') ||
    spec.description.toLowerCase().includes('stock') ||
    spec.description.toLowerCase().includes('crypto') ||
    spec.description.toLowerCase().includes('price');
  const needsAuth = spec.description.toLowerCase().includes('auth') ||
    spec.description.toLowerCase().includes('login') ||
    spec.description.toLowerCase().includes('social') ||
    spec.description.toLowerCase().includes('profile') ||
    spec.description.toLowerCase().includes('community');
  const needsDb = spec.description.toLowerCase().includes('database') ||
    spec.description.toLowerCase().includes('crud') ||
    spec.description.toLowerCase().includes('note') ||
    spec.description.toLowerCase().includes('journal') ||
    spec.description.toLowerCase().includes('diary');

  const additionalFiles: GeneratedFile[] = [];

  if (needsRouter && !existingPaths.has('src/pages/Home.tsx') && template.defaultTechStack.frontend === 'react') {
    const content = `import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App'

function Router() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
      </Routes>
    </BrowserRouter>
  )
}

export default Router
`;
    additionalFiles.push({ path: 'src/Router.tsx', content });
  }

  if (needsAuth && template.defaultTechStack.frontend === 'react') {
    const authContent = `import { createContext, useContext, useState, type ReactNode } from 'react'

interface AuthContextType {
  user: string | null
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<string | null>(null)

  const login = async (email: string, password: string) => {
    if (!password || password.length < 4) throw new Error('Password too short')
    setUser(email)
  }

  const logout = () => setUser(null)

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
`;
    additionalFiles.push({ path: 'src/auth.tsx', content: authContent });
  }

  if (needsDb && template.defaultTechStack.backend === 'express' && !existingPaths.has('server/src/db.ts')) {
    const dbContent = `import Database from 'better-sqlite3'
import path from 'path'

const dbPath = path.resolve(process.cwd(), 'data.db')
const db = new Database(dbPath)

db.pragma('journal_mode = WAL')

export default db
`;
    additionalFiles.push({ path: 'server/src/db.ts', content: dbContent });
  }

  files.push(...additionalFiles);

  return {
    appType: (spec.appType || 'custom') as ArchitecturePlan['appType'],
    techStack: template.defaultTechStack,
    files,
    dependencies: deps,
    devDependencies: devDeps,
    scripts: getDefaultScripts(template.defaultTechStack),
    summary: `${spec.description} — ${template.name}`,
  };
}

function getDefaultDeps(stack: Partial<TechStack>): Record<string, string> {
  const deps: Record<string, string> = {};

  if (stack.frontend === 'react') {
    deps.react = '^19.0.0';
    deps['react-dom'] = '^19.0.0';
  }

  if (stack.backend === 'express') {
    deps.express = '^4.21.0';
    deps.cors = '^2.8.5';
  }

  if (stack.database === 'sqlite') {
    deps['better-sqlite3'] = '^11.0.0';
  }

  return deps;
}

function getDefaultDevDeps(stack: Partial<TechStack>): Record<string, string> {
  const deps: Record<string, string> = {
    typescript: '^5.7.0',
    '@types/node': '^22.0.0',
  };

  if (stack.frontend === 'react') {
    deps['@types/react'] = '^19.0.0';
    deps['@types/react-dom'] = '^19.0.0';
    deps['@vitejs/plugin-react'] = '^4.3.0';
    deps.vite = '^6.0.0';
  }

  if (stack.backend === 'express') {
    deps['@types/express'] = '^5.0.0';
    deps['@types/cors'] = '^2.8.17';
    deps.tsx = '^4.19.0';
  }

  return deps;
}

function getDefaultScripts(stack: Partial<TechStack>): Record<string, string> {
  if (stack.backend === 'express') {
    return {
      dev: 'tsx watch src/index.ts',
      build: 'tsc',
      start: 'node dist/index.js',
    };
  }

  return {
    dev: 'vite',
    build: 'tsc -b && vite build',
    preview: 'vite preview',
  };
}
