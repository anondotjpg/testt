import {
  getThreadsByBoard,
  getPostsByThread,
  createThread,
  createPost,
  getAllBoards
} from '@/lib/db-operations.js';

import { getAllAgents } from '@/app/ai/agents.js';
import { getAgentState, updateAgentState } from '@/app/ai/agentState.js';

function log(step, data = {}) {
  console.log(`[ai/tick] ${step}`, Object.keys(data).length ? data : '');
}

function generateReplyText(agent) {
  const persona = agent.personaSeed || '';
  if (persona.includes('skeptic')) return 'source?';
  if (persona.includes('aggressive')) return 'this is obvious';
  if (persona.includes('sarcastic')) return 'yeah ok';
  if (persona.includes('doom')) return 'this ends badly';
  return 'interesting';
}

export async function GET() {
  try {
    log('START');

    const agents = await getAllAgents();
    if (!agents.length) return Response.json({ ok: true });

    const agent = agents[Math.floor(Math.random() * agents.length)];
    const state = await getAgentState(agent._id);

    const now = new Date();
    if (state.cooldownUntil && now < state.cooldownUntil) {
      log('EXIT.cooldown');
      return Response.json({ ok: true });
    }

    const boredom = Math.min((state.boredom ?? 0) + 0.05, 1);
    const action = Math.random() < 0.65 ? 'reply' : 'thread';

    log('agent.selected', {
      agent: agent.name,
      boredom,
      action
    });

    const boards = await getAllBoards();
    const board = boards.find(b => agent.boardAffinity?.[b.code]);

    if (!board) {
      await updateAgentState(agent._id, { boredom });
      log('EXIT.no_board');
      return Response.json({ ok: true });
    }

    // ─────────────────────────────────────────────
    // REPLY PATH
    // ─────────────────────────────────────────────
    if (action === 'reply') {
      const threads = await getThreadsByBoard(board.code, 1, 10);

      const targetThread = threads.find(t =>
        t.replies > 0 &&
        t.replies < 20 &&
        t.authorAgentId?.toString() !== agent._id.toString()
      );

      if (!targetThread) {
        log('reply.no_thread_found');
      } else {
        const posts = await getPostsByThread(board.code, targetThread.threadNumber);
        const parent = posts[posts.length - 1] || targetThread;

        const replyText = generateReplyText(agent);

        await createPost({
          boardCode: board.code,
          threadNumber: targetThread.threadNumber,
          content: replyText,
          author: 'Anonymous',
          authorAgentId: agent._id,
          replyToNumbers: [parent.postNumber ?? targetThread.threadNumber]
        });

        log('reply.created', {
          board: board.code,
          thread: targetThread.threadNumber
        });

        await updateAgentState(agent._id, {
          boredom: 0,
          cooldownUntil: new Date(Date.now() + 1000 * 60 * 2)
        });

        return Response.json({ ok: true, action: 'reply' });
      }
    }

    // ─────────────────────────────────────────────
    // THREAD PATH
    // ─────────────────────────────────────────────
    if (boredom >= 0.7) {
      await createThread({
        boardCode: board.code,
        subject: 'thoughts?',
        content: 'anyone else notice this?',
        author: 'Anonymous',
        authorAgentId: agent._id
      });

      log('thread.created', { board: board.code });

      await updateAgentState(agent._id, {
        boredom: 0,
        cooldownUntil: new Date(Date.now() + 1000 * 60 * 5)
      });

      return Response.json({ ok: true, action: 'thread' });
    }

    await updateAgentState(agent._id, { boredom });
    return Response.json({ ok: true, action: 'noop' });

  } catch (err) {
    console.error('[ai/tick] FATAL', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
