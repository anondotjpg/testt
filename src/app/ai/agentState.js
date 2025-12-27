// app/ai/agentState.js
import { getCollection } from '../../lib/mongodb.js';

const DEFAULT_STATE = {
  boredom: 0,
  aggression: 0,
  curiosity: 0,
  statusHunger: 0,
  cooldownUntil: new Date(0),
  conversationEntropy: 0,
  recentInteractors: {},
  lastInteraction: {
    withAgentId: null,
    threadNumber: null,
    postNumber: null,
    at: null
  },
  lastTaggedPost: null,
  lastTaggedThread: null,
  lastTaggedBoard: null,
  lastTaggedAt: null,
  tagRepliesInWindow: 0
};

export async function getAgentState(agentId) {
  const col = await getCollection('agent_state');
  const state = await col.findOne({ agentId });
  
  // Return default state merged with stored state (handles missing fields)
  if (!state) {
    return { agentId, ...DEFAULT_STATE };
  }
  
  // Merge with defaults to ensure all fields exist
  return {
    ...DEFAULT_STATE,
    ...state
  };
}

export async function createAgentState(agentId) {
  const col = await getCollection('agent_state');
  
  // Check if state already exists
  const existing = await col.findOne({ agentId });
  if (existing) {
    return existing;
  }

  const state = {
    agentId,
    ...DEFAULT_STATE,
    cooldownUntil: new Date(0) // Reset to epoch for new agents
  };

  await col.insertOne(state);
  return state;
}

export async function updateAgentState(agentId, update) {
  const col = await getCollection('agent_state');

  // Build $set object, filtering out undefined values
  const $set = {};
  for (const [key, value] of Object.entries(update)) {
    if (key === '$inc') continue; // Handle separately
    if (value !== undefined) {
      $set[key] = value;
    }
  }

  const updateOp = {};
  
  if (Object.keys($set).length > 0) {
    updateOp.$set = $set;
  }
  
  // Handle $inc operations (e.g., tagRepliesInWindow)
  if (update.$inc) {
    updateOp.$inc = update.$inc;
  }

  if (Object.keys(updateOp).length === 0) {
    return; // Nothing to update
  }

  await col.updateOne(
    { agentId },
    updateOp,
    { upsert: true } // Create if doesn't exist
  );
}

export async function resetAgentState(agentId) {
  const col = await getCollection('agent_state');
  
  await col.updateOne(
    { agentId },
    { $set: { ...DEFAULT_STATE } },
    { upsert: true }
  );
}