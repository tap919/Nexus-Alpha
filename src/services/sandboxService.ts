/**
 * Sandbox Service for Agent Tasks
 * 
 * Provides Docker-based sandboxing for secure agent code execution.
 * Integrates with microsandbox concepts for isolated environments.
 */

import { execSync, spawn } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join, resolve } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { safeExec, safeExecLegacy } from '../lib/safeShell';

export type SandboxType = 'none' | 'docker' | 'vm';

export interface SandboxConfig {
  type: SandboxType;
  timeoutMs: number;
  memoryLimit: string;
  cpuLimit: string;
  networkDisabled: boolean;
}

export interface SandboxExecutionResult {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  containerId?: string;
}

const DEFAULT_CONFIG: SandboxConfig = {
  type: 'docker',
  timeoutMs: 300000, // 5 minutes
  memoryLimit: '512m',
  cpuLimit: '1.0',
  networkDisabled: false,
};

export class SandboxService {
  private config: SandboxConfig;
  private activeContainers: Set<string> = new Set();

  constructor(config?: Partial<SandboxConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check if Docker is available
   */
  isDockerAvailable(): boolean {
    try {
      safeExec('docker', ['--version'], { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create a sandboxed execution environment
   */
  async createSandbox(workDir: string, command: string, files?: Record<string, string>): Promise<SandboxExecutionResult> {
    const startTime = Date.now();
    
    if (this.config.type === 'none') {
      return this.executeWithoutSandbox(workDir, command, startTime);
    }

    if (this.config.type === 'docker') {
      return this.executeWithDocker(workDir, command, files, startTime);
    }

    throw new Error(`Sandbox type ${this.config.type} not yet implemented`);
  }

  /**
   * Execute without sandbox (for development/testing)
   */
  private async executeWithoutSandbox(workDir: string, command: string, startTime: number): Promise<SandboxExecutionResult> {
    try {
      const res = safeExecLegacy(command, {
        cwd: workDir,
        timeout: this.config.timeoutMs,
        maxBuffer: 10 * 1024 * 1024,
      });

      return {
        success: true,
        exitCode: 0,
        stdout: res,
        stderr: '',
        durationMs: Date.now() - startTime,
      };
    } catch (error: any) {
      return {
        success: false,
        exitCode: error.status || 1,
        stdout: error.stdout || '',
        stderr: error.stderr || error.message,
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Execute within a Docker container
   */
  private async executeWithDocker(
    workDir: string, 
    command: string, 
    files?: Record<string, string>,
    startTime: number = Date.now()
  ): Promise<SandboxExecutionResult> {
    if (!this.isDockerAvailable()) {
      throw new Error('Docker is not available. Please install Docker or use sandbox type "none"');
    }

    const containerId = `nexus-sandbox-${uuidv4().slice(0, 8)}`;
    const tempDir = join(workDir, '.nexus-sandbox', containerId);
    
    try {
      // Create temp directory
      if (!existsSync(tempDir)) {
        mkdirSync(tempDir, { recursive: true });
      }

      // Write files to temp directory if provided
      if (files) {
        for (const [filePath, content] of Object.entries(files)) {
          const fullPath = join(tempDir, filePath);
          const dir = resolve(fullPath, '..');
          if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
          }
          writeFileSync(fullPath, content, 'utf-8');
        }
      }

      // Create Docker container with resource limits and security hardeners
      const res = safeExec('docker', [
        'run',
        '--name', containerId,
        '--rm',
        '--memory', this.config.memoryLimit,
        '--cpus', this.config.cpuLimit,
        '--pids-limit', '50',      // Prevent fork bombs
        '--ulimit', 'nofile=128:256', // Limit open files
        this.config.networkDisabled ? '--network-none' : '',
        '-v', `${tempDir}:/workspace`,
        '-w', '/workspace',
        'node:20-alpine',
        'sh', '-c', command,
      ].filter(Boolean) as string[], {
        cwd: tempDir,
        timeout: this.config.timeoutMs,
        maxBuffer: 10 * 1024 * 1024,
      });

      this.activeContainers.delete(containerId);

      if (!res.success) {
        throw { 
          status: res.exitCode, 
          stdout: res.stdout, 
          stderr: res.stderr || res.error?.message 
        };
      }

      return {
        success: true,
        exitCode: 0,
        stdout: res.stdout,
        stderr: '',
        durationMs: Date.now() - startTime,
        containerId,
      };
    } catch (error: any) {
      // Cleanup container if still exists
      try {
        safeExec('docker', ['rm', '-f', containerId], { stdio: 'ignore' });
      } catch {
        // Ignore cleanup errors
      }

      this.activeContainers.delete(containerId);

      return {
        success: false,
        exitCode: error.status || 1,
        stdout: error.stdout || '',
        stderr: error.stderr || error.message,
        durationMs: Date.now() - startTime,
        containerId,
      };
    } finally {
      // Cleanup temp directory
      try {
        if (existsSync(tempDir)) {
          rmSync(tempDir, { recursive: true, force: true });
        }
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Stop a running sandbox container
   */
  stopSandbox(containerId: string): boolean {
    try {
      safeExec('docker', ['stop', containerId], { stdio: 'ignore' });
      this.activeContainers.delete(containerId);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get all active sandbox containers
   */
  getActiveContainers(): string[] {
    return Array.from(this.activeContainers);
  }

  /**
   * Cleanup all active sandboxes
   */
  cleanup(): void {
    for (const containerId of this.activeContainers) {
      this.stopSandbox(containerId);
    }
  }
}

// Export singleton instance
export const sandboxService = new SandboxService();
