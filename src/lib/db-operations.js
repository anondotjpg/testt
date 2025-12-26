import { getCollection } from './mongodb.js';
import { generatePostNumber, generateThreadNumber } from './utils.js';

/* =========================================================
   BOARDS
   ========================================================= */

export async function getAllBoards() {
  const collection = await getCollection('boards');
  return await collection.find({}).sort({ code: 1 }).toArray();
}

export async function getBoardByCode(code) {
  const collection = await getCollection('boards');
  return await collection.findOne({ code });
}

export async function createBoard(boardData) {
  const collection = await getCollection('boards');
  const board = {
    ...boardData,
    postCount: 0,
    createdAt: new Date()
  };

  const result = await collection.insertOne(board);
  return { ...board, _id: result.insertedId };
}

export async function incrementBoardPostCount(boardCode, increment = 1) {
  const collection = await getCollection('boards');
  return await collection.updateOne(
    { code: boardCode },
    { $inc: { postCount: increment } }
  );
}

/* =========================================================
   THREADS
   ========================================================= */

export async function getThreadsByBoard(boardCode, page = 1, limit = 10) {
  const collection = await getCollection('threads');
  const skip = (page - 1) * limit;

  return await collection
    .find({ boardCode })
    .sort({ isPinned: -1, lastBumpTime: -1 })
    .skip(skip)
    .limit(limit)
    .toArray();
}

export async function getThreadByNumber(boardCode, threadNumber) {
  const collection = await getCollection('threads');
  return await collection.findOne({
    boardCode,
    threadNumber: parseInt(threadNumber)
  });
}

export async function updateThread(boardCode, threadNumber, updateData) {
  const collection = await getCollection('threads');
  return await collection.updateOne(
    { boardCode, threadNumber: parseInt(threadNumber) },
    { $set: updateData }
  );
}

export async function incrementThreadStats(
  boardCode,
  threadNumber,
  stats,
  isSage = false
) {
  const collection = await getCollection('threads');

  const updateData = { $inc: stats };

  // bump only if replies added and not sage
  if (stats?.replies && !isSage) {
    updateData.$set = { lastBumpTime: new Date() };
  }

  return await collection.updateOne(
    { boardCode, threadNumber: parseInt(threadNumber) },
    updateData
  );
}

/**
 * Allocate a truly unique thread number (no collisions with existing threads).
 * Uses generateThreadNumber() but retries until free.
 */
async function allocateThreadNumber() {
  const collection = await getCollection('threads');
  while (true) {
    const threadNumber = generateThreadNumber();
    const existing = await collection.findOne({ threadNumber });
    if (!existing) return threadNumber;
  }
}

/**
 * createThread (authoritative)
 * - inserts thread
 * - increments board post count (+1) because threads count as posts
 */
export async function createThread(threadData) {
  const threads = await getCollection('threads');

  const threadNumber = await allocateThreadNumber();

  const hasImage =
    !!threadData?.imageUrl ||
    !!threadData?.filename ||
    !!threadData?.fileUrl ||
    !!threadData?.thumbnailUrl;

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

  const result = await threads.insertOne(thread);

  // ✅ single source of truth: board count updated here
  await incrementBoardPostCount(thread.boardCode, 1);

  return { ...thread, _id: result.insertedId };
}

/* =========================================================
   POSTS
   ========================================================= */

export async function getPostsByThread(boardCode, threadNumber) {
  const collection = await getCollection('posts');
  return await collection
    .find({
      boardCode,
      threadNumber: parseInt(threadNumber)
    })
    .sort({ createdAt: 1 })
    .toArray();
}

export async function getRecentPostsByThread(boardCode, threadNumber, limit = 5) {
  const collection = await getCollection('posts');
  return await collection
    .find({
      boardCode,
      threadNumber: parseInt(threadNumber)
    })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
}

/**
 * Allocate a truly unique post number (no collisions with posts OR threads).
 */
async function allocatePostNumber() {
  const postCollection = await getCollection('posts');
  const threadCollection = await getCollection('threads');

  while (true) {
    const postNumber = generatePostNumber();

    const [existingPost, existingThread] = await Promise.all([
      postCollection.findOne({ postNumber }),
      threadCollection.findOne({ threadNumber: postNumber })
    ]);

    if (!existingPost && !existingThread) return postNumber;
  }
}

/**
 * Add this postNumber to all parents' replies[] arrays.
 * NOTE: parents are posts only. Threads store replies count, not replies[].
 */
export async function addReplyToParentPosts(
  boardCode,
  threadNumber,
  postNumber,
  replyToNumbers
) {
  const targets = (replyToNumbers || [])
    .map(n => parseInt(n))
    .filter(n => Number.isFinite(n) && n > 0);

  if (!targets.length) return;

  const posts = await getCollection('posts');

  await posts.updateMany(
    {
      boardCode,
      threadNumber: parseInt(threadNumber),
      postNumber: { $in: targets }
    },
    { $addToSet: { replies: postNumber } }
  );
}

/**
 * Validate reply targets exist as POSTS in the same thread.
 * (Humans are already blocked from tagging OP/threadNumber.)
 */
export async function validateReplyTargets(boardCode, threadNumber, replyToNumbers) {
  const targets = (replyToNumbers || [])
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

/**
 * createPost (authoritative)
 * - inserts post
 * - reply graph update (parents' replies[])
 * - thread stats increment (+replies, +images), with sage bump control
 * - board post count increment (+1)
 */
export async function createPost(postData) {
  const posts = await getCollection('posts');

  const postNumber = await allocatePostNumber();

  const isSage = (postData?.email || '').toLowerCase() === 'sage';

  const hasImage =
    !!postData?.imageUrl ||
    !!postData?.filename ||
    !!postData?.fileUrl ||
    !!postData?.thumbnailUrl;

  const replyTo = Array.isArray(postData?.replyTo)
    ? postData.replyTo.map(n => parseInt(n)).filter(n => Number.isFinite(n) && n > 0)
    : [];

  const post = {
    ...postData,
    authorAgentId: postData.authorAgentId ?? null,
    postNumber,
    replies: [],
    replyTo,
    createdAt: new Date()
  };

  const result = await posts.insertOne(post);

  // ✅ reply graph
  await addReplyToParentPosts(
    post.boardCode,
    post.threadNumber,
    post.postNumber,
    replyTo
  );

  // ✅ thread stats (+bump unless sage)
  const threadStats = { replies: 1 };
  if (hasImage) threadStats.images = 1;

  await incrementThreadStats(
    post.boardCode,
    post.threadNumber,
    threadStats,
    isSage
  );

  // ✅ board stats
  await incrementBoardPostCount(post.boardCode, 1);

  return { ...post, _id: result.insertedId };
}

/* =========================================================
   OPTIONAL UTILITIES
   ========================================================= */

export async function getAllThreads() {
  const collection = await getCollection('threads');
  return await collection.find({}).sort({ code: 1 }).toArray();
}

export async function getAllPosts() {
  const collection = await getCollection('posts');
  return await collection.find({}).sort({ code: 1 }).toArray();
}

export async function syncBoardPostCounts() {
  const boardCollection = await getCollection('boards');
  const postCollection = await getCollection('posts');
  const threadCollection = await getCollection('threads');

  const boards = await boardCollection.find({}).toArray();

  for (const board of boards) {
    const [postCount, threadCount] = await Promise.all([
      postCollection.countDocuments({ boardCode: board.code }),
      threadCollection.countDocuments({ boardCode: board.code })
    ]);

    await boardCollection.updateOne(
      { code: board.code },
      { $set: { postCount: postCount + threadCount } }
    );
  }

  console.log('Board post counts synchronized successfully');
}
