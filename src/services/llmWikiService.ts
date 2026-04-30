/**
 * LLM Wiki Service
 * Karpathy-inspired persistent markdown knowledge base.
 * Stages: Ingestion → Compilation (via DeepSeek) → Retrieval (markdown links) → Linting
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync } from "fs";
import path from "path";

const WIKI_ROOT = path.resolve(process.cwd(), "uploads", "wiki");
const RAW_DIR = path.join(WIKI_ROOT, "raw");
const PAGES_DIR = path.join(WIKI_ROOT, "pages");
const INDEX_FILE = path.join(WIKI_ROOT, "_index.md");
const LOCK_FILE = path.join(WIKI_ROOT, ".index.lock");

const flock = { locked: false };

async function acquireLock(maxWaitMs = 5000): Promise<boolean> {
  const start = Date.now();
  while (flock.locked) {
    if (Date.now() - start > maxWaitMs) return false;
    await new Promise((r) => setTimeout(r, 50));
  }
  flock.locked = true;
  return true;
}

function releaseLock() {
  flock.locked = false;
}

function ensureDirs() {
  for (const d of [WIKI_ROOT, RAW_DIR, PAGES_DIR]) {
    if (!existsSync(d)) mkdirSync(d, { recursive: true });
  }
}

// ─── DeepSeek caller ────────────────────────────────────────────────────────────

async function callDeepSeek(
  system: string,
  user: string,
  temperature = 0.3
): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return `[LLM WIKI] DeepSeek not configured. Simulated output for: ${user.slice(0, 80)}...`;

  try {
    const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature,
        max_tokens: 4096,
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`DeepSeek error: ${res.status}`);
    const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
    return data.choices?.[0]?.message?.content ?? "";
  } catch (e) {
    return `[LLM WIKI] DeepSeek call failed: ${e instanceof Error ? e.message : String(e)}`;
  }
}

// ─── Wiki page helpers ──────────────────────────────────────────────────────────

export interface WikiPage {
  slug: string;
  title: string;
  content: string;
  tags: string[];
  related: string[];
  createdAt: string;
  updatedAt: string;
  source: string;
}

function parseWikiPage(markdown: string, slug: string, source: string): WikiPage {
  const titleMatch = markdown.match(/^#\s+(.+)/m);
  const title = titleMatch?.[1] ?? slug;
  const tags: string[] = [];
  const tagMatch = markdown.match(/^tags:\s*(.+)$/im);
  if (tagMatch) tags.push(...tagMatch[1].split(/,\s*/).map(t => t.trim().toLowerCase()));
  const related: string[] = [];
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let m;
  while ((m = linkRegex.exec(markdown)) !== null) {
    if (!m[2].startsWith("http")) related.push(m[2].replace(/\.md$/, ""));
  }
  return {
    slug,
    title,
    content: markdown,
    tags,
    related: [...new Set(related)],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    source,
  };
}

// ─── Stage 1: Ingestion ──────────────────────────────────────────────────────────

export function ingestRaw(
  sourceName: string,
  content: string,
  metadata?: Record<string, unknown>
): string {
  ensureDirs();
  const slug = sourceName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  const filename = `${slug}-${Date.now()}.md`;
  const header = [
    `---`,
    `source: ${sourceName}`,
    `ingested: ${new Date().toISOString()}`,
    ...(metadata ? Object.entries(metadata).map(([k, v]) => `${k}: ${v}`) : []),
    `---`,
    "",
  ].join("\n");
  const fullPath = path.join(RAW_DIR, filename);
  writeFileSync(fullPath, header + content, "utf-8");
  return filename;
}

// ─── Stage 2: Compilation (DeepSeek) ─────────────────────────────────────────────

export async function compileWikiPage(
  rawFiles: string[],
  pageTitle: string
): Promise<WikiPage> {
  ensureDirs();
  const slug = pageTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  const rawContent = rawFiles
    .map((f) => {
      const fp = path.join(RAW_DIR, f);
      if (!existsSync(fp)) return null;
      return `--- ${f} ---\n${readFileSync(fp, "utf-8")}`;
    })
    .filter(Boolean)
    .join("\n\n");

  if (!rawContent) {
    return {
      slug,
      title: pageTitle,
      content: `# ${pageTitle}\n\n*No raw source material available for this page.*\n`,
      tags: [],
      related: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      source: "empty",
    };
  }

  const systemPrompt = `You are an expert technical writer compiling a wiki knowledge base.
Given raw source material, produce a structured markdown wiki page with:
- A clear title (H1)
- A concise summary paragraph
- Sections with H2/H3 as needed: Overview, Key Concepts, Architecture, Usage, References
- Backlinks to related concepts using markdown links: [Concept Name](concept-name)
- A "tags:" line near the top with comma-separated keywords
Focus on clarity, accuracy, and linking between concepts.`;

  const userPrompt = `Compile the following source material into a structured wiki page titled "${pageTitle}".

Source material:
${rawContent.slice(0, 12000)}`;

  const llmOutput = await callDeepSeek(systemPrompt, userPrompt);
  const page = parseWikiPage(llmOutput, slug, `compiled from ${rawFiles.length} sources`);

  const pagePath = path.join(PAGES_DIR, `${slug}.md`);
  writeFileSync(pagePath, llmOutput, "utf-8");

  // Update index
  updateIndex(page);

  return page;
}

// ─── Stage 3: Update index ───────────────────────────────────────────────────────-

function updateIndex(page: WikiPage) {
  ensureDirs();
  if (!acquireLock()) {
    console.warn("[LLM Wiki] Failed to acquire lock for index update, skipping");
    return;
  }
  try {
    const existing = existsSync(INDEX_FILE) ? readFileSync(INDEX_FILE, "utf-8") : "# LLM Wiki Index\n\n";
    const entry = `- [${page.title}](${page.slug}.md) — tags: ${page.tags.join(", ") || "none"}\n`;
    if (!existing.includes(`](${page.slug}.md)`)) {
      writeFileSync(INDEX_FILE, existing + entry, "utf-8");
    }
  } finally {
    releaseLock();
  }
}

// ─── Stage 4: Linting ─────────────────────────────────────────────────────────────

export interface LintResult {
  page: string;
  issues: Array<{ severity: "warning" | "error"; message: string }>;
}

export async function lintWiki(): Promise<LintResult[]> {
  ensureDirs();
  const files = readdirSync(PAGES_DIR).filter((f) => f.endsWith(".md"));
  const results: LintResult[] = [];

  for (const file of files) {
    const content = readFileSync(path.join(PAGES_DIR, file), "utf-8");
    const issues: LintResult["issues"] = [];
    const slug = file.replace(/\.md$/, "");

    // Check for broken internal links
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    let m;
    while ((m = linkRegex.exec(content)) !== null) {
      const target = m[2].replace(/\.md$/, "");
      if (target.startsWith("http") || target.startsWith("#")) continue;
      if (target === slug) continue;
      if (!files.includes(`${target}.md`)) {
        issues.push({ severity: "warning", message: `Broken link to "${target}"` });
      }
    }

    // Check for stale content
    const stat = existsSync(path.join(PAGES_DIR, file))
      ? statSync(path.join(PAGES_DIR, file))
      : null;
    if (stat) {
      const ageDays = (Date.now() - stat.mtimeMs) / 86400000;
      if (ageDays > 7) {
        issues.push({ severity: "warning", message: `Content is ${Math.round(ageDays)} days old — may be stale` });
      }
    }

    if (issues.length > 0) {
      results.push({ page: slug, issues });
    }
  }

  return results;
}

// ─── Retrieval ─────────────────────────────────────────────────────────────────────

export function getWikiPages(): WikiPage[] {
  ensureDirs();
  const files = readdirSync(PAGES_DIR).filter((f) => f.endsWith(".md"));
  return files.map((f) => {
    const content = readFileSync(path.join(PAGES_DIR, f), "utf-8");
    const slug = f.replace(/\.md$/, "");
    return parseWikiPage(content, slug, "filesystem");
  });
}

export function getWikiPage(slug: string): WikiPage | null {
  const safeSlug = slug.replace(/[^a-z0-9-]/g, "");
  const filePath = path.join(PAGES_DIR, `${safeSlug}.md`);
  if (!existsSync(filePath)) return null;
  const content = readFileSync(filePath, "utf-8");
  return parseWikiPage(content, safeSlug, "filesystem");
}

export function getRawFiles(): string[] {
  ensureDirs();
  return readdirSync(RAW_DIR).filter((f) => f.endsWith(".md"));
}

export function getWikiStats(): { pageCount: number; rawCount: number; indexExists: boolean } {
  ensureDirs();
  return {
    pageCount: readdirSync(PAGES_DIR).filter((f) => f.endsWith(".md")).length,
    rawCount: readdirSync(RAW_DIR).filter((f) => f.endsWith(".md")).length,
    indexExists: existsSync(INDEX_FILE),
  };
}

export async function compileAllRaw(): Promise<WikiPage[]> {
  const raws = getRawFiles();
  if (raws.length === 0) return [];
  const grouped = groupRawByTopic(raws);
  const pages: WikiPage[] = [];
  for (const [topic, files] of Object.entries(grouped)) {
    const page = await compileWikiPage(files, topic);
    pages.push(page);
  }
  return pages;
}

function groupRawByTopic(files: string[]): Record<string, string[]> {
  const groups: Record<string, string[]> = { "Pipeline Artifacts": [] };
  for (const f of files) {
    const base = f.replace(/\.md$/, "");
    const parts = base.split("-");
    if (parts.length >= 2) {
      const topic = parts.slice(0, 2).join(" ");
      const key = topic.charAt(0).toUpperCase() + topic.slice(1);
      if (!groups[key]) groups[key] = [];
      groups[key].push(f);
    } else {
      groups["Pipeline Artifacts"].push(f);
    }
  }
  return groups;
}
