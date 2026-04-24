/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, Type } from "@google/genai";
import { DashboardData } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function analyzeAIData(): Promise<DashboardData> {
  const prompt = `
    Analyze the current state of AI development (April 2024 onwards) and provide a comprehensive dashboard dataset.
    Focus on predicting future trends in AI development and their potential effects on long-term human interaction, societal growth, and productivity.
    Include:
    1. Overall growth metrics (rate, developers, models).
    2. Sentiment score (-1 to 1).
    3. 5 core predictions for the next 2-5 years with growth % and impact. Ensure at least 2 predictions focus on "Human Interaction" or "Socio-Economic Growth".
    4. 5 recent landmark news items from news, social media, and major events.
    5. 5 trending AI-related GitHub repositories.
    6. Historical growth data for the last 6 months.

    Format the response as a JSON object matching the provided schema.
  `;

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
                  tags: { type: Type.ARRAY, items: { type: Type.STRING } }
                }
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
            }
          },
          required: ["growthRate", "activeDevelopers", "totalModels", "sentimentScore", "predictions", "news", "repos", "growthHistory"]
        }
      }
    });

    const data = JSON.parse(response.text || "{}");
    return data as DashboardData;
  } catch (error) {
    console.error("Error analyzing AI data:", error);
    // Return fallback data if AI fails
    return getFallbackData();
  }
}

function getFallbackData(): DashboardData {
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
      { name: "transformers", stars: 120000, forks: 25000, growth: 12, tags: ["NLP", "LLM"] }
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
    ]
  };
}
