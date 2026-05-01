import { runAgentGraph } from './src/agents/graph';

async function testAgent() {
  console.log('=== Testing LangGraph Agent ===\n');

  const testQueries = [
    'How does useState work in React?',
    'What is Supabase?',
    'Explain TypeScript interfaces',
  ];

  for (const query of testQueries) {
    console.log(`Query: "${query}"`);
    try {
      const result = await runAgentGraph(query);
      console.log(`  Intent: ${result.intent}`);
      console.log(`  Response: ${result.response.substring(0, 100)}...`);
      console.log(`  Sources: ${result.sources.length}`);
    } catch (e) {
      console.log(`  ✗ Error: ${e}`);
    }
    console.log('');
  }

  console.log('=== Agent Tests Complete ===\n');
}

testAgent().catch(console.error);