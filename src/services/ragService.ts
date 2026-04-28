/**
 * Nexus Alpha RAG (Retrieval-Augmented Generation) Service
 * In-browser vector store using cosine similarity for agent memory.
 * For production scale, replace vectorStore with LanceDB or Chroma via the backend.
 */

import { GoogleGenAI } from "@google/genai";
import type { RAGContext } from "../types";

const MODEL_EMBED = "text-embedding-004";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface Document {
  id: string;
  content: string;
  metadata: {
    source: string;
    agentId?: string;
    timestamp: string;
    type: "repo" | "build_log" | "analysis" | "user_note" | "news";
  };
  embedding?: number[];
}

// ─── In-memory Vector Store ───────────────────────────────────────────────────────

const vectorStore = new Map<string, Document>();
let lastSync = new Date().toISOString();

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] ** 2;
    magB += b[i] ** 2;
  }
  const mag = Math.sqrt(magA) * Math.sqrt(magB);
  return mag === 0 ? 0 : dot / mag;
}

// ─── Embedding ───────────────────────────────────────────────────────────────────
async function embedText(text: string, apiKey: string): Promise<number[]> {
  const ai = new GoogleGenAI({ apiKey });
  const result = await ai.models.embedContent({
    model: MODEL_EMBED,
    contents: text,
  });
  return result.embeddings?.[0]?.values ?? [];
}

// ─── Public API ──────────────────────────────────────────────────────────────────

/** Index a document into the vector store */
export async function indexDocument(
  doc: Omit<Document, "embedding">,
  apiKey: string
): Promise<void> {
  const embedding = await embedText(doc.content, apiKey);
  vectorStore.set(doc.id, { ...doc, embedding });
  lastSync = new Date().toISOString();
}

/** Index multiple documents in parallel (batched to avoid rate limits) */
export async function indexDocuments(
  docs: Omit<Document, "embedding">[],
  apiKey: string,
  batchSize = 5
): Promise<void> {
  for (let i = 0; i < docs.length; i += batchSize) {
    const batch = docs.slice(i, i + batchSize);
    await Promise.all(batch.map((d) => indexDocument(d, apiKey)));
    if (i + batchSize < docs.length) {
      await new Promise((r) => setTimeout(r, 200)); // rate limit pause
    }
  }
}

/** Search the vector store for the top-k most relevant documents */
export async function search(
  query: string,
  apiKey: string,
  topK = 5
): Promise<Array<{ document: Document; score: number }>> {
  if (vectorStore.size === 0) return [];

  const queryEmbedding = await embedText(query, apiKey);
  const results: Array<{ document: Document; score: number }> = [];

  for (const doc of vectorStore.values()) {
    if (!doc.embedding) continue;
    const score = cosineSimilarity(queryEmbedding, doc.embedding);
    results.push({ document: doc, score });
  }

  return results.sort((a, b) => b.score - a.score).slice(0, topK);
}

/** Get RAGContext summary for dashboard */
export function getRAGContext(): RAGContext {
  const docs = Array.from(vectorStore.values());
  return {
    indexedDocs: docs.length,
    relevantSnippets: docs
      .slice(-5)
      .map((d) => `[${d.metadata.type}] ${d.content.slice(0, 100)}...`),
    lastSync,
  };
}

/** Clear all indexed documents */
export function clearIndex(): void {
  vectorStore.clear();
  lastSync = new Date().toISOString();
}

/** Get all documents (for debugging) */
export function getAllDocuments(): Document[] {
  return Array.from(vectorStore.values());
}
