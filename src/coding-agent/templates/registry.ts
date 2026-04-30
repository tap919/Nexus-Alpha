import type { AppType, TechStack, GeneratedFile } from '../types';
import { getReactTsViteTemplate } from './react-ts-vite';
import { getExpressApiTemplate } from './express-api';
import { getFullstackTemplate } from './fullstack';
import { getReactTsViteTailwindTemplate } from './react-ts-vite-tailwind';
import { getSupabaseFullstackTemplate } from './supabase-fullstack';
import { getMcpToolkitTemplate } from './mcp-toolkit';

export interface TemplateDefinition {
  appType: AppType;
  name: string;
  description: string;
  defaultTechStack: Required<TechStack>;
  getFiles: (projectName: string) => GeneratedFile[];
}

const TEMPLATES: TemplateDefinition[] = [
  {
    appType: 'landing-page',
    name: 'React + TypeScript + Vite',
    description: 'Single-page landing page with React',
    defaultTechStack: { frontend: 'react', backend: 'none', database: 'none', css: 'tailwind' },
    getFiles: getReactTsViteTemplate,
  },
  {
    appType: 'todo',
    name: 'React + TypeScript + Vite',
    description: 'Todo application with React',
    defaultTechStack: { frontend: 'react', backend: 'none', database: 'none', css: 'tailwind' },
    getFiles: getReactTsViteTemplate,
  },
  {
    appType: 'dashboard',
    name: 'React + TypeScript + Vite',
    description: 'Dashboard with React and chart libraries',
    defaultTechStack: { frontend: 'react', backend: 'none', database: 'none', css: 'tailwind' },
    getFiles: getReactTsViteTemplate,
  },
  {
    appType: 'blog',
    name: 'React + TypeScript + Vite',
    description: 'Blog with React and React Router',
    defaultTechStack: { frontend: 'react', backend: 'none', database: 'none', css: 'tailwind' },
    getFiles: getReactTsViteTemplate,
  },
  {
    appType: 'api',
    name: 'Express + TypeScript API',
    description: 'REST API with Express and TypeScript',
    defaultTechStack: { frontend: 'vanilla', backend: 'express', database: 'none', css: 'css' },
    getFiles: getExpressApiTemplate,
  },
  {
    appType: 'saas',
    name: 'Fullstack React + Express',
    description: 'Full-stack SaaS with React frontend and Express backend',
    defaultTechStack: { frontend: 'react', backend: 'express', database: 'sqlite', css: 'tailwind' },
    getFiles: getFullstackTemplate,
  },
  {
    appType: 'ecommerce',
    name: 'Fullstack React + Express',
    description: 'E-commerce with React frontend and Express backend',
    defaultTechStack: { frontend: 'react', backend: 'express', database: 'sqlite', css: 'tailwind' },
    getFiles: getFullstackTemplate,
  },
  {
    appType: 'custom',
    name: 'React + TypeScript + Vite',
    description: 'Custom application with React',
    defaultTechStack: { frontend: 'react', backend: 'none', database: 'none', css: 'tailwind' },
    getFiles: getReactTsViteTemplate,
  },
  {
    appType: 'dashboard',
    name: 'React + Tailwind + Router',
    description: 'Enhanced React app with Tailwind CSS, React Router, and layout components',
    defaultTechStack: { frontend: 'react', backend: 'none', database: 'none', css: 'tailwind' },
    getFiles: getReactTsViteTailwindTemplate,
  },
  {
    appType: 'saas',
    name: 'Supabase Fullstack',
    description: 'Full-stack SaaS with React, Express, Supabase auth, and protected routes',
    defaultTechStack: { frontend: 'react', backend: 'express', database: 'postgres', css: 'tailwind' },
    getFiles: getSupabaseFullstackTemplate,
  },
  {
    appType: 'custom',
    name: 'MCP Toolkit',
    description: 'MCP server template with TypeScript, stdio transport, and example tools',
    defaultTechStack: { frontend: 'vanilla', backend: 'none', database: 'none', css: 'css' },
    getFiles: getMcpToolkitTemplate,
  },
];

export function getTemplateForAppType(appType: AppType): TemplateDefinition | undefined {
  return TEMPLATES.find(t => t.appType === appType);
}

export function matchTemplate(description: string, appType?: AppType): TemplateDefinition {
  if (appType) {
    const t = getTemplateForAppType(appType);
    if (t) return t;
  }

  const lower = description.toLowerCase();

  if (lower.includes('mcp') || lower.includes('ai agent') || (lower.includes('tool') && lower.includes('server'))) {
    return TEMPLATES.find(t => t.name === 'MCP Toolkit')!;
  }
  if (lower.includes('supabase') || lower.includes('auth') || lower.includes('login') || lower.includes('users')) {
    return TEMPLATES.find(t => t.name === 'Supabase Fullstack')!;
  }
  if (lower.includes('tailwind') || lower.includes('stylish') || lower.includes('beautiful') || lower.includes('modern')) {
    return TEMPLATES.find(t => t.name === 'React + Tailwind + Router')!;
  }

  if (lower.includes('api') || lower.includes('backend') || lower.includes('server')) {
    return TEMPLATES.find(t => t.appType === 'api')!;
  }
  if (lower.includes('saas') || lower.includes('fullstack')) {
    return TEMPLATES.find(t => t.appType === 'saas')!;
  }
  if (lower.includes('ecommerce') || lower.includes('shop') || lower.includes('store')) {
    return TEMPLATES.find(t => t.appType === 'ecommerce')!;
  }
  if (lower.includes('blog') || lower.includes('cms') || lower.includes('post')) {
    return TEMPLATES.find(t => t.appType === 'blog')!;
  }
  if (lower.includes('dashboard') || lower.includes('analytics') || lower.includes('chart')) {
    return TEMPLATES.find(t => t.appType === 'dashboard')!;
  }
  if (lower.includes('todo') || lower.includes('task')) {
    return TEMPLATES.find(t => t.appType === 'todo')!;
  }
  if (lower.includes('landing') || lower.includes('page') || lower.includes('website')) {
    return TEMPLATES.find(t => t.appType === 'landing-page')!;
  }

  return TEMPLATES.find(t => t.appType === 'custom')!;
}
