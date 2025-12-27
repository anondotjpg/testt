import {
  getThreadsByBoard,
  getPostsByThread,
  createThreadFull,
  createPostFull,
  getAllBoards,
} from "@/lib/db-operations.js";

import { getAllAgents } from "@/app/ai/agents.js";
import { getAgentState, updateAgentState } from "@/app/ai/agentState.js";

/* =========================================================
   UTIL
   ========================================================= */

function log(step, data = {}) {
  console.log(`[ai/tick] ${step}`, Object.keys(data).length ? data : "");
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function clamp01(n) {
  return Math.max(0, Math.min(1, n));
}

function generateText(agent, type = "reply") {
  const p = agent.personaSeed || "";
  if (type === "thread") {
    if (p.includes("skeptic")) return "something feels off";
    if (p.includes("aggressive")) return "this is obvious";
    if (p.includes("sarcastic")) return "so we’re doing this now?";
    return "thoughts?";
  }
  if (p.includes("skeptic")) return "source?";
  if (p.includes("aggressive")) return "this is obvious";
  if (p.includes("sarcastic")) return "yeah ok";
  if (p.includes("doom")) return "this ends badly";
  return "interesting";
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

/* =========================================================
   TICK
   ========================================================= */

export async function GET() {
  try {
    log("START");

    const agents = await getAllAgents();
    if (!agents.length) return Response.json({ ok: true, msg: "no_agents" });

    const agent = pick(agents);
    const state = await getAgentState(agent._id);
    const now = Date.now();

    /* ─────────────────────────────
       COOLDOWN
       ───────────────────────────── */
    if (state.cooldownUntil && now < new Date(state.cooldownUntil).getTime()) {
      log("EXIT.cooldown", { agent: agent.name });
      return Response.json({ ok: true });
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
    const board = pickBoardByAffinity(boards, agent.boardAffinity);

    if (!board) {
      await updateAgentState(agent._id, {
        boredom,
        conversationEntropy: entropy0,
        recentInteractors: recentInteractors0,
        cooldownUntil: new Date(now + 10_000),
      });
      log("EXIT.no_board");
      return Response.json({ ok: true });
    }

    /* =========================================================
       A5 — PRIORITY REPLY TO TAG (INTERRUPT)
       ========================================================= */

    const tagIsFresh =
      state.lastTaggedPost &&
      state.lastTaggedThread &&
      state.lastTaggedBoard &&
      state.lastTaggedAt &&
      now - new Date(state.lastTaggedAt).getTime() < 10 * 60 * 1000;

    if (!acted && tagIsFresh) {
      const posts = await getPostsByThread(
        state.lastTaggedBoard,
        state.lastTaggedThread
      );

      const target = posts.find(
        (p) => Number(p.postNumber) === Number(state.lastTaggedPost)
      );

      if (!target) {
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
        return Response.json({ ok: true, msg: "tag_cleared" });
      }

      const targetAgentId = target.authorAgentId?.toString() || null;
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

        log("ACTION.reply_to_tag", {
          agent: agent.name,
          targetAgentId,
          entropy0,
          recip,
        });

        await createPostFull({
          boardCode: state.lastTaggedBoard,
          threadNumber: state.lastTaggedThread,
          content: `>>${state.lastTaggedPost} ${generateText(agent)}`,
          author: "Anonymous",
          authorAgentId: agent._id,
          replyTo: [state.lastTaggedPost],
        });

        const recentInteractors = { ...recentInteractors0 };
        if (targetAgentId)
          recentInteractors[targetAgentId] = recip + 1;

        await updateAgentState(agent._id, {
          boredom: 0,
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

    if (
      !acted &&
      (threads.length === 0 || boredom >= 0.7 || entropy0 >= 0.85)
    ) {
      acted = true;
      action = "post_thread";

      log("ACTION.post_thread", {
        agent: agent.name,
        boredom,
        entropy0,
      });

      await createThreadFull({
        boardCode: board.code,
        subject: generateText(agent, "thread"),
        content: generateText(agent, "thread"),
        author: "Anonymous",
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

    if (!threads.length) {
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
      const posts = await getPostsByThread(board.code, thread.threadNumber);

      let parentNumber = thread.threadNumber;
      let targetAgentId = null;

      if (posts.length) {
        const others = posts.filter(
          (p) => p.authorAgentId?.toString() !== agent._id.toString()
        );
        const parent = others.length ? pick(others) : pick(posts);
        parentNumber = parent.postNumber;
        targetAgentId = parent.authorAgentId?.toString() || null;
      }

      const recip = targetAgentId
        ? Number(recentInteractors0[targetAgentId] || 0)
        : 0;

      if (entropy0 > 0.9 || recip >= 3) {
        await updateAgentState(agent._id, {
          boredom,
          conversationEntropy: entropy0,
          recentInteractors: recentInteractors0,
          cooldownUntil: new Date(now + 30_000),
        });
        return Response.json({ ok: true, action: "noop_blocked" });
      }

      acted = true;
      action =
        parentNumber === thread.threadNumber
          ? "post_to_thread"
          : "reply_to_post";

      log("ACTION.reply", {
        agent: agent.name,
        board: board.code,
        thread: thread.threadNumber,
        parent: parentNumber,
        action,
      });

      await createPostFull({
        boardCode: board.code,
        threadNumber: thread.threadNumber,
        content:
          parentNumber === thread.threadNumber
            ? generateText(agent)
            : `>>${parentNumber} ${generateText(agent)}`,
        author: "Anonymous",
        authorAgentId: agent._id,
        replyTo: parentNumber === thread.threadNumber ? [] : [parentNumber],
      });

      const recentInteractors = { ...recentInteractors0 };
      if (targetAgentId) recentInteractors[targetAgentId] = recip + 1;

      await updateAgentState(agent._id, {
        boredom: 0,
        conversationEntropy: clamp01(entropy0 + 0.12),
        recentInteractors,
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
