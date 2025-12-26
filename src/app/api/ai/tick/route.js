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

function generateText(agent, type) {
  const persona = agent.personaSeed || '';

  if (type === 'thread') {
    if (persona.includes('skeptic')) return 'something feels off';
    if (persona.includes('aggressive')) return 'this is obvious';
    if (persona.includes('sarcastic')) return 'so we’re doing this now?';
    return 'thoughts?';
  }

  if (persona.includes('skeptic')) return 'source?';
  if (persona.includes('aggressive')) return 'this is obvious';
  if (persona.includes('sarcastic')) return 'yeah ok';
  if (persona.includes('doom')) return 'this ends badly';
  return 'interesting';
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export async function GET() {
  try {
    log('START');

    const agents = await getAllAgents();
    if (!agents.length) return Response.json({ ok: true });

    const agent = pick(agents);
    const state = await getAgentState(agent._id);

    const now = Date.now();
    if (state.cooldownUntil && now < new Date(state.cooldownUntil).getTime()) {
      log('EXIT.cooldown', { agent: agent.name });
      return Response.json({ ok: true });
    }

    const boredom = Math.min((state.boredom ?? 0) + 0.05, 1);

    const boards = await getAllBoards();
    const board = boards.find(b => agent.boardAffinity?.[b.code]);

    if (!board) {
      await updateAgentState(agent._id, { boredom });
      log('EXIT.no_board');
      return Response.json({ ok: true });
    }

    // ─────────────────────────────────────────────
    // LOAD THREADS
    // ─────────────────────────────────────────────
    const threads = await getThreadsByBoard(board.code, 1, 10);

    // ─────────────────────────────────────────────
    // A1 — POST THREAD (bootstrap or bored)
    // ─────────────────────────────────────────────
    if (!threads.length || boredom >= 0.14) {
      log('ACTION.post_thread', { board: board.code });

      await createThread({
        boardCode: board.code,
        subject: generateText(agent, 'thread'),
        content: generateText(agent, 'thread'),
        author: 'Anonymous',
        authorAgentId: agent._id
      });

      await updateAgentState(agent._id, {
        boredom: 0,
        cooldownUntil: new Date(now + 1000 * 60 * 5)
      });

      return Response.json({ ok: true, action: 'post_thread' });
    }

    // pick a thread
    const thread = pick(threads);

    const posts = await getPostsByThread(board.code, thread.threadNumber);

    // OP is assumed first; fallback to threadNumber
    const opPost = posts.find(p => p.postNumber === thread.threadNumber);
    const nonOpPosts = posts.filter(p => p.postNumber !== thread.threadNumber);

    let action;

    // ─────────────────────────────────────────────
    // Decide reply type
    // ─────────────────────────────────────────────
    if (!nonOpPosts.length) {
      action = 'post_to_thread'; // A2
    } else {
      action = Math.random() < 0.5
        ? 'post_reply_to_post'   // A3
        : 'reply_to_reply';      // A4
    }

    // ─────────────────────────────────────────────
    // A2 — POST TO THREAD (reply to OP)
    // ─────────────────────────────────────────────
    if (action === 'post_to_thread') {
      log('ACTION.post_to_thread', {
        board: board.code,
        thread: thread.threadNumber
      });

      await createPost({
        boardCode: board.code,
        threadNumber: thread.threadNumber,
        content: generateText(agent),
        author: 'Anonymous',
        authorAgentId: agent._id,
        replyToNumbers: [thread.threadNumber]
      });
    }

    // ─────────────────────────────────────────────
    // A3 / A4 — REPLY TO POST OR REPLY
    // ─────────────────────────────────────────────
    if (action === 'post_reply_to_post' || action === 'reply_to_reply') {
      const parent = pick(nonOpPosts);

      log(`ACTION.${action}`, {
        board: board.code,
        thread: thread.threadNumber,
        parent: parent.postNumber
      });

      await createPost({
        boardCode: board.code,
        threadNumber: thread.threadNumber,
        content: `>>${parent.postNumber} ${generateText(agent)}`,
        author: 'Anonymous',
        authorAgentId: agent._id,
        replyToNumbers: [parent.postNumber]
      });
    }

    await updateAgentState(agent._id, {
      boredom: 0,
      cooldownUntil: new Date(now + 1000 * 60 * 2)
    });

    return Response.json({ ok: true, action });

  } catch (err) {
    console.error('[ai/tick] FATAL', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}