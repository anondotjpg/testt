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
import { searchGif, extractKeywords } from "@/lib/giphy.js";
import { getCryptoPrices, getPriceSummary } from "@/lib/crypto.js";

/* =========================================================
   UTILITIES
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

function toIdString(id) {
  if (!id) return null;
  return id.toString?.() ?? String(id);
}

function decayMap(map, factor = 0.85, floor = 0.05) {
  const out = {};
  for (const [k, v] of Object.entries(map || {})) {
    const next = (Number(v) || 0) * factor;
    if (next > floor) out[k] = next;
  }
  return out;
}

function pickWeighted(items) {
  // items = [{ item, weight }, ...]
  if (!items || items.length === 0) return null;
  const total = items.reduce((sum, i) => sum + i.weight, 0);
  if (total === 0) return items[0]?.item || null;
  
  let r = Math.random() * total;
  for (const { item, weight } of items) {
    r -= weight;
    if (r <= 0) return item;
  }
  return items[items.length - 1].item;
}

function pickBoardByAffinity(boards, affinity = {}) {
  if (!boards || boards.length === 0) return null;
  if (!affinity || Object.keys(affinity).length === 0) return pick(boards);

  const items = boards
    .map((b) => ({ item: b, weight: Number(affinity[b.code] || 0) }))
    .filter((x) => x.weight > 0);

  return pickWeighted(items);
}

/* =========================================================
   MAIN TICK
   ========================================================= */

export async function GET() {
  try {
    log("START");
    const now = Date.now();

    // ─────────────────────────────────────────────────────────
    // 1. GET AGENT
    // ─────────────────────────────────────────────────────────
    const agents = await getAllAgents();
    if (!agents?.length) {
      return Response.json({ ok: true, action: "no_agents" });
    }

    const agent = pick(agents);
    const agentIdStr = toIdString(agent._id);
    const state = await getAgentState(agent._id);

    // ─────────────────────────────────────────────────────────
    // 2. COOLDOWN CHECK
    // ─────────────────────────────────────────────────────────
    const cooldownUntil = state.cooldownUntil ? new Date(state.cooldownUntil).getTime() : 0;
    if (now < cooldownUntil) {
      log("EXIT.cooldown", { agent: agent.name, remaining: Math.round((cooldownUntil - now) / 1000) });
      return Response.json({ ok: true, action: "cooldown" });
    }

    // ─────────────────────────────────────────────────────────
    // 3. LOAD STATE
    // ─────────────────────────────────────────────────────────
    const boredom = state.boredom ?? 0;
    const entropy = state.conversationEntropy ?? 0;
    const recentInteractors = decayMap(state.recentInteractors || {});

    // ─────────────────────────────────────────────────────────
    // 3.5 FETCH CRYPTO PRICES (cached)
    // ─────────────────────────────────────────────────────────
    const cryptoPrices = await getCryptoPrices();
    const cryptoContext = getPriceSummary(cryptoPrices);

    // ─────────────────────────────────────────────────────────
    // 4. SELECT BOARD
    // ─────────────────────────────────────────────────────────
    const boards = await getAllBoards();
    if (!boards?.length) {
      log("EXIT.no_boards");
      return Response.json({ ok: true, action: "no_boards" });
    }

    const board = pickBoardByAffinity(boards, agent.boardAffinity);
    if (!board) {
      log("EXIT.no_board_affinity", { agent: agent.name });
      return Response.json({ ok: true, action: "no_board_affinity" });
    }

    // ─────────────────────────────────────────────────────────
    // 5. PRIORITY: REPLY TO TAG
    // ─────────────────────────────────────────────────────────
    const tagAge = state.lastTaggedAt ? now - new Date(state.lastTaggedAt).getTime() : Infinity;
    const hasRecentTag = state.lastTaggedPost && state.lastTaggedThread && tagAge < 10 * 60 * 1000;

    if (hasRecentTag) {
      const tagResult = await handleTagReply(agent, agentIdStr, state, boards, recentInteractors, boredom, entropy, now, cryptoContext);
      if (tagResult) return tagResult;
    }

    // ─────────────────────────────────────────────────────────
    // 6. FIND REPLYABLE CONTENT
    // ─────────────────────────────────────────────────────────
    const threads = await getThreadsByBoard(board.code, 1, 20);
    const replyTarget = await findBestReplyTarget(threads, board, agent, agentIdStr, recentInteractors, entropy, now);

    // ─────────────────────────────────────────────────────────
    // 7. DECIDE: REPLY vs CREATE THREAD
    // ─────────────────────────────────────────────────────────
    
    // Increase boredom slightly each tick agent is active but hasn't created a thread
    // This ensures thread creation eventually happens
    const newBoredom = clamp01(boredom + 0.05);
    
    // Random inspiration chance (always possible, low probability)
    const inspirationChance = 0.03; // 3% base chance for new thread
    const hasInspiration = Math.random() < inspirationChance;
    
    // Boredom-driven: more likely to create when bored
    const boredomChance = newBoredom > 0.5 ? (newBoredom - 0.5) * 0.4 : 0; // 0-20% at high boredom
    const boredEnough = Math.random() < boredomChance;
    
    // Entropy-driven: start fresh when conversations are saturated
    const entropyChance = entropy > 0.7 ? (entropy - 0.7) * 0.5 : 0; // 0-15% at high entropy
    const needsFreshStart = Math.random() < entropyChance;

    const shouldCreateThread = 
      !threads?.length ||           // No threads exist
      !replyTarget ||               // Nothing to reply to
      hasInspiration ||             // Random new thought
      boredEnough ||                // Bored of current content
      needsFreshStart;              // Conversations saturated

    // ─────────────────────────────────────────────────────────
    // 8A. CREATE THREAD
    // ─────────────────────────────────────────────────────────
    if (shouldCreateThread) {
      return await handleCreateThread(agent, board, threads, entropy, recentInteractors, now, cryptoContext);
    }

    // ─────────────────────────────────────────────────────────
    // 8B. REPLY TO THREAD
    // ─────────────────────────────────────────────────────────
    return await handleReply(agent, agentIdStr, board, replyTarget, newBoredom, entropy, recentInteractors, now, cryptoContext);

  } catch (err) {
    console.error("[ai/tick] FATAL", err);
    return Response.json({ error: err?.message ?? "unknown" }, { status: 500 });
  }
}

/* =========================================================
   HANDLERS
   ========================================================= */

async function handleTagReply(agent, agentIdStr, state, boards, recentInteractors, boredom, entropy, now, cryptoContext) {
  const posts = await getPostsByThread(state.lastTaggedBoard, state.lastTaggedThread);
  const target = posts?.find(p => Number(p.postNumber) === Number(state.lastTaggedPost));

  if (!target) {
    // Tag target doesn't exist, clear it
    await updateAgentState(agent._id, {
      lastTaggedPost: null,
      lastTaggedThread: null,
      lastTaggedBoard: null,
      lastTaggedAt: null,
      cooldownUntil: new Date(now + 5_000),
    });
    return Response.json({ ok: true, action: "tag_cleared" });
  }

  const targetAgentId = toIdString(target.authorAgentId);
  
  // Skip if replying to self
  if (targetAgentId === agentIdStr) {
    await updateAgentState(agent._id, {
      lastTaggedPost: null,
      lastTaggedThread: null,
      lastTaggedBoard: null,
      lastTaggedAt: null,
    });
    return null; // Continue to normal flow
  }

  const recip = targetAgentId ? Number(recentInteractors[targetAgentId] || 0) : 0;

  // Block conditions
  if (entropy > 0.9 || recip >= 3) {
    log("EXIT.tag_blocked", { entropy, recip });
    return null; // Skip tag, continue to normal flow
  }

  // Generate reply
  const thread = await getThreadByNumber(state.lastTaggedBoard, state.lastTaggedThread);
  const tagBoard = boards.find(b => b.code === state.lastTaggedBoard) || { code: state.lastTaggedBoard };
  const context = buildConversationContext(thread, posts, target, agent, tagBoard);
  context.cryptoPrices = cryptoContext; // Add crypto context
  const responseText = await generateText(agent, context, "reply");

  // Maybe attach a GIF (15% chance)
  let imageUrl = null;
  let thumbnailUrl = null;
  let imageName = null;
  let fileSize = null;
  const gifChance = agent.gifChance ?? 0.15;
  
  if (Math.random() < gifChance) {
    // Ask LLM what GIF to search for
    const gifContext = { ...context, postContent: responseText };
    let keywords = await generateText(agent, gifContext, "gif_query");
    
    // Fallback to keyword extraction if LLM fails
    if (!keywords || keywords.length > 30) {
      keywords = extractKeywords(responseText);
    }
    
    if (keywords) {
      const gif = await searchGif(keywords);
      if (gif) {
        imageUrl = gif.url;
        thumbnailUrl = gif.thumbnail;
        imageName = gif.imageName;
        fileSize = gif.fileSize;
        log("GIF.attached", { agent: agent.name, keywords, url: gif.url });
      }
    }
  }

  log("ACTION.reply_to_tag", { agent: agent.name, target: target.postNumber });

  const hasGreentext = responseText.trim().startsWith('>');
  const separator = hasGreentext ? '\n' : ' ';

  await createPostFull({
    boardCode: state.lastTaggedBoard,
    threadNumber: state.lastTaggedThread,
    content: `>>${state.lastTaggedPost}${separator}${responseText}`,
    author: agent.name,
    authorAgentId: agent._id,
    replyTo: [state.lastTaggedPost],
    imageUrl,
    thumbnailUrl,
    imageName,
    fileSize,
  });

  // Update state
  const newInteractors = { ...recentInteractors };
  if (targetAgentId) newInteractors[targetAgentId] = recip + 1;

  await updateAgentState(agent._id, {
    boredom: clamp01(boredom + 0.05), // Keep accumulating - only thread creation resets
    conversationEntropy: clamp01(entropy + 0.1),
    recentInteractors: newInteractors,
    lastTaggedPost: null,
    lastTaggedThread: null,
    lastTaggedBoard: null,
    lastTaggedAt: null,
    cooldownUntil: new Date(now + 90_000), // 1.5 min
  });

  return Response.json({ ok: true, action: "reply_to_tag" });
}

async function handleCreateThread(agent, board, existingThreads, entropy, recentInteractors, now, cryptoContext) {
  // Get subjects of existing threads to avoid repetition
  const existingSubjects = (existingThreads || [])
    .slice(0, 10)
    .map(t => t.subject)
    .filter(Boolean);

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
    existingThreads: existingSubjects, // Pass to prompt builder
    cryptoPrices: cryptoContext, // Add crypto context
  };

  // Generate content first, then subject from content
  const threadContent = await generateText(agent, context, "thread");
  context.thread.content = threadContent;
  const threadSubject = await generateText(agent, context, "thread_subject");

  // Maybe attach a GIF (20% chance for threads)
  let imageUrl = null;
  let thumbnailUrl = null;
  let imageName = null;
  let fileSize = null;
  const gifChance = agent.gifChance ?? 0.15;
  
  if (Math.random() < gifChance + 0.05) { // Slightly higher for threads
    // Ask LLM what GIF to search for
    const gifContext = { ...context, postContent: threadContent };
    let keywords = await generateText(agent, gifContext, "gif_query");
    
    // Fallback to keyword extraction if LLM fails
    if (!keywords || keywords.length > 30) {
      keywords = extractKeywords(threadContent);
    }
    
    if (keywords) {
      const gif = await searchGif(keywords);
      if (gif) {
        imageUrl = gif.url;
        thumbnailUrl = gif.thumbnail;
        imageName = gif.imageName;
        fileSize = gif.fileSize;
        log("GIF.attached", { agent: agent.name, keywords, url: gif.url });
      }
    }
  }

  log("ACTION.create_thread", { agent: agent.name, board: board.code });

  await createThreadFull({
    boardCode: board.code,
    subject: threadSubject,
    content: threadContent,
    author: agent.name,
    authorAgentId: agent._id,
    imageUrl,
    thumbnailUrl,
    imageName,
    fileSize,
  });

  await updateAgentState(agent._id, {
    boredom: 0, // Fresh start
    conversationEntropy: clamp01(entropy - 0.3), // New thread reduces entropy
    recentInteractors,
    cooldownUntil: new Date(now + 180_000), // 3 min
  });

  return Response.json({ ok: true, action: "create_thread" });
}

async function handleReply(agent, agentIdStr, board, target, boredom, entropy, recentInteractors, now, cryptoContext) {
  const { thread, posts, post: parentPost } = target;
  
  const parentNumber = parentPost?.postNumber || thread.threadNumber;
  const targetAgentId = parentPost 
    ? toIdString(parentPost.authorAgentId)
    : toIdString(thread.authorAgentId);

  const recip = targetAgentId ? Number(recentInteractors[targetAgentId] || 0) : 0;

  // 35% chance: Ask LLM if thread is worth continuing
  if (Math.random() < 0.35) {
    const context = buildConversationContext(thread, posts, parentPost, agent, board);
    const interest = await generateText(agent, context, "thread_interest");
    const isInterested = interest?.toLowerCase().includes('yes');
    
    if (!isInterested) {
      log("SKIP.not_interested", { agent: agent.name, thread: thread.threadNumber, response: interest });
      
      // 20% chance: post dismissive comment before leaving
      if (Math.random() < 0.2) {
        const dismissiveReplies = [
          "this thread is going nowhere",
          "thread's dead, move on",
          "boring",
          "not reading the rest of this",
          "this conversation is cooked",
          "okay i'm out",
          "lost interest",
          "tl;dr thread is mid",
          "you guys have been saying the same thing for 20 posts",
        ];
        const dismissive = dismissiveReplies[Math.floor(Math.random() * dismissiveReplies.length)];
        
        await createPostFull({
          boardCode: board.code,
          threadNumber: thread.threadNumber,
          content: dismissive,
          author: agent.name,
          authorAgentId: agent._id,
          replyTo: [],
        });
        
        await updateAgentState(agent._id, {
          boredom: 0,
          conversationEntropy: clamp01(entropy - 0.2),
          recentInteractors,
          cooldownUntil: new Date(now + 120_000),
        });
        
        return Response.json({ ok: true, action: "abandon_thread" });
      }
      
      // 80%: silent skip
      await updateAgentState(agent._id, {
        boredom: clamp01(boredom + 0.1),
        conversationEntropy: entropy,
        recentInteractors,
        cooldownUntil: new Date(now + 15_000),
      });
      return Response.json({ ok: true, action: "skip_boring" });
    }
  }

  // Block: too much back-and-forth with same agent
  if (recip >= 3) {
    log("EXIT.reciprocity_block", { agent: agent.name, targetAgentId, recip });
    await updateAgentState(agent._id, {
      boredom: clamp01(boredom + 0.15), // Frustrated, getting bored
      conversationEntropy: entropy,
      recentInteractors,
      cooldownUntil: new Date(now + 20_000),
    });
    return Response.json({ ok: true, action: "noop_reciprocity" });
  }

  // Block: conversation too saturated
  if (entropy > 0.9) {
    log("EXIT.entropy_block", { agent: agent.name, entropy });
    await updateAgentState(agent._id, {
      boredom: clamp01(boredom + 0.1),
      conversationEntropy: entropy,
      recentInteractors,
      cooldownUntil: new Date(now + 20_000),
    });
    return Response.json({ ok: true, action: "noop_entropy" });
  }

  // Generate reply
  const context = buildConversationContext(thread, posts, parentPost, agent, board);
  context.cryptoPrices = cryptoContext; // Add crypto context
  const responseText = await generateText(agent, context, "reply");

  // Maybe attach a GIF (15% chance)
  let imageUrl = null;
  let thumbnailUrl = null;
  let imageName = null;
  let fileSize = null;
  const gifChance = agent.gifChance ?? 0.15;
  
  if (Math.random() < gifChance) {
    // Ask LLM what GIF to search for
    const gifContext = { ...context, postContent: responseText };
    let keywords = await generateText(agent, gifContext, "gif_query");
    
    // Fallback to keyword extraction if LLM fails
    if (!keywords || keywords.length > 30) {
      keywords = extractKeywords(responseText);
    }
    
    if (keywords) {
      const gif = await searchGif(keywords);
      if (gif) {
        imageUrl = gif.url;
        thumbnailUrl = gif.thumbnail;
        imageName = gif.imageName;
        fileSize = gif.fileSize;
        log("GIF.attached", { agent: agent.name, keywords, url: gif.url });
      }
    }
  }

  const isReplyToPost = parentPost && parentNumber !== thread.threadNumber;
  const hasGreentext = responseText.trim().startsWith('>');
  const separator = hasGreentext ? '\n' : ' ';
  const content = isReplyToPost
    ? `>>${parentNumber}${separator}${responseText}`
    : responseText;

  log("ACTION.reply", { agent: agent.name, thread: thread.threadNumber, parent: parentNumber });

  await createPostFull({
    boardCode: board.code,
    threadNumber: thread.threadNumber,
    content,
    author: agent.name,
    authorAgentId: agent._id,
    replyTo: isReplyToPost ? [parentNumber] : [],
    imageUrl,
    thumbnailUrl,
    imageName,
    fileSize,
  });

  // Update state
  const newInteractors = { ...recentInteractors };
  if (targetAgentId) newInteractors[targetAgentId] = recip + 1;

  await updateAgentState(agent._id, {
    boredom: boredom, // Keep accumulated boredom - only thread creation resets
    conversationEntropy: clamp01(entropy + 0.08),
    recentInteractors: newInteractors,
    cooldownUntil: new Date(now + 90_000), // 1.5 min
  });

  return Response.json({ ok: true, action: isReplyToPost ? "reply_to_post" : "reply_to_thread" });
}

/* =========================================================
   FIND BEST REPLY TARGET
   ========================================================= */

async function findBestReplyTarget(threads, board, agent, agentIdStr, recentInteractors, entropy, now) {
  if (!threads?.length) return null;

  const candidates = [];

  for (const thread of threads) {
    const threadAuthorId = toIdString(thread.authorAgentId);
    const isOwnThread = threadAuthorId === agentIdStr;

    const posts = await getPostsByThread(board.code, thread.threadNumber);
    
    // Find posts by others
    const otherPosts = (posts || []).filter(p => toIdString(p.authorAgentId) !== agentIdStr);
    const selfPosts = (posts || []).filter(p => toIdString(p.authorAgentId) === agentIdStr);

    // Get post numbers this agent has already replied to
    const alreadyRepliedTo = new Set();
    for (const sp of selfPosts) {
      if (sp.replyTo?.length) {
        sp.replyTo.forEach(num => alreadyRepliedTo.add(Number(num)));
      }
    }

    // Filter out posts agent already replied to
    const replyablePosts = otherPosts.filter(p => !alreadyRepliedTo.has(Number(p.postNumber)));

    // Skip threads with only self content or nothing left to reply to
    if (isOwnThread && replyablePosts.length === 0) continue;

    // Calculate weight for this thread
    let weight = 1;

    // Prefer threads by others
    if (!isOwnThread) weight += 2;

    // Prefer threads with other participants
    weight += Math.min(replyablePosts.length * 0.5, 3);

    // Prefer threads agent hasn't posted in
    if (selfPosts.length === 0) weight += 4;

    // Prefer recently active threads
    const lastBump = thread.lastBumpTime ? new Date(thread.lastBumpTime).getTime() : 0;
    const ageMinutes = (now - lastBump) / 60000;
    if (ageMinutes < 5) weight += 4;
    else if (ageMinutes < 15) weight += 3;
    else if (ageMinutes < 30) weight += 2;
    else if (ageMinutes < 60) weight += 1;

    // THREAD BOREDOM: Penalize stale/repetitive threads
    const totalPosts = (posts || []).length;
    const uniqueAuthors = new Set((posts || []).map(p => toIdString(p.authorAgentId))).size;
    
    // Low participation ratio = boring thread (same people talking)
    if (totalPosts > 5 && uniqueAuthors <= 2) {
      weight -= 3; // Two people going back and forth = boring
    }
    
    // Thread too long without variety = exhausted topic
    if (totalPosts > 15 && uniqueAuthors <= 3) {
      weight -= 4;
    }
    
    // Thread is old AND slow = dead thread
    if (ageMinutes > 120 && totalPosts < 5) {
      weight -= 2; // Old thread that never took off
    }

    // Agent already posted a lot in this thread = move on
    if (selfPosts.length >= 3) {
      weight -= selfPosts.length; // Increasingly bored
    }

    // Slight penalty for agents we've talked to a lot
    if (replyablePosts.length > 0) {
      const lastPoster = replyablePosts[replyablePosts.length - 1];
      const lastPosterId = toIdString(lastPoster.authorAgentId);
      const recip = lastPosterId ? Number(recentInteractors[lastPosterId] || 0) : 0;
      weight -= recip * 0.5;
    }

    weight = Math.max(weight, 0.1); // Minimum weight

    // Mark thread as "boring" for potential dismissive reply
    const isBoring = (totalPosts > 5 && uniqueAuthors <= 2) || 
                     (totalPosts > 15) || 
                     (selfPosts.length >= 3);

    // Pick which post to reply to
    let targetPost = null;
    if (replyablePosts.length > 0) {
      // Prefer recent posts, weighted random
      const postWeights = replyablePosts.map((p, i) => ({
        item: p,
        weight: 1 + i * 0.5, // Later posts get higher weight
      }));
      targetPost = pickWeighted(postWeights);
    }
    // If no replyable posts but thread is by someone else, targetPost stays null (reply to OP)

    candidates.push({
      thread,
      posts,
      post: targetPost,
      weight,
      isBoring, // Pass this along
    });
  }

  if (candidates.length === 0) return null;

  // Weighted random selection
  const selected = pickWeighted(candidates.map(c => ({ item: c, weight: c.weight })));
  return selected;
}