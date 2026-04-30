import { execSync, exec as execCb } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { promisify } from 'util';
import { logger } from '../lib/logger';

const CTX = 'CodingAgentPackageManager';

const execAsync = promisify(execCb);

export interface InstallResult {
  success: boolean;
  stdout: string;
  stderr: string;
  duration: number;
  command: string;
}

export async function installDependencies(
  projectDir: string,
  options?: {
    packageManager?: 'npm' | 'yarn' | 'pnpm';
    timeout?: number;
    retries?: number;
  },
): Promise<InstallResult> {
  const pm = options?.packageManager || detectPackageManager(projectDir);
  const command = `${pm} install`;
  const start = Date.now();

  logger.info(CTX, `Installing dependencies with ${pm} in ${projectDir}`);

  for (let attempt = 1; attempt <= (options?.retries ?? 2); attempt++) {
    try {
      const startTime = Date.now();
      const stdout = execSync(command, {
        cwd: projectDir,
        timeout: options?.timeout ?? 120000,
        stdio: 'pipe',
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
      });
      const duration = Date.now() - startTime;

      logger.info(CTX, `Dependencies installed (${duration}ms)`);
      return { success: true, stdout, stderr: '', duration, command };
    } catch (err: unknown) {
      const isLastAttempt = attempt >= (options?.retries ?? 2);
      const msg = err instanceof Error ? err.message : String(err);

      logger.warn(CTX, `Install attempt ${attempt} failed`, { error: msg.slice(0, 200) });

      if (isLastAttempt) {
        const stderr = err instanceof Error ? err.stack || err.message : String(err);
        return {
          success: false,
          stdout: '',
          stderr,
          duration: Date.now() - start,
          command,
        };
      }

      await sleep(2000 * attempt);
    }
  }

  return {
    success: false,
    stdout: '',
    stderr: 'Exhausted retries',
    duration: Date.now() - start,
    command,
  };
}

export function detectPackageManager(projectDir: string): 'npm' | 'yarn' | 'pnpm' {
  if (existsSync(path.join(projectDir, 'yarn.lock'))) return 'yarn';
  if (existsSync(path.join(projectDir, 'pnpm-lock.yaml'))) return 'pnpm';
  return 'npm';
}

export function writePackageJson(
  projectDir: string,
  dependencies: Record<string, string>,
  devDependencies: Record<string, string>,
  scripts: Record<string, string>,
  name?: string,
): void {
  const pkgPath = path.join(projectDir, 'package.json');
  const existing = existsSync(pkgPath)
    ? JSON.parse(readFileSync(pkgPath, 'utf-8'))
    : {};

  const pkg = {
    ...existing,
    name: name || existing.name || 'my-app',
    private: true,
    version: '0.0.1',
    scripts: { ...existing.scripts, ...scripts },
    dependencies: { ...existing.dependencies, ...dependencies },
    devDependencies: { ...existing.devDependencies, ...devDependencies },
  };

  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), 'utf-8');
  logger.info(CTX, 'package.json written');
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
