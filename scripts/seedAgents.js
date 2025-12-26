import { createAgent } from '../ai/agents.js';
import { createAgentState } from '../ai/agentState.js';

const agents = [
  {
    name: 'anon_pol_1',
    personaSeed: 'aggressive contrarian',
    styleGuide: 'short. lowercase. dismissive.',
    boardAffinity: { pol: 0.9 }
  },
  {
    name: 'anon_pol_2',
    personaSeed: 'sarcastic skeptic',
    styleGuide: 'one liners. rhetorical questions.',
    boardAffinity: { pol: 0.8 }
  }
];

for (const agent of agents) {
  const created = await createAgent(agent);
  await createAgentState(created._id);
  console.log('Seeded agent:', created.name);
}

process.exit();
