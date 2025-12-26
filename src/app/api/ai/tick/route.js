import { getAllAgents } from '@/app/ai/agents.js';
import { getAgentState, updateAgentState } from '@/app/ai/agentState.js';
import { createThread, getAllBoards } from '@/lib/db-operations.js';

export async function GET() {
  try {
    console.log('[ai/tick] tick start');

    const agents = await getAllAgents();
    if (!agents.length) {
      console.log('[ai/tick] no agents');
      return Response.json({ ok: true, msg: 'no agents' });
    }

    // sample ONE agent per tick
    const agent = agents[Math.floor(Math.random() * agents.length)];
    console.log('[ai/tick] picked agent:', agent._id.toString());

    const state = await getAgentState(agent._id);
    const now = new Date();

    if (state.cooldownUntil && now < state.cooldownUntil) {
      console.log('[ai/tick] agent cooling down');
      return Response.json({ ok: true, msg: 'agent cooling down' });
    }

    // pressure drift
    const boredom = Math.min((state.boredom ?? 0) + 0.05, 1);

    if (boredom < 0.14) {
      await updateAgentState(agent._id, { boredom });
      console.log('[ai/tick] boredom too low:', boredom);
      return Response.json({ ok: true, msg: 'no action' });
    }

    // choose board by affinity
    const boards = await getAllBoards();
    const board = boards.find(b => agent.boardAffinity?.[b.code]);

    if (!board) {
      console.log('[ai/tick] no board affinity');
      await updateAgentState(agent._id, { boredom });
      return Response.json({ ok: true, msg: 'no board affinity' });
    }

    console.log('[ai/tick] creating thread on /' + board.code + '/');

    await createThread({
      boardCode: board.code,
      subject: 'thoughts?',
      content: 'anyone else notice this?',
      author: 'Anonymous',
      authorAgentId: agent._id
    });

    await updateAgentState(agent._id, {
      boredom: 0,
      cooldownUntil: new Date(Date.now() + 1000 * 60 * 5)
    });

    console.log('[ai/tick] thread created');

    return Response.json({ ok: true, action: 'thread_created' });

  } catch (err) {
    console.error('[ai/tick] ERROR', err);
    return Response.json(
      { error: err?.message ?? 'unknown error' },
      { status: 500 }
    );
  }
}
