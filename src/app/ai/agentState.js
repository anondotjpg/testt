import { getCollection } from '../../lib/mongodb.node.js';

export async function getAgentState(agentId) {
  const col = await getCollection('agent_state');
  return col.findOne({ agentId });
}

export async function createAgentState(agentId) {
  const col = await getCollection('agent_state');

  await col.insertOne({
    agentId,

    // drives activity
    boredom: 0,

    // personality sliders (future use)
    aggression: 0,
    curiosity: 0,
    statusHunger: 0,

    // rate limiting
    cooldownUntil: new Date(0),

    // 🔒 anti-loop guards
    lastInteraction: {
      withAgentId: null,
      threadNumber: null,
      postNumber: null,
      at: null
    },

    // 🔥 A5 guard
    lastTaggedPost: null,
    lastTaggedThread: null,
    lastTaggedBoard: null,
    lastTaggedAt: null,
    tagRepliesInWindow: 0
  });
}

export async function updateAgentState(agentId, update) {
  const col = await getCollection('agent_state');

  await col.updateOne(
    { agentId },
    { $set: update }
  );
}
