import { retrieve, createRAGPrompt } from '../../services/langchain/rag';
import { callGeminiWithFallback } from '../../services/geminiService';

const analysisSystemPrompt = 'You are a data analysis expert. Provide insights and calculations.';

export async function analysisAgentNode(state: { query: string }): Promise<{
  context: Array<{ id: string; content: string; similarity: number }>;
  response: string;
}> {
  const docs = await retrieve(`analytics metrics ${state.query}`, 4);
  const prompt = `${analysisSystemPrompt}\n\n${createRAGPrompt(docs, state.query)}`;
  const response = await callGeminiWithFallback<string>(prompt);

  return {
    context: docs.map((d) => ({ id: d.id, content: d.content, similarity: d.similarity })),
    response,
  };
}