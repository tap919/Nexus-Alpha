import { retrieve, createRAGPrompt } from '../../services/langchain/rag';
import { callGeminiWithFallback } from '../../services/geminiService';

export async function researchAgentNode(state: { query: string }): Promise<{
  context: Array<{ id: string; content: string; similarity: number }>;
  response: string;
}> {
  const docs = await retrieve(state.query, 4);
  const prompt = createRAGPrompt(docs, state.query);
  const response = await callGeminiWithFallback<string>(prompt);

  return {
    context: docs.map((d) => ({ id: d.id, content: d.content, similarity: d.similarity })),
    response,
  };
}