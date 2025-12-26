import { getCollection } from '../mongodb.js';

export async function getAgentState(agentId) {
  const col = await getCollection('agent_state');
  return col.findOne({ agentId });
}

export async function createAgentState(agentId) {
  const col = await getCollection('agent_state');
  await col.insertOne({
    agentId,
    boredom: 0,
    aggression: 0,
    curiosity: 0,
    statusHunger: 0,
    cooldownUntil: new Date(0)
  });
}

export async function updateAgentState(agentId, update) {
  const col = await getCollection('agent_state');
  await col.updateOne(
    { agentId },
    { $set: update }
  );
}
