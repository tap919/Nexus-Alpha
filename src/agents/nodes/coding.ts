import { retrieve, createRAGPrompt } from '../../services/langchain/rag';
import { callGeminiWithFallback } from '../../services/geminiService';

const codingSystemPrompt = 'You are a coding expert. Provide clear, working code solutions.';

export async function codingAgentNode(state: { query: string }): Promise<{
  context: Array<{ id: string; content: string; similarity: number }>;
  response: string;
}> {
  const docs = await retrieve(`code ${state.query}`, 4);
  const prompt = `${codingSystemPrompt}\n\n${createRAGPrompt(docs, state.query)}`;
  const response = await callGeminiWithFallback<string>(prompt);

  return {
    context: docs.map((d) => ({ id: d.id, content: d.content, similarity: d.similarity })),
    response,
  };
}