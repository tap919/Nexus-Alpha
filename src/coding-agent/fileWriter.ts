import { existsSync, mkdirSync, writeFileSync, chmodSync } from 'fs';
import path from 'path';
import { logger } from '../lib/logger';
import type { GeneratedFile } from './types';

const CTX = 'CodingAgentFileWriter';

export interface WriteResult {
  success: boolean;
  filesWritten: number;
  filesSkipped: number;
  errors: string[];
  rootDir: string;
}

export function writeFiles(
  files: GeneratedFile[],
  outputDir: string,
  options?: { overwrite?: boolean },
): WriteResult {
  const absDir = path.resolve(outputDir);
  const result: WriteResult = {
    success: true,
    filesWritten: 0,
    filesSkipped: 0,
    errors: [],
    rootDir: absDir,
  };

  logger.info(CTX, `Writing ${files.length} files to ${absDir}`);

  for (const file of files) {
    const fullPath = path.resolve(absDir, file.path);

    const normalizedDir = path.dirname(fullPath);
    if (!normalizedDir.startsWith(absDir + path.sep) && normalizedDir !== absDir) {
      result.errors.push(`Path traversal blocked: ${file.path}`);
      result.success = false;
      continue;
    }

    try {
      if (existsSync(fullPath) && !options?.overwrite) {
        result.filesSkipped++;
        continue;
      }

      mkdirSync(path.dirname(fullPath), { recursive: true });

      writeFileSync(fullPath, file.content, 'utf-8');

      if (file.executable) {
        try { chmodSync(fullPath, 0o755); } catch {}
      }

      result.filesWritten++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`Failed to write ${file.path}: ${msg}`);
      result.success = false;
    }
  }

  const skipped = result.filesSkipped > 0 ? ` (${result.filesSkipped} skipped)` : '';
  logger.info(CTX, `Wrote ${result.filesWritten} files${skipped}`);

  return result;
}
