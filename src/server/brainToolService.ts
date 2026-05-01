/**
 * Brain Tool Service - Server-side only
 * Integrates deterministic-brain and browser-harness
 */

import { spawn, execSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { existsSync } from "fs";
import { chromium, Browser, Page } from "@playwright/test";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// -- Playwright State --
let globalBrowser: Browser | null = null;
let globalPage: Page | null = null;

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
  const cmd = options.command;

  try {
    if (!globalBrowser) {
      globalBrowser = await chromium.launch({ headless: true });
    }
    if (!globalPage) {
      const context = await globalBrowser.newContext();
      globalPage = await context.newPage();
    }

    const page = globalPage;
    let output = '';

    // Very simple DSL interpreter for the Agent Browser commands
    const statements = cmd.split(';').map(s => s.trim()).filter(Boolean);

    for (const stmt of statements) {
      if (stmt.startsWith('new_tab("') || stmt.startsWith("new_tab('")) {
        const urlMatch = stmt.match(/new_tab\(['"]([^'"]+)['"]\)/);
        if (urlMatch) {
          await page.goto(urlMatch[1]);
          output += `[navigated to ${urlMatch[1]}]\n`;
        }
      } 
      else if (stmt.includes('wait_for_load()')) {
        await page.waitForLoadState('networkidle').catch(() => {});
      }
      else if (stmt.includes('page_info()')) {
        const url = page.url();
        const title = await page.title();
        const size = page.viewportSize();
        output += JSON.stringify({ url, title, viewport: size, loadState: 'complete' }, null, 2) + '\n';
      }
      else if (stmt.includes('page_source()')) {
        const html = await page.content();
        output += html.substring(0, 5000) + (html.length > 5000 ? '\n...[TRUNCATED]' : '') + '\n';
      }
      else if (stmt.includes('page_links()') || stmt.includes('print(join(links')) {
        const links = await page.$$eval('a', as => as.map(a => a.href).filter(h => h.startsWith('http')));
        output += Array.from(new Set(links)).slice(0, 20).join('\n') + '\n';
      }
      else if (stmt.includes('console_messages()')) {
        // Playwright doesn't store past console messages natively unless tracked. 
        // We'll return a stub since we didn't track from page creation in this simple loop
        output += '[]\n';
      }
      else if (stmt.includes('capture_screenshot()')) {
        const buf = await page.screenshot({ type: 'jpeg', quality: 50 });
        output += `[SCREENSHOT CAPTURED: ${buf.length} bytes]\n`;
      }
      else {
        output += `[evaluating javascript...]\n`;
        // Try executing arbitrary JS if it doesn't match the DSL
        try {
          const res = await page.evaluate(stmt);
          output += String(res) + '\n';
        } catch (e) {
          output += `[error evaluating: ${e}]\n`;
        }
      }
    }

    return output.trim();
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : String(err));
  }
}

export function isAvailable(binary: 'python' | 'browser-harness'): boolean {
  if (binary === 'browser-harness') return true; // Now implemented natively via Playwright
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
