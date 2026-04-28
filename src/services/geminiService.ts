/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI } from "@google/genai";
import type { DashboardData, RepoTrend, NewsItem, PredictionData } from "../types";

// ─── Constants ────────────────────────────────────────────────────────────────
const MODEL = "gemini-2.5-flash";
const CACHE_TTL_MARKET = 5 * 60 * 1000;   // 5 min
const CACHE_TTL_REPOS  = 60 * 60 * 1000;  // 1 hr
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1500;

// ─── Cache ────────────────────────────────────────────────────────────────────
interface CacheEntry<T> { data: T; ts: number; }
const cache: Map<string, CacheEntry<unknown>> = new Map();

function getCache<T>(key: string, ttl: number): T | null {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (entry && Date.now() - entry.ts < ttl) return entry.data;
  return null;
}
function setCache<T>(key: string, data: T): void {
  cache.set(key, { data, ts: Date.now() });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

async function callGemini<T>(prompt: string, retries = MAX_RETRIES): Promise<T> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const result = await ai.models.generateContent({
        model: MODEL,
        contents: prompt,
        config: { responseMimeType: "application/json" },
      });
      const text = result.text?.trim() ?? "{}";
      const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) ||
                        text.match(/```([\s\S]*?)```/);
      const raw = jsonMatch ? jsonMatch[1] : text;
      return JSON.parse(raw) as T;
    } catch (err: unknown) {
      const isRateLimit = (err as { status?: number }).status === 429;
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS * attempt * (isRateLimit ? 3 : 1)));
      } else {
        throw err;
      }
    }
  }
  throw new Error("callGemini: max retries exceeded");
}

// ─── Parallel Sub-calls ───────────────────────────────────────────────────────

async function fetchMarketData(): Promise<{
  growthRate: number;
  activeDevelopers: number;
  totalModels: number;
  sentimentScore: number;
  predictions: PredictionData[];
  growthHistory: { month: string; value: number }[];
  signals: { time: string; source: string; signal: string; value: string }[];
  synergyInsights: string[];
}> {
  const cacheKey = "market";
  const cached = getCache<ReturnType<typeof fetchMarketData> extends Promise<infer U> ? U : never>(cacheKey, CACHE_TTL_MARKET);
  if (cached) return cached as Awaited<ReturnType<typeof fetchMarketData>>;

  const today = new Date().toISOString().split("T")[0];
  const prompt = `You are an AI market intelligence engine. Today is ${today}.
Return a JSON object matching this exact schema (no extra keys):
{
  "growthRate": number,
  "activeDevelopers": number,
  "totalModels": number,
  "sentimentScore": number,
  "predictions": [
    { "category": string, "currentValue": number, "predictedValue": number, "growth": number, "impact": "High"|"Medium"|"Low" }
  ],
  "growthHistory": [ { "month": string, "value": number } ],
  "signals": [ { "time": string, "source": string, "signal": string, "value": string } ],
  "synergyInsights": [ string ]
}
Base values on real current AI/developer ecosystem data. Predictions array must have 6 items. GrowthHistory must be 12 months. Signals must be 5 items.`;

  const data = await callGemini<Awaited<ReturnType<typeof fetchMarketData>>>(prompt);
  setCache(cacheKey, data);
  return data;
}

async function fetchRepoData(): Promise<{
  repos: RepoTrend[];
  trendingTools: { name: string; description: string; category: string; stars?: number }[];
  openSourceStats: { label: string; value: number; change: number }[];
  harvestSources: { name: string; url: string; lastUpdate: string }[];
}> {
  const cacheKey = "repos";
  const cached = getCache<Awaited<ReturnType<typeof fetchRepoData>>>(cacheKey, CACHE_TTL_REPOS);
  if (cached) return cached;

  const today = new Date().toISOString().split("T")[0];
  const prompt = `You are a GitHub trends intelligence engine. Today is ${today}.
Return a JSON object matching this exact schema:
{
  "repos": [
    {
      "name": string,
      "stars": number,
      "forks": number,
      "growth": number,
      "tags": [string],
      "aiAnalysis": string,
      "stack": string,
      "utility": string,
      "buildType": string
    }
  ],
  "trendingTools": [
    { "name": string, "description": string, "category": string, "stars": number }
  ],
  "openSourceStats": [
    { "label": string, "value": number, "change": number }
  ],
  "harvestSources": [
    { "name": string, "url": string, "lastUpdate": string }
  ]
}
Repos must be 10 real currently trending AI/dev repos from GitHub. Tools must be 8 items. OpenSourceStats must be 5 items. HarvestSources must be 5 items.`;

  const data = await callGemini<Awaited<ReturnType<typeof fetchRepoData>>>(prompt);
  setCache(cacheKey, data);
  return data;
}

async function fetchNewsAndVideos(): Promise<{
  news: NewsItem[];
  videos: { id: string; title: string; thumbnail: string; channel: string; views: string; url: string }[];
}> {
  const cacheKey = "news";
  const cached = getCache<Awaited<ReturnType<typeof fetchNewsAndVideos>>>(cacheKey, CACHE_TTL_MARKET);
  if (cached) return cached;

  const today = new Date().toISOString().split("T")[0];
  const prompt = `You are an AI news aggregator. Today is ${today}.
Return a JSON object matching this exact schema:
{
  "news": [
    {
      "id": string,
      "title": string,
      "source": string,
      "timestamp": string,
      "sentiment": "positive"|"neutral"|"negative",
      "summary": string,
      "url": string
    }
  ],
  "videos": [
    { "id": string, "title": string, "thumbnail": string, "channel": string, "views": string, "url": string }
  ]
}
News must be 8 real recent AI/developer news items. Videos must be 5 items from channels: Fireship, Theo, ThePrimeagen, Matt Williams, or similar AI/dev channels.`;

  const data = await callGemini<Awaited<ReturnType<typeof fetchNewsAndVideos>>>(prompt);
  setCache(cacheKey, data);
  return data;
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export async function fetchDashboardData(
  existingAgents: DashboardData["customAgents"],
  existingCLI: DashboardData["cliState"]
): Promise<DashboardData> {
  // Fire all 3 calls in parallel
  const [market, repos, newsVideos] = await Promise.all([
    fetchMarketData(),
    fetchRepoData(),
    fetchNewsAndVideos(),
  ]);

  return {
    growthRate: market.growthRate,
    activeDevelopers: market.activeDevelopers,
    totalModels: market.totalModels,
    sentimentScore: market.sentimentScore,
    predictions: market.predictions,
    growthHistory: market.growthHistory,
    signals: market.signals,
    synergyInsights: market.synergyInsights,
    repos: repos.repos,
    trendingTools: repos.trendingTools,
    openSourceStats: repos.openSourceStats,
    harvestSources: repos.harvestSources,
    news: newsVideos.news,
    videos: newsVideos.videos,
    buildPipeline: [],
    customAgents: existingAgents,
    cliState: existingCLI,
    mcpStatus: {
      activeServers: 0,
      connections: 0,
      lastPing: new Date().toISOString(),
      protocol: "MCP/1.0",
    },
  };
}

export async function analyzeRepoSynergy(repos: RepoTrend[]): Promise<string[]> {
  const names = repos.map(r => r.name).join(", ");
  const prompt = `Given these GitHub repositories: ${names}
Return a JSON array of 5 strings, each describing a specific synergy or integration opportunity between two or more of these repos. Be concrete and technical.`;
  return callGemini<string[]>(prompt);
}
