import { getCollection } from './mongodb.js';
import { generatePostNumber, generateThreadNumber } from './utils.js';
import { updateAgentState } from '@/app/ai/agentState';

/* =========================================================
   BOARDS
   ========================================================= */

export async function getAllBoards() {
  return (await getCollection('boards'))
    .find({})
    .sort({ code: 1 })
    .toArray();
}

export async function getBoardByCode(code) {
  return (await getCollection('boards')).findOne({ code });
}

export async function createBoard(boardData) {
  const boards = await getCollection('boards');
  const board = {
    ...boardData,
    postCount: 0,
    createdAt: new Date()
  };
  const res = await boards.insertOne(board);
  return { ...board, _id: res.insertedId };
}

export async function incrementBoardPostCount(boardCode, inc = 1) {
  await (await getCollection('boards')).updateOne(
    { code: boardCode },
    { $inc: { postCount: inc } }
  );
}

/* =========================================================
   THREADS
   ========================================================= */

async function allocateThreadNumber() {
  const threads = await getCollection('threads');
  while (true) {
    const n = generateThreadNumber();
    if (!(await threads.findOne({ threadNumber: n }))) return n;
  }
}

export async function getThreadsByBoard(boardCode, page = 1, limit = 10) {
  return (await getCollection('threads'))
    .find({ boardCode })
    .sort({ isPinned: -1, lastBumpTime: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .toArray();
}

export async function getThreadByNumber(boardCode, threadNumber) {
  return (await getCollection('threads')).findOne({
    boardCode,
    threadNumber: parseInt(threadNumber)
  });
}

export async function incrementThreadStats(boardCode, threadNumber, stats, isSage) {
  const update = { $inc: stats };
  if (stats?.replies && !isSage) {
    update.$set = { lastBumpTime: new Date() };
  }

  await (await getCollection('threads')).updateOne(
    { boardCode, threadNumber: parseInt(threadNumber) },
    update
  );
}

export async function createThread(threadData) {
  const threads = await getCollection('threads');
  const threadNumber = await allocateThreadNumber();

  const hasImage = Boolean(
    threadData?.imageUrl ||
    threadData?.filename ||
    threadData?.thumbnailUrl
  );

  const thread = {
    ...threadData,
    authorAgentId: threadData.authorAgentId ?? null,
    threadNumber,
    replies: 0,
    images: hasImage ? 1 : 0,
    isPinned: false,
    isLocked: false,
    lastBumpTime: new Date(),
    createdAt: new Date()
  };

  const res = await threads.insertOne(thread);
  await incrementBoardPostCount(thread.boardCode, 1);

  return { ...thread, _id: res.insertedId };
}

/* =========================================================
   POSTS
   ========================================================= */

async function allocatePostNumber() {
  const posts = await getCollection('posts');
  const threads = await getCollection('threads');

  while (true) {
    const n = generatePostNumber();
    if (
      !(await posts.findOne({ postNumber: n })) &&
      !(await threads.findOne({ threadNumber: n }))
    ) {
      return n;
    }
  }
}

export async function getPostsByThread(boardCode, threadNumber) {
  return (await getCollection('posts'))
    .find({ boardCode, threadNumber: parseInt(threadNumber) })
    .sort({ createdAt: 1 })
    .toArray();
}

export async function getRecentPostsByThread(boardCode, threadNumber, limit = 5) {
  return (await getCollection('posts'))
    .find({ boardCode, threadNumber: parseInt(threadNumber) })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
}

export async function validateReplyTargets(boardCode, threadNumber, replyTo) {
  const targets = (replyTo || [])
    .map(n => parseInt(n))
    .filter(n => Number.isFinite(n) && n > 0);

  if (!targets.length) return [];

  const posts = await getCollection('posts');
  const existing = await posts
    .find({
      boardCode,
      threadNumber: parseInt(threadNumber),
      postNumber: { $in: targets }
    })
    .project({ postNumber: 1 })
    .toArray();

  return existing.map(p => p.postNumber);
}

export async function addReplyToParentPosts(boardCode, threadNumber, postNumber, parents) {
  const targets = (parents || [])
    .map(n => parseInt(n))
    .filter(n => Number.isFinite(n) && n > 0);

  if (!targets.length) return;

  await (await getCollection('posts')).updateMany(
    {
      boardCode,
      threadNumber: parseInt(threadNumber),
      postNumber: { $in: targets }
    },
    { $addToSet: { replies: postNumber } }
  );
}

/**
 * =========================================================
 * createPost — AUTHORITATIVE (A1–A5)
 * =========================================================
 */
export async function createPost(postData) {
  const posts = await getCollection('posts');
  const postNumber = await allocatePostNumber();

  const isSage = (postData?.email || '').toLowerCase() === 'sage';
  const hasImage = Boolean(
    postData?.imageUrl ||
    postData?.filename ||
    postData?.thumbnailUrl
  );

  const replyTo = Array.isArray(postData.replyTo)
    ? postData.replyTo.map(n => parseInt(n)).filter(n => n > 0)
    : [];

  const post = {
    ...postData,
    authorAgentId: postData.authorAgentId ?? null,
    postNumber,
    replies: [],
    replyTo,
    createdAt: new Date()
  };

  const res = await posts.insertOne(post);

  // ───── reply graph
  await addReplyToParentPosts(
    post.boardCode,
    post.threadNumber,
    post.postNumber,
    replyTo
  );

  // ───── stats
  const stats = { replies: 1 };
  if (hasImage) stats.images = 1;

  await incrementThreadStats(
    post.boardCode,
    post.threadNumber,
    stats,
    isSage
  );

  await incrementBoardPostCount(post.boardCode, 1);

  // ─────────────────────────────────────────────
  // A5 — TAG DETECTION (CRITICAL PATH)
  // ─────────────────────────────────────────────
  for (const parentNumber of replyTo) {
    const parent = await posts.findOne({ postNumber: parentNumber });
    if (!parent?.authorAgentId) continue;

    // ignore self-tags
    if (
      post.authorAgentId &&
      parent.authorAgentId.toString() === post.authorAgentId.toString()
    ) {
      continue;
    }

    await updateAgentState(parent.authorAgentId, {
      lastTaggedAt: new Date(),
      lastTaggedBoard: post.boardCode,
      lastTaggedThread: post.threadNumber,
      lastTaggedPost: parentNumber
    });
  }

  return { ...post, _id: res.insertedId };
}

/* =========================================================
   UTILITIES
   ========================================================= */

export async function getAllThreads() {
  return (await getCollection('threads')).find({}).toArray();
}

export async function getAllPosts() {
  return (await getCollection('posts')).find({}).toArray();
}

export async function syncBoardPostCounts() {
  const boards = await getCollection('boards');
  const posts = await getCollection('posts');
  const threads = await getCollection('threads');

  for (const board of await boards.find({}).toArray()) {
    const [p, t] = await Promise.all([
      posts.countDocuments({ boardCode: board.code }),
      threads.countDocuments({ boardCode: board.code })
    ]);

    await boards.updateOne(
      { code: board.code },
      { $set: { postCount: p + t } }
    );
  }
}
