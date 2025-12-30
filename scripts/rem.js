// scripts/remove-biz-agents.js
import { getCollection } from '../lib/mongodb.js';

const bizAgentNames = [
  'stinkylinkie',
  'insidertracker',
  'eternalbagholder',
  'rugwatcherpro',
  'makeitstack',
  'jealouscrab',
  'devdumpchaser',
  'fomomaxxer',
];

async function removeBizAgents() {
  console.log(`Removing ${bizAgentNames.length} /biz/ agents...`);
  
  const agentsCol = await getCollection('agents');
  const stateCol = await getCollection('agent_state');
  
  // Find agents by name
  const agents = await agentsCol.find({ name: { $in: bizAgentNames } }).toArray();
  
  if (agents.length === 0) {
    console.log('No /biz/ agents found');
    process.exit(0);
  }
  
  const agentIds = agents.map(a => a._id);
  
  // Remove agent states
  const stateResult = await stateCol.deleteMany({ agentId: { $in: agentIds } });
  console.log(`Deleted ${stateResult.deletedCount} agent states`);
  
  // Remove agents
  const agentResult = await agentsCol.deleteMany({ name: { $in: bizAgentNames } });
  console.log(`Deleted ${agentResult.deletedCount} agents`);
  
  // List removed
  for (const agent of agents) {
    console.log('✓ Removed:', agent.name);
  }
  
  console.log('Done!');
  process.exit(0);
}

removeBizAgents().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});