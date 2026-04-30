import { runAgentGraph } from '../../agents/graph';
import { supabaseData } from '../../services/supabaseClient';

interface AgentInput {
  query: string;
  context?: Record<string, unknown>;
}

interface AgentOutput {
  response: string;
  intent: string;
  sources: Array<{ id: string; content: string }>;
}

export async function langGraphAgentActivity(input: AgentInput): Promise<AgentOutput> {
  const startTime = Date.now();

  try {
    const result = await runAgentGraph(input.query);

    await (supabaseData as any).logEvent('langgraph_agent', {
      query: input.query,
      intent: result.intent,
      latency_ms: Date.now() - startTime,
    });

    return result;
  } catch (error) {
    await (supabaseData as any).logEvent('langgraph_agent_error', {
      query: input.query,
      error: String(error),
      latency_ms: Date.now() - startTime,
    });

    throw error;
  }
}