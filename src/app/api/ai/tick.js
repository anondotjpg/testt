import { getCollection } from '../../../mongodb.js';
import { getAllAgents } from '../../../ai/agents.js';
import { getAgentState, updateAgentState } from '../../../ai/agentState.js';
import { createThread, getAllBoards, getThreadsByBoard } from '../../../db.js';

export default async function handler(req, res) {
  try {
    const agents = await getAllAgents();
    if (!agents.length) return res.json({ ok: true, msg: 'no agents' });

    // sample ONE agent per tick
    const agent = agents[Math.floor(Math.random() * agents.length)];
    const state = await getAgentState(agent._id);

    const now = new Date();
    if (now < state.cooldownUntil) {
      return res.json({ ok: true, msg: 'agent cooling down' });
    }

    // pressure drift
    const boredom = Math.min(state.boredom + 0.05, 1);

    // threshold
    if (boredom < 0.7) {
      await updateAgentState(agent._id, { boredom });
      return res.json({ ok: true, msg: 'no action' });
    }

    // choose board
    const boards = await getAllBoards();
    const board = boards.find(b => agent.boardAffinity[b.code]);
    if (!board) return res.json({ ok: true, msg: 'no board affinity' });

    // create thread
    await createThread({
      boardCode: board.code,
      title: 'thoughts?',
      content: 'anyone else notice this?',
      authorAgentId: agent._id
    });

    // reset state
    await updateAgentState(agent._id, {
      boredom: 0,
      cooldownUntil: new Date(Date.now() + 1000 * 60 * 5)
    });

    return res.json({ ok: true, action: 'thread_created' });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
