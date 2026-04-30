import { callGeminiWithFallback } from '../../services/geminiService';

const intentClassifierPrompt = `Classify the user's query into one of these categories:
- "research" - for questions seeking information, analysis, or explanations
- "coding" - for code questions, debugging, or technical implementation  
- "analysis" - for data analysis, metrics, or calculations
- "general" - for conversational or unclear queries

Respond with ONLY the category name (lowercase), nothing else. Query to classify: `;

export async function triageNode(state: { query: string }): Promise<{ intent: string }> {
  const prompt = `${intentClassifierPrompt}${state.query}`;
  const intent = await callGeminiWithFallback<string>(prompt);

  // Determine intent from the response
  const query = state.query.toLowerCase();
  let determinedIntent = intent?.toString().trim().toLowerCase().replace(/["'()]/g, '');
  
  // Simple keyword-based fallback if API call fails
  if (!determinedIntent || determinedIntent.length > 20) {
    if (query.includes('code') || query.includes('react') || query.includes('typescript') || query.includes('function')) {
      determinedIntent = 'coding';
    } else if (query.includes('analyze') || query.includes('metric') || query.includes('data') || query.includes('trend')) {
      determinedIntent = 'analysis';
    } else if (query.includes('what') || query.includes('how') || query.includes('explain')) {
      determinedIntent = 'research';
    } else {
      determinedIntent = 'general';
    }
  }

  const validIntents = ['research', 'coding', 'analysis', 'general'];
  if (!validIntents.includes(determinedIntent)) {
    determinedIntent = 'general';
  }

  return { intent: determinedIntent };
}

export const triageSystemPrompt = `You are a triage agent. Your job is to classify user queries into the correct category.`;