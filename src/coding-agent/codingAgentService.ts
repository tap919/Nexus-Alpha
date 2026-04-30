import { existsSync, mkdirSync, readdirSync, statSync, rmdirSync } from 'fs';
import path from 'path';
import { logger } from '../lib/logger';
import type { AppSpec, ArchitecturePlan, GenerationResult, BuildResult } from './types';
import { generatePlan } from './planner';
import { writeFiles } from './fileWriter';
import { installDependencies, writePackageJson } from './packageManager';
import { runBuild } from './buildRunner';
import { trackGeneration } from '../services/licenseService';

const CTX = 'CodingAgentService';

const DEFAULT_OUTPUT_DIR = path.resolve(process.cwd(), 'uploads', 'generated-apps');

export class CodingAgentService {
  private outputBase: string;

  constructor(outputBase?: string) {
    this.outputBase = outputBase || DEFAULT_OUTPUT_DIR;
  }

  async generateApp(spec: AppSpec): Promise<GenerationResult> {
    const start = Date.now();
    logger.info(CTX, 'Starting app generation', { description: spec.description.slice(0, 80) });

    trackGeneration();

    const appDir = this.createAppDir(spec);

    try {
      const plan = await generatePlan(spec);

      this.ensureOutputDir(appDir);
      logger.info(CTX, `App directory: ${appDir}`);

      writePackageJson(
        appDir,
        plan.dependencies,
        plan.devDependencies,
        plan.scripts,
        path.basename(appDir),
      );

      plan.files = plan.files.filter(f => f.path !== 'package.json');

      const writeResult = writeFiles(plan.files, appDir);
      if (!writeResult.success && writeResult.filesWritten === 0) {
        return {
          success: false,
          appPath: appDir,
          plan,
          summary: `Failed to write files: ${writeResult.errors.join('; ')}`,
          duration: Date.now() - start,
        };
      }

      const installResult = await installDependencies(appDir);
      if (!installResult.success) {
        return {
          success: false,
          appPath: appDir,
          plan,
          summary: `Dependencies failed to install: ${installResult.stderr.slice(0, 200)}`,
          duration: Date.now() - start,
        };
      }

      const buildResult = await this.tryBuild(appDir);

      const duration = Date.now() - start;
      const summary = buildResult.success
        ? `Successfully built ${spec.description} in ${appDir}`
        : `Generated ${spec.description} but build failed. Files are at ${appDir}`;

      return {
        success: buildResult.success,
        appPath: appDir,
        plan,
        buildResult,
        summary,
        duration,
      };
    } catch (err) {
      const duration = Date.now() - start;
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(CTX, 'Generation failed', { error: msg });

      return {
        success: false,
        appPath: appDir,
        plan: {
          appType: 'custom',
          techStack: { frontend: 'react', backend: 'none', database: 'none', css: 'tailwind' },
          files: [],
          dependencies: {},
          devDependencies: {},
          scripts: {},
          summary: msg,
        },
        summary: `Generation failed: ${msg}`,
        duration,
      };
    }
  }

  private async tryBuild(appDir: string): Promise<BuildResult | undefined> {
    try {
      const result = await runBuild(appDir);
      return result;
    } catch (err) {
      logger.warn(CTX, 'Build execution failed', err);
      return undefined;
    }
  }

  private createAppDir(spec: AppSpec): string {
    const slug = spec.description
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 30) || 'app';

    const timestamp = Date.now().toString(36);
    return path.join(this.outputBase, `${slug}-${timestamp}`);
  }

  private ensureOutputDir(dir: string): void {
    mkdirSync(dir, { recursive: true });
  }

  listGeneratedApps(): { name: string; path: string; created: Date }[] {
    if (!existsSync(this.outputBase)) return [];

    const entries = readdirSync(this.outputBase);

    return entries
      .filter(e => {
        const full = path.join(this.outputBase, e);
        return statSync(full).isDirectory();
      })
      .map(e => ({
        name: e,
        path: path.join(this.outputBase, e),
        created: statSync(path.join(this.outputBase, e)).birthtime,
      }))
      .sort((a, b) => b.created.getTime() - a.created.getTime());
  }

  getAppInfo(appDir: string): { exists: boolean; fileCount: number; sizeKB: number } {
    if (!existsSync(appDir)) return { exists: false, fileCount: 0, sizeKB: 0 };

    let fileCount = 0;
    let totalSize = 0;

    function walk(dir: string) {
      for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        const stat = statSync(full);
        if (stat.isDirectory()) {
          if (entry !== 'node_modules') walk(full);
        } else {
          fileCount++;
          totalSize += stat.size;
        }
      }
    }
    walk(appDir);

    return { exists: true, fileCount, sizeKB: Math.round(totalSize / 1024) };
  }

  cleanup(maxAgeMs?: number): { removed: number; kept: number; removedDirs: string[] } {
    const maxAge = maxAgeMs || 24 * 60 * 60 * 1000;
    const now = Date.now();

    if (!existsSync(this.outputBase)) {
      return { removed: 0, kept: 0, removedDirs: [] };
    }

    const dirs = readdirSync(this.outputBase)
      .map(name => path.join(this.outputBase, name))
      .filter(p => statSync(p).isDirectory())
      .map(p => ({ path: p, created: statSync(p).birthtime.getTime() }))
      .sort((a, b) => b.created - a.created);

    const skipCount = Math.min(3, dirs.length);
    const toRemove: string[] = [];
    const toKeep: string[] = [];

    for (let i = 0; i < dirs.length; i++) {
      if (i < skipCount) {
        toKeep.push(dirs[i].path);
      } else if (now - dirs[i].created > maxAge) {
        toRemove.push(dirs[i].path);
      } else {
        toKeep.push(dirs[i].path);
      }
    }

    for (const dir of toRemove) {
      try {
        rmdirSync(dir, { recursive: true });
      } catch (err) {
        logger.warn(CTX, `Failed to remove ${dir}`, err instanceof Error ? err.message : String(err));
        toKeep.push(dir);
        toRemove.splice(toRemove.indexOf(dir), 1);
      }
    }

    logger.info(CTX, `Cleanup: removed ${toRemove.length}, kept ${toKeep.length}`);
    return { removed: toRemove.length, kept: toKeep.length, removedDirs: toRemove };
  }
}

export const codingAgent = new CodingAgentService();
