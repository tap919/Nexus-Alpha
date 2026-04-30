import { execSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import { logger } from '../lib/logger';
import type { BuildError, BuildResult } from './types';
import { detectPackageManager } from './packageManager';

const CTX = 'CodingAgentBuildRunner';

export async function runBuild(
  projectDir: string,
  options?: {
    command?: string;
    timeout?: number;
  },
): Promise<BuildResult> {
  const start = Date.now();
  const pm = detectPackageManager(projectDir);
  const buildCommand = options?.command || `${pm} run build`;
  const outputPath = findOutputDir(projectDir);

  logger.info(CTX, `Running build: ${buildCommand} in ${projectDir}`);

  try {
    const stdout = execSync(buildCommand, {
      cwd: projectDir,
      timeout: options?.timeout ?? 120000,
      stdio: 'pipe',
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
    });

    const duration = Date.now() - start;
    logger.info(CTX, `Build succeeded (${duration}ms)`);

    return {
      success: true,
      outputPath,
      duration,
      errors: [],
      warnings: extractWarnings(stdout),
    };
  } catch (err: unknown) {
    const duration = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    const stderr = err instanceof Error ? err.stack || err.message : String(err);

    logger.warn(CTX, `Build failed (${duration}ms)`, { error: msg.slice(0, 200) });

    const buildError: BuildError = {
      command: buildCommand,
      exitCode: err && typeof err === 'object' && 'status' in err ? (err as any).status as number : null,
      stdout: '',
      stderr,
    };

    const errors = parseBuildErrors(stderr, buildError);

    return {
      success: false,
      outputPath,
      duration,
      errors,
      warnings: extractWarnings(stderr),
    };
  }
}

function findOutputDir(projectDir: string): string {
  const candidates = ['dist', 'build', 'out', '.next'];
  for (const dir of candidates) {
    const full = path.join(projectDir, dir);
    if (existsSync(full)) return full;
  }
  return path.join(projectDir, 'dist');
}

function extractWarnings(output: string): string[] {
  const warnings: string[] = [];
  for (const line of output.split('\n')) {
    if (line.toLowerCase().includes('warning') || line.includes('⚠')) {
      warnings.push(line.trim());
    }
  }
  return warnings.slice(0, 20);
}

function parseBuildErrors(stderr: string, fallback: BuildError): BuildError[] {
  const errors: BuildError[] = [];
  const lines = stderr.split('\n');

  let current: Partial<BuildError> | null = null;

  for (const line of lines) {
    const tsMatch = line.match(/^(.+)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.+)$/);
    if (tsMatch) {
      if (current) errors.push(current as BuildError);
      current = {
        command: 'tsc',
        exitCode: 1,
        stdout: '',
        stderr: line,
      };
      continue;
    }

    if (line.includes('Error:') || line.includes('ERROR')) {
      if (current) errors.push(current as BuildError);
      current = {
        command: fallback.command,
        exitCode: fallback.exitCode,
        stdout: '',
        stderr: line,
      };
      continue;
    }
  }

  if (current) errors.push(current as BuildError);
  if (errors.length === 0) errors.push(fallback);

  return errors;
}

export async function runCommand(
  command: string,
  projectDir: string,
  timeout = 60000,
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  try {
    const stdout = execSync(command, {
      cwd: projectDir,
      timeout,
      stdio: 'pipe',
      encoding: 'utf-8',
      maxBuffer: 5 * 1024 * 1024,
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'stderr' in err) {
      return {
        stdout: (err as any).stdout as string || '',
        stderr: (err as any).stderr as string || '',
        exitCode: (err as any).status as number | null,
      };
    }
    return {
      stdout: '',
      stderr: err instanceof Error ? err.message : String(err),
      exitCode: 1,
    };
  }
}
