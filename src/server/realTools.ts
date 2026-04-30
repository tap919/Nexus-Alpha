// Lightweight real tool runner for Nexus Alpha server
// This module exposes simple, safe commands that can be executed on the host
// to perform real operations (e.g., real build, real npm audit).

import { exec } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';

export interface ShellResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

// Run a shell command with optional cwd and timeout
export async function runShellCommand(
  command: string,
  cwd?: string,
  timeoutMs: number = 60000
): Promise<ShellResult> {
  const options: any = { cwd: cwd ?? process.cwd(), timeout: timeoutMs };
  // Use exec to get stdout/stderr and exit code
  return new Promise<ShellResult>((resolve) => {
    const child = exec(command, options, (error: any, stdout: string, stderr: string) => {
      const code = error ? (typeof error.code === 'number' ? error.code : 1) : 0;
      resolve({ stdout, stderr, code });
    });
    // Optional: pipe child.stdout/err if future streaming is needed
  });
}

// Real build command for the Nexus Alpha repo root
export async function runBuildCommand(): Promise<ShellResult> {
  // Try to detect a typical build script in package.json. If not present, attempt standard vite build.
  const repoRoot = process.cwd();
  // Ensure dependencies are installed before building
  try {
    if (existsSync(path.resolve(repoRoot, 'package-lock.json'))) {
      await runShellCommand('npm ci', repoRoot, 120000);
    } else if (existsSync(path.resolve(repoRoot, 'package.json'))) {
      await runShellCommand('npm install', repoRoot, 120000);
    }
  } catch {
    // If install fails (e.g., network), proceed to attempt build anyway
  }
  // We simply attempt a plain 'npm run build' first; if that fails, fall back to 'vite build'
  try {
    return await runShellCommand('npm run build', repoRoot, 120000);
  } catch {
    return await runShellCommand('vite build', repoRoot, 120000);
  }
}

// Real npm audit command
export async function runAuditCommand(): Promise<ShellResult> {
  // Run npm audit in json mode for machine parsing
  return await runShellCommand('npm audit --json', process.cwd(), 60000);
}

// Real lint command: try npm script then fall back to tsc
export async function runLintCommand(): Promise<ShellResult> {
  try {
    // Prefer npm script if available
    return await runShellCommand('npm run lint', process.cwd(), 60000);
  } catch {
    // Fallback to TypeScript lint
    return await runShellCommand('tsc --noEmit', process.cwd(), 60000);
  }
}

// Real tests command: run the repository's test suite
export async function runTestsCommand(): Promise<ShellResult> {
  // Use npm test to leverage existing scripts (Playwright in this repo)
  return await runShellCommand('npm test', process.cwd(), 600000);
}
