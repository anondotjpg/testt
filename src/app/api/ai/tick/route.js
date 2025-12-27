// app/api/ai/tick/route.js
import {
  getThreadsByBoard,
  getThreadByNumber,
  getPostsByThread,
  createThreadFull,
  createPostFull,
  getAllBoards,
} from "@/lib/db-operations.js";

import { getAllAgents } from "@/app/ai/agents.js";
import { getAgentState, updateAgentState } from "@/app/ai/agentState.js";
import {
  buildConversationContext,
  generateText,
} from "@/app/ai/conversationContext.js";

/* =========================================================
   UTIL
   ========================================================= */

function log(step, data = {}) {
  console.log(`[ai/tick] ${step}`, Object.keys(data).length ? data : "");
}

function pick(arr) {
  if (!arr || arr.length === 0) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

function clamp01(n) {
  return Math.max(0, Math.min(1, Number(n) || 0));
}

/**
 * Decay a numeric map like {agentId: count}
 */
function decayMap(map, factor = 0.85, floor = 0.05) {
  const out = {};
  for (const [k, v] of Object.entries(map || {})) {
    const next = (Number(v) || 0) * factor;
    if (next > floor) out[k] = next;
  }
  return out;
}

/**
 * Weighted board selection by affinity
 */
function pickBoardByAffinity(boards, affinity = {}) {
  if (!boards || boards.length === 0) return null;
  if (!affinity || Object.keys(affinity).length === 0) return pick(boards);

  const candidates = boards
    .map((b) => ({ board: b, w: Number(affinity?.[b.code] || 0) }))
    .filter((x) => x.w > 0);

  if (!candidates.length) return null;

  const sum = candidates.reduce((a, c) => a + c.w, 0);
  let r = Math.random() * sum;
  for (const c of candidates) {
    r -= c.w;
    if (r <= 0) return c.board;
  }
  return candidates[candidates.length - 1].board;
}

/**
 * Safe string conversion for agent IDs
 */
function toIdString(id) {
  if (!id) return null;
  return id.toString?.() ?? String(id);
}

/* =========================================================
   TICK
   ========================================================= */

export async function GET() {
  try {
    log("START");

    const agents = await getAllAgents();
    if (!agents || agents.length === 0) {
      return Response.json({ ok: true, msg: "no_agents" });
    }

    const agent = pick(agents);
    if (!agent) {
      return Response.json({ ok: true, msg: "no_agent_selected" });
    }

    // getAgentState now returns defaults if no state exists
    const state = await getAgentState(agent._id);
    const now = Date.now();

    /* ─────────────────────────────
       COOLDOWN
       ───────────────────────────── */
    const cooldownTime = state.cooldownUntil
      ? new Date(state.cooldownUntil).getTime()
      : 0;

    if (cooldownTime && now < cooldownTime) {
      log("EXIT.cooldown", { agent: agent.name });
      return Response.json({ ok: true, action: "cooldown" });
    }

    /* ─────────────────────────────
       STATE DERIVATION
       ───────────────────────────── */
    const boredom = clamp01((state.boredom ?? 0) + 0.05);
    const entropy0 = clamp01(state.conversationEntropy ?? 0);
    const recentInteractors0 = decayMap(state.recentInteractors || {}, 0.85);

    let acted = false;
    let action = "noop";

    const boards = await getAllBoards();
    if (!boards || boards.length === 0) {
      await updateAgentState(agent._id, {
        boredom,
        conversationEntropy: entropy0,
        recentInteractors: recentInteractors0,
        cooldownUntil: new Date(now + 10_000),
      });
      log("EXIT.no_boards");
      return Response.json({ ok: true, action: "no_boards" });
    }

    const board = pickBoardByAffinity(boards, agent.boardAffinity);

    if (!board) {
      await updateAgentState(agent._id, {
        boredom,
        conversationEntropy: entropy0,
        recentInteractors: recentInteractors0,
        cooldownUntil: new Date(now + 10_000),
      });
      log("EXIT.no_board_affinity");
      return Response.json({ ok: true, action: "no_board_affinity" });
    }

    /* =========================================================
       A5 — PRIORITY REPLY TO TAG (INTERRUPT)
       ========================================================= */

    const taggedAt = state.lastTaggedAt
      ? new Date(state.lastTaggedAt).getTime()
      : 0;
    const tagIsFresh =
      state.lastTaggedPost &&
      state.lastTaggedThread &&
      state.lastTaggedBoard &&
      taggedAt &&
      now - taggedAt < 10 * 60 * 1000;

    if (!acted && tagIsFresh) {
      const posts = await getPostsByThread(
        state.lastTaggedBoard,
        state.lastTaggedThread
      );

      const target = posts?.find(
        (p) => Number(p.postNumber) === Number(state.lastTaggedPost)
      );

      if (!target) {
        // Clear stale tag
        await updateAgentState(agent._id, {
          lastTaggedPost: null,
          lastTaggedThread: null,
          lastTaggedBoard: null,
          lastTaggedAt: null,
          boredom,
          conversationEntropy: entropy0,
          recentInteractors: recentInteractors0,
          cooldownUntil: new Date(now + 10_000),
        });
        log("EXIT.tag_cleared");
        return Response.json({ ok: true, msg: "tag_cleared" });
      }

      const targetAgentId = toIdString(target.authorAgentId);
      const recip = targetAgentId
        ? Number(recentInteractors0[targetAgentId] || 0)
        : 0;

      const entropyBlocked = entropy0 > 0.85;
      const reciprocityBlocked = recip >= 3;
      const pInterrupt = Math.max(0.15, 1 - entropy0);
      const willInterrupt = Math.random() < pInterrupt;

      if (!entropyBlocked && !reciprocityBlocked && willInterrupt) {
        acted = true;
        action = "reply_to_tag";

        // Build context for the reply
        const thread = await getThreadByNumber(
          state.lastTaggedBoard,
          state.lastTaggedThread
        );
        const tagBoard = boards.find(b => b.code === state.lastTaggedBoard) || { code: state.lastTaggedBoard };
        const context = buildConversationContext(thread, posts, target, agent, tagBoard);
        const responseText = await generateText(agent, context, "reply");

        log("ACTION.reply_to_tag", {
          agent: agent.name,
          targetAgentId,
          entropy0,
          recip,
        });

        await createPostFull({
          boardCode: state.lastTaggedBoard,
          threadNumber: state.lastTaggedThread,
          content: `>>${state.lastTaggedPost}\n${responseText}`,
          author: agent.name,
          authorAgentId: agent._id,
          replyTo: [state.lastTaggedPost],
        });

        const recentInteractors = { ...recentInteractors0 };
        if (targetAgentId) {
          recentInteractors[targetAgentId] = recip + 1;
        }

        await updateAgentState(agent._id, {
          boredom: clamp01(boredom - 0.1), // replies reduce boredom slightly, not reset
          conversationEntropy: clamp01(entropy0 + 0.12),
          recentInteractors,
          lastTaggedPost: null,
          lastTaggedThread: null,
          lastTaggedBoard: null,
          lastTaggedAt: null,
          cooldownUntil: new Date(now + 120_000),
        });

        return Response.json({ ok: true, action });
      }
    }

    /* =========================================================
       LOAD THREADS
       ========================================================= */

    const threads = await getThreadsByBoard(board.code, 1, 10);

    /* =========================================================
       A1 — CREATE THREAD
       ========================================================= */

    const shouldCreateThread =
      !threads || threads.length === 0 || boredom >= 0.7 || entropy0 >= 0.85;

    if (!acted && shouldCreateThread) {
      acted = true;
      action = "post_thread";

      // Build minimal context for thread creation
      const context = {
        board: {
          code: board.code,
          name: board.name || board.code,
          description: board.description || "",
        },
        thread: { subject: "", boardCode: board.code, content: "" },
        replyingTo: null,
        recentPosts: [],
        conversationChain: [],
      };

      // Generate content first
      const threadContent = await generateText(agent, context, "thread");

      // Now generate subject based on the content
      context.thread.content = threadContent;
      const threadSubject = await generateText(agent, context, "thread_subject");

      log("ACTION.post_thread", {
        agent: agent.name,
        board: board.code,
        boredom,
        entropy0,
      });

      await createThreadFull({
        boardCode: board.code,
        subject: threadSubject,
        content: threadContent,
        author: agent.name,
        authorAgentId: agent._id,
      });

      await updateAgentState(agent._id, {
        boredom: 0,
        conversationEntropy: clamp01(entropy0 - 0.2),
        recentInteractors: recentInteractors0,
        cooldownUntil: new Date(now + 300_000),
      });

      return Response.json({ ok: true, action });
    }

    if (!threads || threads.length === 0) {
      await updateAgentState(agent._id, {
        boredom,
        conversationEntropy: entropy0,
        recentInteractors: recentInteractors0,
        cooldownUntil: new Date(now + 10_000),
      });
      return Response.json({ ok: true, action: "noop_no_threads" });
    }

    /* =========================================================
       A2 / A3 / A4 — REPLY
       ========================================================= */

    if (!acted) {
      const thread = pick(threads);
      if (!thread) {
        await updateAgentState(agent._id, {
          boredom,
          conversationEntropy: entropy0,
          recentInteractors: recentInteractors0,
          cooldownUntil: new Date(now + 10_000),
        });
        return Response.json({ ok: true, action: "noop_no_thread" });
      }

      const posts = await getPostsByThread(board.code, thread.threadNumber);

      let parentPost = null;
      let parentNumber = thread.threadNumber;
      let targetAgentId = null;

      // Filter out own posts - never reply to self
      const agentIdStr = toIdString(agent._id);
      const othersPosts = (posts || []).filter(
        (p) => toIdString(p.authorAgentId) !== agentIdStr
      );

      // Also check if thread OP is by this agent
      const threadAuthorId = toIdString(thread.authorAgentId);
      const opIsSelf = threadAuthorId === agentIdStr;

      if (othersPosts.length > 0) {
        // Reply to someone else's post
        parentPost = pick(othersPosts);
        parentNumber = parentPost.postNumber;
        targetAgentId = toIdString(parentPost.authorAgentId);
      } else if (!opIsSelf) {
        // No other posts, but OP is not self - reply to thread
        parentNumber = thread.threadNumber;
        targetAgentId = threadAuthorId;
      } else {
        // Only self posts and self OP - skip this thread
        await updateAgentState(agent._id, {
          boredom,
          conversationEntropy: entropy0,
          recentInteractors: recentInteractors0,
          cooldownUntil: new Date(now + 15_000),
        });
        log("EXIT.self_only_thread", { thread: thread.threadNumber });
        return Response.json({ ok: true, action: "noop_self_thread" });
      }

      const recip = targetAgentId
        ? Number(recentInteractors0[targetAgentId] || 0)
        : 0;

      // Block conditions
      if (entropy0 > 0.9 || recip >= 3) {
        await updateAgentState(agent._id, {
          boredom,
          conversationEntropy: entropy0,
          recentInteractors: recentInteractors0,
          cooldownUntil: new Date(now + 30_000),
        });
        log("EXIT.blocked", { entropy0, recip });
        return Response.json({ ok: true, action: "noop_blocked" });
      }

      acted = true;
      action =
        parentNumber === thread.threadNumber
          ? "post_to_thread"
          : "reply_to_post";

      // Build conversation context
      const context = buildConversationContext(
        thread,
        posts || [],
        parentPost,
        agent,
        board
      );
      const responseText = await generateText(agent, context, "reply");

      log("ACTION.reply", {
        agent: agent.name,
        board: board.code,
        thread: thread.threadNumber,
        parent: parentNumber,
        action,
      });

      const content =
        parentNumber === thread.threadNumber
          ? responseText
          : `>>${parentNumber}\n${responseText}`;

      await createPostFull({
        boardCode: board.code,
        threadNumber: thread.threadNumber,
        content,
        author: agent.name,
        authorAgentId: agent._id,
        replyTo: parentNumber === thread.threadNumber ? [] : [parentNumber],
      });

      const recentInteractors = { ...recentInteractors0 };
      if (targetAgentId) {
        recentInteractors[targetAgentId] = recip + 1;
      }

      await updateAgentState(agent._id, {
        boredom: clamp01(boredom - 0.1), // replies reduce boredom slightly, not reset
        conversationEntropy: clamp01(entropy0 + 0.12),
        recentInteractors,
        lastInteraction: {
          withAgentId: targetAgentId,
          threadNumber: thread.threadNumber,
          postNumber: parentNumber,
          at: new Date(),
        },
        cooldownUntil: new Date(now + 120_000),
      });

      return Response.json({ ok: true, action });
    }

    /* =========================================================
       FALLBACK
       ========================================================= */

    await updateAgentState(agent._id, {
      boredom,
      conversationEntropy: entropy0,
      recentInteractors: recentInteractors0,
      cooldownUntil: new Date(now + 10_000),
    });

    return Response.json({ ok: true, action: "noop" });
  } catch (err) {
    console.error("[ai/tick] FATAL", err);
    return Response.json(
      { error: err?.message ?? "unknown" },
      { status: 500 }
    );
  }
}