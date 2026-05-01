import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import * as path from 'path';

const ROOT = path.resolve(process.cwd(), 'generated-apps');

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'dir';
  children?: FileNode[];
}

/** Guard: ensure a resolved path stays within ROOT */
function isUnderRoot(resolvedPath: string): boolean {
  return resolvedPath.startsWith(ROOT + path.sep) || resolvedPath === ROOT;
}

/**
 * List the file tree for a generated app.
 * @param appId - subdirectory name under ROOT (e.g. "gen-123-abc")
 * @returns FileNode[] tree or null if not found / out-of-bounds
 */
export function listAppFiles(appId: string): FileNode[] | null {
  const abs = path.resolve(ROOT, appId);
  if (!isUnderRoot(abs) || !existsSync(abs)) return null;
  return walkDir(abs, appId);
}

/** Walk a directory and build a FileNode tree */
function walkDir(dir: string, baseAppId: string): FileNode[] {
  return readdirSync(dir).map((entry) => {
    const full = path.join(dir, entry);
    const rel = `${baseAppId}/${entry}`;
    const st = statSync(full);
    if (st.isDirectory()) {
      return { name: entry, path: rel, type: 'dir' as const, children: walkDir(full, rel) };
    }
    return { name: entry, path: rel, type: 'file' as const };
  });
}

/**
 * Read a file from a generated app by its relative path from ROOT.
 * @param fileRelativePath - e.g. "gen-123/src/App.tsx"
 * @returns file content or null
 */
export function readAppFile(fileRelativePath: string): string | null {
  const abs = path.resolve(ROOT, fileRelativePath);
  if (!isUnderRoot(abs) || !existsSync(abs)) return null;
  return readFileSync(abs, 'utf-8');
}

/**
 * Write content to a file in a generated app.
 * @param fileRelativePath - e.g. "gen-123/src/App.tsx"
 * @param content - file content
 * @param maxBytes - optional write cap (default 5 MB)
 */
export function writeAppFile(
  fileRelativePath: string,
  content: string,
  maxBytes = 5 * 1024 * 1024
): void {
  if (content.length > maxBytes) {
    throw new Error(`Content exceeds ${maxBytes} byte limit`);
  }
  const abs = path.resolve(ROOT, fileRelativePath);
  if (!isUnderRoot(abs)) throw new Error('Path traversal rejected');
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, content, 'utf-8');
}

/**
 * List all generated app IDs and their metadata (no deep scan).
 * @returns array of { id, path, createdAt }
 */
export function listGeneratedApps(): Array<{ id: string; path: string; createdAt: string }> {
  if (!existsSync(ROOT)) return [];
  return readdirSync(ROOT)
    .filter((entry) => {
      const full = path.join(ROOT, entry);
      return statSync(full).isDirectory() && entry.startsWith('gen-');
    })
    .map((entry) => {
      const full = path.join(ROOT, entry);
      const { mtime } = statSync(full);
      return { id: entry, path: full, createdAt: mtime.toISOString() };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}
