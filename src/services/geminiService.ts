/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, Type } from "@google/genai";
import { DashboardData } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function analyzeAIData(): Promise<DashboardData> {
  const now = new Date().toISOString();
  const prompt = `
    CRITICAL: You are a real-time AI analyst. Today's date is ${now}.
    You MUST use Google Search to find current, fresh data from the last 24-48 hours.
    
    PRIMARY SOURCES:
    Directly research and extract content from these specific YouTube channels and their recent uploads:
    - ManuAGI
    - @GithubAwesome
    - Github Trending Digest
    - AI Stack Engineer
    
    TASKS:
    1. Specifically look for GitHub repositories mentioned by these creators in the last 7 days.
    2. Analyze the repositories for "SYNERGY": identify how two or more of these trending tools could be combined (e.g., using Tool A for orchestration and Tool B for optimized inference).
    3. Ensure a "Nexus-Compliance-Auditor" agent is included in every analysis to provide Top-Tier SLSA v3 auditing.
    
    DATASET REQUIREMENTS:
    1. Overall growth metrics (rate, developers, models).
    2. Sentiment score (-1 to 1).
    3. 5-7 core Predictions for the next 2-5 years with growth % and impact. Ensure at least 2 predictions focus on "Human Interaction" or "Socio-Economic Growth".
    4. 6-8 recent landmark News items from news, social media, and major events.
    5. 6-8 trending AI-related GitHub repositories. For each, include:
       - name, stars, forks, growth %
       - 3-4 tags
       - 1-sentence "aiAnalysis" (why it's disruptive)
       - "stack": The primary technical stack (e.g., "Python/PyTorch", "Rust/WebAssembly")
       - "utility": The core utility/function (e.g., "Distributed Inference", "Vector Search Optimization")
       - "buildType": The recommended build pattern (e.g., "Containerized Microservice", "WASM Edge Module")
    6. Historical growth data for the last 6 months.
    7. 3-4 key Open Source metrics (e.g., "Open vs Closed Adoption").
    8. 4 specific Trending Open Source Tools.
    9. 4 trending AI YouTube videos (titles, channels, views) - prioritize the 4 channels mentioned above.
    10. A "Unified Pipeline" analysis: Identify how to combine the functionality of 2-3 specific trending repos into a single unified build. Provide:
        - "stack": The combined stack.
        - "utility": The new synthesized utility.
        - "buildType": The final build type.
        - "suggestedIntegration": How the components talk to each other.
        - "potentialSynergy": The expected performance or capability gain.
    11. 3 real-time "API signals" (simulated timestamps based on real current activity).
    12. "Synergy Insights": provide 3-4 specific ideas on how to combine the trending repos/tools found.
    13. "Harvest Sources": List the 4 specific YouTube channels or GitHub trending pages you audited, including their canonical URLs and the timestamp of the latest content found.
    14. "MCP Status": Provide a simulated status of a Model Context Protocol bridge (activeServers count around 5-12, connections count around 150-500, protocol version "1.0.0").

    Model Selection Guidelines (2026 Context):
    - Prefer DeepSeek-V3 or DeepSeek-R1 for reasoning/coding.
    - Mention Gemini 2.0 Flash or 2.0 Pro for vision/multi-modal.
    - Reference "Zen" (OpenCode validated models) for reliability.

    Format the response as a JSON object matching the provided schema.
  `;

  const fetchWithRetry = async (retries = 3, delay = 3500): Promise<DashboardData> => {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        // @ts-ignore
        tools: [{ googleSearch: {} }],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              growthRate: { type: Type.NUMBER },
              activeDevelopers: { type: Type.NUMBER },
              totalModels: { type: Type.NUMBER },
              sentimentScore: { type: Type.NUMBER },
              predictions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    category: { type: Type.STRING },
                    currentValue: { type: Type.NUMBER },
                    predictedValue: { type: Type.NUMBER },
                    growth: { type: Type.NUMBER },
                    impact: { type: Type.STRING, enum: ["High", "Medium", "Low"] }
                  }
                }
              },
              news: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    title: { type: Type.STRING },
                    source: { type: Type.STRING },
                    timestamp: { type: Type.STRING },
                    sentiment: { type: Type.STRING, enum: ["positive", "neutral", "negative"] },
                    summary: { type: Type.STRING },
                    url: { type: Type.STRING }
                  }
                }
              },
              repos: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    stars: { type: Type.NUMBER },
                    forks: { type: Type.NUMBER },
                    growth: { type: Type.NUMBER },
                    tags: { type: Type.ARRAY, items: { type: Type.STRING } },
                    aiAnalysis: { type: Type.STRING },
                    stack: { type: Type.STRING },
                    utility: { type: Type.STRING },
                    buildType: { type: Type.STRING }
                  },
                  required: ["name", "stars", "forks", "growth", "tags", "aiAnalysis", "stack", "utility", "buildType"]
                }
              },
              growthHistory: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    month: { type: Type.STRING },
                    value: { type: Type.NUMBER }
                  }
                }
              },
              openSourceStats: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    label: { type: Type.STRING },
                    value: { type: Type.NUMBER },
                    change: { type: Type.NUMBER }
                  }
                }
              },
              trendingTools: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    description: { type: Type.STRING },
                    category: { type: Type.STRING },
                    stars: { type: Type.NUMBER }
                  }
                }
              },
              videos: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    title: { type: Type.STRING },
                    thumbnail: { type: Type.STRING },
                    channel: { type: Type.STRING },
                    views: { type: Type.STRING },
                    url: { type: Type.STRING }
                  }
                }
              },
              buildPipeline: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    phase: { type: Type.STRING },
                    status: { type: Type.STRING, enum: ["completed", "running", "pending"] },
                    details: { type: Type.STRING }
                  }
                }
              },
              signals: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    time: { type: Type.STRING },
                    source: { type: Type.STRING },
                    signal: { type: Type.STRING },
                    value: { type: Type.STRING }
                  }
                }
              },
              synergyInsights: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              },
              harvestSources: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    url: { type: Type.STRING },
                    lastUpdate: { type: Type.STRING }
                  }
                }
              },
              mcpStatus: {
                type: Type.OBJECT,
                properties: {
                  activeServers: { type: Type.NUMBER },
                  connections: { type: Type.NUMBER },
                  lastPing: { type: Type.STRING },
                  protocol: { type: Type.STRING }
                }
              }
            },
            required: ["growthRate", "activeDevelopers", "totalModels", "sentimentScore", "predictions", "news", "repos", "growthHistory", "openSourceStats", "trendingTools", "videos", "buildPipeline", "signals", "synergyInsights", "harvestSources", "mcpStatus"]
          }
        }
      });

      const data = JSON.parse(response.text || "{}");
      return data as DashboardData;
    } catch (error: any) {
      // Check for rate limit or high demand
      const isRateLimit = error?.message?.includes("429") || error?.status === 429 || error?.message?.includes("exhausted") || error?.message?.includes("high demand");
      
      if (retries > 0 && isRateLimit) {
        console.warn(`Gemini API busy (429/high demand). Retrying in ${delay}ms... (${retries} retries left)`);
        await new Promise(res => setTimeout(res, delay));
        return fetchWithRetry(retries - 1, delay * 2);
      }
      throw error;
    }
  };

  try {
    return await fetchWithRetry();
  } catch (error) {
    console.error("Error analyzing AI data after retries:", error);
    // Return fallback data if AI fails completely
    return getFallbackData();
  }
}

function getFallbackData(): DashboardData {
  const now = new Date();
  return {
    growthRate: 142.5,
    activeDevelopers: 3500000,
    totalModels: 450000,
    sentimentScore: 0.78,
    predictions: [
      { category: "AGI Progress", currentValue: 45, predictedValue: 85, growth: 88, impact: "High" },
      { category: "Hardware Efficiency", currentValue: 30, predictedValue: 75, growth: 150, impact: "High" },
      { category: "Edge Inference", currentValue: 20, predictedValue: 60, growth: 200, impact: "Medium" }
    ],
    news: [
      { id: "1", title: "OpenAI Announces GPT-5 Training Phase", source: "TechCrunch", timestamp: "2h ago", sentiment: "positive", summary: "The next generation model aims for deeper reasoning.", url: "#" }
    ],
    repos: [
      { 
        name: "transformers", 
        stars: 120000, 
        forks: 25000, 
        growth: 12, 
        tags: ["NLP", "LLM"], 
        aiAnalysis: "The gold standard for transformer architectures.",
        stack: "Python/PyTorch",
        utility: "Base Model Orchestration",
        buildType: "Monolithic Service"
      },
      {
        name: "vllm",
        stars: 18000,
        forks: 2400,
        growth: 45,
        tags: ["Inference", "Optimization"],
        aiAnalysis: "High-throughput serving for LLMs.",
        stack: "Python/CUDA/C++",
        utility: "Throughput Optimization",
        buildType: "Distributed Server"
      }
    ],
    growthHistory: [
      { month: "Nov", value: 100 },
      { month: "Dec", value: 110 },
      { month: "Jan", value: 125 },
      { month: "Feb", value: 140 }
    ],
    openSourceStats: [
      { label: "Open vs Closed Adoption", value: 68, change: 12 },
      { label: "Contributor Velocity", value: 85, change: 15 }
    ],
    trendingTools: [
      { name: "LocalLLM", description: "Edge inference engine", category: "Infrastructure", stars: 15000 }
    ],
    videos: [
      { id: "1", title: "Future of AI: GPT-5 and Beyond", channel: "Two Minute Papers", views: "1.2M", thumbnail: "https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&q=80&w=400", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }
    ],
    buildPipeline: [
      { id: "1", phase: "Data Ingestion", status: "completed", details: "1.2TB dataset validated" },
      { id: "2", phase: "Neural Architecture", status: "running", details: "Optimizing 70B parameter graph" },
      { id: "3", phase: "Validation", status: "pending", details: "Evaluating zero-shot accuracy" }
    ],
    signals: [
      { time: now.toLocaleTimeString(), source: "GITHUB_V3", signal: "PULL_REQUEST_SPIKE", value: "0.12ms" },
      { time: now.toLocaleTimeString(), source: "REDDIT_ML", signal: "SENTIMENT_SHIFT", value: "BULLISH" }
    ],
    synergyInsights: [
      "Combine AutoGPT with LocalLLM for private autonomous agents",
      "Bridge Transformers with EdgeInference for mobile-first LLM apps"
    ],
    harvestSources: [
      { name: "ManuAGI", url: "https://youtube.com/@ManuAGI", lastUpdate: now.toISOString() },
      { name: "@GithubAwesome", url: "https://youtube.com/@GithubAwesome", lastUpdate: now.toISOString() }
    ],
    customAgents: [
      { id: '1', name: 'Nexus-Primary-Agent', type: 'script', status: 'active', lastActive: now.toISOString(), analysis: 'Optimized for high-speed Repo scraping.' },
      { id: 'auditor', name: 'Nexus-Compliance-Auditor', type: 'config', status: 'active', lastActive: now.toISOString(), analysis: 'Automated SLSA level 3 verification and CVE scanning.' }
    ],
    cliState: {
      activeProvider: 'opencode',
      output: ['[SYSTEM] CLI Ready (OpenCode v2.5.0)', '[INFO] DeepSeek-V3 API Bridge: ACTIVE', '[ZEN] Model "Zen-Reasoning-1" validated.']
    },
    mcpStatus: {
      activeServers: 8,
      connections: 342,
      lastPing: now.toISOString(),
      protocol: "1.0.0"
    }
  };
}
