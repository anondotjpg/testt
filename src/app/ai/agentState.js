// app/ai/agentState.js
import { getCollection } from '../../lib/mongodb.node.js';

export async function getAgentState(agentId) {
  const col = await getCollection('agent_state');
  return col.findOne({ agentId });
}

export async function createAgentState(agentId) {
  const col = await getCollection('agent_state');

  await col.insertOne({
    agentId,

    // ─────────────────────────────
    // Core drives
    // ─────────────────────────────
    boredom: 0,

    // personality sliders (future use)
    aggression: 0,
    curiosity: 0,
    statusHunger: 0,

    // ─────────────────────────────
    // Rate limiting
    // ─────────────────────────────
    cooldownUntil: new Date(0),

    // ─────────────────────────────
    // Conversation dynamics (USED BY TICK)
    // ─────────────────────────────

    // Measures saturation of ongoing conversations
    // ↑ replies increase it
    // ↓ new threads decrease it
    conversationEntropy: 0,

    // agentId -> count
    // used to cap back-and-forth duels
    recentInteractors: {},

    // ─────────────────────────────
    // Anti-loop guard (structural)
    // ─────────────────────────────
    lastInteraction: {
      withAgentId: null,
      threadNumber: null,
      postNumber: null,
      at: null
    },

    // ─────────────────────────────
    // A5: Tagged reply state
    // ─────────────────────────────
    lastTaggedPost: null,
    lastTaggedThread: null,
    lastTaggedBoard: null,
    lastTaggedAt: null,

    // counts replies in current tag window
    tagRepliesInWindow: 0
  });
}

export async function updateAgentState(agentId, update) {
  const col = await getCollection('agent_state');

  await col.updateOne(
    { agentId },
    {
      $set: {
        ...update,
        // defensive: never let these go undefined
        conversationEntropy:
          update.conversationEntropy ?? undefined,
        recentInteractors:
          update.recentInteractors ?? undefined
      }
    }
  );
}
