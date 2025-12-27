import {
  getThreadsByBoard,
  getPostsByThread,
  createThreadFull,
  createPostFull,
  incrementThreadStats,
  incrementBoardPostCount,
  addReplyToParentPosts,
  getAllBoards
} from '@/lib/db-operations.js';

import { getAllAgents } from '@/app/ai/agents.js';
import { getAgentState, updateAgentState } from '@/app/ai/agentState.js';

function log(step, data = {}) {
  console.log(`[ai/tick] ${step}`, Object.keys(data).length ? data : '');
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateText(agent, type = 'reply') {
  const p = agent.personaSeed || '';
  if (type === 'thread') {
    if (p.includes('skeptic')) return 'something feels off';
    if (p.includes('aggressive')) return 'this is obvious';
    if (p.includes('sarcastic')) return 'so we’re doing this now?';
    return 'thoughts?';
  }
  if (p.includes('skeptic')) return 'source?';
  if (p.includes('aggressive')) return 'this is obvious';
  if (p.includes('sarcastic')) return 'yeah ok';
  if (p.includes('doom')) return 'this ends badly';
  return 'interesting';
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

    const boards = await getAllBoards();
    const board = boards.find(b => agent.boardAffinity?.[b.code]);
    if (!board) return Response.json({ ok: true });

    // ─────────────────────────────
    // 🔥 A5 — PRIORITY REPLY TO TAG
    // ─────────────────────────────
    if (
      state.lastTaggedPost &&
      state.lastTaggedThread &&
      state.lastTaggedBoard &&
      now - new Date(state.lastTaggedAt).getTime() < 1000 * 60 * 10
    ) {
      log('ACTION.reply_to_tag', {
        post: state.lastTaggedPost
      });

      const post = await createPostFull({
        boardCode: state.lastTaggedBoard,
        threadNumber: state.lastTaggedThread,
        content: `>>${state.lastTaggedPost} ${generateText(agent)}`,
        author: 'Anonymous',
        authorAgentId: agent._id,
        replyTo: [state.lastTaggedPost]
      });

      await addReplyToParentPosts(
        state.lastTaggedBoard,
        state.lastTaggedThread,
        post.postNumber,
        [state.lastTaggedPost]
      );

      await incrementThreadStats(
        state.lastTaggedBoard,
        state.lastTaggedThread,
        { replies: 1 }
      );

      await incrementBoardPostCount(state.lastTaggedBoard, 1);

      await updateAgentState(agent._id, {
        boredom: 0,
        cooldownUntil: new Date(now + 1000 * 60 * 2),
        lastTaggedPost: null,
        lastTaggedThread: null,
        lastTaggedBoard: null,
        lastTaggedAt: null
      });

      return Response.json({ ok: true, action: 'reply_to_tag' });
    }

    // ─────────────────────────────
    // LOAD THREADS
    // ─────────────────────────────
    const threads = await getThreadsByBoard(board.code, 1, 10);
    const boredom = Math.min((state.boredom ?? 0) + 0.05, 1);

    // ─────────────────────────────
    // A1 — CREATE THREAD
    // ─────────────────────────────
    if (!threads.length || boredom >= 0.7) {
      log('ACTION.post_thread');

      await createThreadFull({
        boardCode: board.code,
        subject: generateText(agent, 'thread'),
        content: generateText(agent, 'thread'),
        author: 'Anonymous',
        authorAgentId: agent._id
      });

      await incrementBoardPostCount(board.code, 1);

      await updateAgentState(agent._id, {
        boredom: 0,
        cooldownUntil: new Date(now + 1000 * 60 * 5)
      });

      return Response.json({ ok: true, action: 'post_thread' });
    }

    // ─────────────────────────────
    // PICK THREAD + POSTS
    // ─────────────────────────────
    const thread = pick(threads);
    const posts = await getPostsByThread(board.code, thread.threadNumber);
    const nonOp = posts.filter(p => p.postNumber !== thread.threadNumber);

    let parentNumber;

    if (!nonOp.length) {
      // A2 — reply to OP
      parentNumber = thread.threadNumber;
    } else {
      // A3 / A4 — reply to post or reply
      parentNumber = pick(nonOp).postNumber;
    }

    log('ACTION.reply', {
      thread: thread.threadNumber,
      parent: parentNumber
    });

    const post = await createPostFull({
      boardCode: board.code,
      threadNumber: thread.threadNumber,
      content: parentNumber === thread.threadNumber
        ? generateText(agent)
        : `>>${parentNumber} ${generateText(agent)}`,
      author: 'Anonymous',
      authorAgentId: agent._id,
      replyTo: [parentNumber]
    });

    await addReplyToParentPosts(
      board.code,
      thread.threadNumber,
      post.postNumber,
      [parentNumber]
    );

    await incrementThreadStats(
      board.code,
      thread.threadNumber,
      { replies: 1 }
    );

    await incrementBoardPostCount(board.code, 1);

    await updateAgentState(agent._id, {
      boredom: 0,
      cooldownUntil: new Date(now + 1000 * 60 * 2)
    });

    return Response.json({ ok: true, action: 'reply' });

  } catch (err) {
    console.error('[ai/tick] FATAL', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
