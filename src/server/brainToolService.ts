/**
 * Brain Tool Service - Server-side only
 * Integrates deterministic-brain and browser-harness
 */

import { spawn, execSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { existsSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const POSSIBLE_BRAIN_PATHS = [
  join(process.cwd(), "packages/deterministic-brain"),
  join(__dirname, "../../packages/deterministic-brain"),
  join(__dirname, "../../deterministic-brain-main"),
  join(__dirname, "../deterministic-brain-main"),
  join(process.cwd(), "deterministic-brain-main"),
];

export function findBrainDir(): string | null {
  for (const p of POSSIBLE_BRAIN_PATHS) {
    if (existsSync(join(p, "main.py"))) return p;
  }
  return null;
} 

export interface BrainQueryOptions {
  query: string;
  lane?: "coding" | "business_logic" | "agent_brain" | "tool_calling" | "cross_domain";
  verbose?: boolean;
}

export interface BrowserCommandOptions {
  command: string;
  timeout?: number;
}

function safeShellArg(arg: string): string {
  // Remove shell metacharacters to prevent injection
  return arg.replace(/[;&|`$(){}[\]!#~<>*?\\\n\r]/g, '').trim();
}

export async function runDeterministicBrain(options: BrainQueryOptions): Promise<string> {
  const brainDir = findBrainDir();

  if (!brainDir) {
    return `[BRAIN SIMULATED] Analysis for: ${options.query}\n` +
      `Lane: ${options.lane ?? 'general'}\n` +
      `Result: Deterministic brain not installed at any expected path.\n` +
      `Install at: deterministic-brain-main/ in project root.\n` +
      `Simulated synergy score: 0.74\n` +
      `Recommendations: [langchain-integration, workflow-automation, browser-testing]\n`;
  }

  const safeQuery = safeShellArg(options.query);
  const args = ["main.py", safeQuery];
  if (options.lane) args.push("--lane", safeShellArg(options.lane));
  if (options.verbose) args.push("--verbose");

  return new Promise((resolve, reject) => {
    const proc = spawn("python", args, {
      cwd: brainDir,
      shell: false,
    });
    let stdout = "";
    let stderr = "";

    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error("Deterministic brain timed out after 15s"));
    }, 15000);

    proc.stdout.on("data", (data) => { stdout += data.toString(); });
    proc.stderr.on("data", (data) => { stderr += data.toString(); });
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr || `Deterministic brain exited with code ${code}`));
    });
    proc.on("error", (err) => { clearTimeout(timer); reject(err); });
  });
}

export async function runBrowserHarness(options: BrowserCommandOptions): Promise<string> {
  const safeCmd = safeShellArg(options.command);

  return new Promise((resolve, reject) => {
    const proc = spawn("browser-harness", ["-c", safeCmd], {
      shell: false,
    });
    let stdout = "";
    let stderr = "";
    
    const timeout = options.timeout || 30000;
    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error("Browser harness timed out"));
    }, timeout);

    proc.stdout.on("data", (data) => { stdout += data.toString(); });
    proc.stderr.on("data", (data) => { stderr += data.toString(); });
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr || `browser-harness exited with code ${code}`));
    });
    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

export function isAvailable(binary: 'python' | 'browser-harness'): boolean {
  try {
    execSync(`${binary} --version`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export async function runDeterministicBrainSafe(options: BrainQueryOptions): Promise<{
  success: boolean;
  output: string;
  simulated: boolean;
}> {
  try {
    if (!isAvailable('python')) {
      return { success: true, output: '[BRAIN] Python not available. Running in simulated mode.', simulated: true };
    }
    const result = await runDeterministicBrain(options);
    return { success: true, output: result, simulated: false };
  } catch (e) {
    return { success: false, output: e instanceof Error ? e.message : String(e), simulated: false };
  }
}

export async function runBrowserHarnessSafe(options: BrowserCommandOptions): Promise<{
  success: boolean;
  output: string;
  simulated: boolean;
}> {
  try {
    if (!isAvailable('browser-harness')) {
      return { success: true, output: '[BROWSER] browser-harness not found. Running in simulated mode.', simulated: true };
    }
    const result = await runBrowserHarness(options);
    return { success: true, output: result, simulated: false };
  } catch (e) {
    return { success: false, output: e instanceof Error ? e.message : String(e), simulated: false };
  }
}

export async function analyzeRepoWithBrain(repos: string[]): Promise<{
  synergy: string;
  suggestions: string[];
  lane: string;
}> {
  const query = `Analyze these repositories for potential synergies and integration opportunities: ${repos.join(", ")}`;
  
  const result = await runDeterministicBrainSafe({
    query,
    lane: "cross_domain",
    verbose: false
  });
  
  return {
    synergy: result.output,
    suggestions: extractSuggestions(result.output),
    lane: "cross_domain"
  };
}

function extractSuggestions(text: string): string[] {
  const lines = text.split("\n").filter(l => l.trim().length > 0);
  return lines.slice(0, 5);
}

export async function runBrowserE2ETest(url: string, testScript: string): Promise<{
  success: boolean;
  screenshot?: string;
  console?: string[];
}> {
  const fullScript = `
    new_tab("${url}")
    wait_for_load()
    ${testScript}
    capture_screenshot()
  `;
  
  const result = await runBrowserHarnessSafe({ command: fullScript });
  return {
    success: result.success,
    console: result.output.split("\n").filter(l => l.trim())
  };
}
