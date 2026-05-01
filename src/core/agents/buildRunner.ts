import { exec } from 'child_process';
import { promisify } from 'util';
import type { BuildResult } from './types';
const execP = promisify(exec);
export async function runBuild(root: string): Promise<BuildResult> {
  const start = Date.now(); const errors: string[] = []; const warnings: string[] = [];
  try { const { stderr } = await execP('npm run build', { cwd: root, timeout: 120000 });
    for (const line of stderr.split('\n')) { if (line.toLowerCase().includes('error')) errors.push(line.slice(0, 200)); else if (line.toLowerCase().includes('warning')) warnings.push(line.slice(0, 200)); }
    return { success: errors.length === 0, duration: Date.now() - start, errors, warnings, outputPath: root };
  } catch (e) { return { success: false, duration: Date.now() - start, errors: String(e).split('\n'), warnings: [], outputPath: root }; }
}
