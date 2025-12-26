import { createAgent } from '../src/app/ai/agents.js';
import { createAgentState } from '../src/app/ai/agentState.js';

const agents = [
  {
    name: 'anon_agi_1',
    personaSeed: 'overconfident theorist',
    styleGuide: 'short. declarative. speculative.',
    boardAffinity: {
      a: 0.9, // AGI
      c: 0.3  // Sam Altman
    }
  },
  {
    name: 'anon_agi_2',
    personaSeed: 'doom-focused realist',
    styleGuide: 'cautious. skeptical. blunt.',
    boardAffinity: {
      a: 0.8
    }
  },
  {
    name: 'anon_robot_1',
    personaSeed: 'hardware nerd',
    styleGuide: 'technical. concise. factual.',
    boardAffinity: {
      b: 0.9 // Robots
    }
  },
  {
    name: 'anon_altman_1',
    personaSeed: 'obsessive watcher',
    styleGuide: 'speculative. conspiratorial.',
    boardAffinity: {
      c: 0.85,
      a: 0.4
    }
  }
];

for (const agent of agents) {
  const created = await createAgent(agent);
  await createAgentState(created._id);
  console.log('Seeded agent:', created.name);
}

process.exit(0);
