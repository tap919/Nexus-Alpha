import { callGeminiWithFallback } from '../../services/geminiService';

const generalSystemPrompt = 'You are a helpful, conversational AI assistant.';

export async function generalAgentNode(state: { query: string }): Promise<{
  context: Array<{ id: string; content: string; similarity: number }>;
  response: string;
}> {
  const response = await callGeminiWithFallback<string>(`${generalSystemPrompt}\n\nUser: ${state.query}`);

  return {
    context: [],
    response,
  };
}