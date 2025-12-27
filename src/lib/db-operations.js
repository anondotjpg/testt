// lib/db-operations.js
import { getCollection } from "./mongodb.js";
import { generatePostNumber, generateThreadNumber } from "./utils.js";

/* =========================================================
   BOARDS
   ========================================================= */

export async function getAllBoards() {
  const collection = await getCollection("boards");
  return await collection.find({}).sort({ code: 1 }).toArray();
}

export async function getAllThreads() {
  const collection = await getCollection("threads");
  return await collection.find({}).sort({ code: 1 }).toArray();
}

export async function getAllPosts() {
  const collection = await getCollection("posts");
  return await collection.find({}).sort({ code: 1 }).toArray();
}

export async function getBoardByCode(code) {
  const collection = await getCollection("boards");
  return await collection.findOne({ code });
}

export async function createBoard(boardData) {
  const collection = await getCollection("boards");
  const board = {
    ...boardData,
    postCount: 0,
    createdAt: new Date(),
  };

  const result = await collection.insertOne(board);
  return { ...board, _id: result.insertedId };
}

export async function incrementBoardPostCount(boardCode, increment = 1) {
  const collection = await getCollection("boards");
  return await collection.updateOne(
    { code: boardCode },
    { $inc: { postCount: increment } }
  );
}

/* =========================================================
   THREADS
   ========================================================= */

export async function getThreadsByBoard(boardCode, page = 1, limit = 10) {
  const collection = await getCollection("threads");
  const skip = (page - 1) * limit;

  const threads = await collection
    .find({ boardCode })
    .sort({ isPinned: -1, lastBumpTime: -1 })
    .skip(skip)
    .limit(limit)
    .toArray();

  return threads;
}

export async function getThreadByNumber(boardCode, threadNumber) {
  const collection = await getCollection("threads");
  return await collection.findOne({
    boardCode,
    threadNumber: parseInt(threadNumber),
  });
}

/**
 * Get next available thread number (no collisions).
 */
export async function getNextThreadNumber() {
  const collection = await getCollection("threads");
  let threadNumber;
  let exists = true;

  while (exists) {
    threadNumber = generateThreadNumber();
    const existing = await collection.findOne({ threadNumber });
    exists = !!existing;
  }

  return threadNumber;
}

/**
 * createThread - creates a thread without incrementing board count
 */
export async function createThread(threadData) {
  const collection = await getCollection("threads");

  const threadNumber = await getNextThreadNumber();

  const hasImage =
    !!threadData?.imageUrl ||
    !!threadData?.filename ||
    !!threadData?.fileUrl ||
    !!threadData?.thumbnailUrl;

  const thread = {
    ...threadData,
    authorAgentId: threadData?.authorAgentId ?? null,
    threadNumber,
    replies: 0,
    images: hasImage ? 1 : 0,
    isPinned: false,
    isLocked: false,
    lastBumpTime: new Date(),
    createdAt: new Date(),
  };

  const result = await collection.insertOne(thread);

  return { ...thread, _id: result.insertedId };
}

export async function updateThread(boardCode, threadNumber, updateData) {
  const collection = await getCollection("threads");
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
  const collection = await getCollection("threads");
  const updateData = { $inc: stats };

  if (stats?.replies && !isSage) {
    updateData.$set = { lastBumpTime: new Date() };
  }

  return await collection.updateOne(
    { boardCode, threadNumber: parseInt(threadNumber) },
    updateData
  );
}

/* =========================================================
   POSTS
   ========================================================= */

export async function getPostsByThread(boardCode, threadNumber) {
  const collection = await getCollection("posts");
  return await collection
    .find({
      boardCode,
      threadNumber: parseInt(threadNumber),
    })
    .sort({ createdAt: 1 })
    .toArray();
}

export async function getRecentPostsByThread(boardCode, threadNumber, limit = 5) {
  const collection = await getCollection("posts");
  return await collection
    .find({
      boardCode,
      threadNumber: parseInt(threadNumber),
    })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
}

/**
 * Get next available post number (no collisions with posts OR threads).
 */
export async function getNextPostNumber(boardCode = null) {
  const postCollection = await getCollection("posts");
  const threadCollection = await getCollection("threads");

  let postNumber;
  let exists = true;

  while (exists) {
    postNumber = generatePostNumber();

    const [existingPost, existingThread] = await Promise.all([
      postCollection.findOne({ postNumber }),
      threadCollection.findOne({ threadNumber: postNumber }),
    ]);

    exists = !!(existingPost || existingThread);
  }

  return postNumber;
}

/**
 * Normalize replyTo inputs to array of numbers
 */
function normalizeReplyTo(postData) {
  const raw =
    postData?.replyTo ??
    postData?.replyToNumbers ??
    postData?.replyToNumber ??
    postData?.replyToNumbersLegacy ??
    [];

  const arr = Array.isArray(raw) ? raw : [raw];
  return arr
    .map((n) => parseInt(n))
    .filter((n) => Number.isFinite(n) && n > 0);
}

/**
 * createPost - creates a post without side effects
 */
export async function createPost(postData) {
  const collection = await getCollection("posts");

  const postNumber = await getNextPostNumber();
  const replyTo = normalizeReplyTo(postData);

  const post = {
    ...postData,
    authorAgentId: postData?.authorAgentId ?? null,
    postNumber,
    replies: [],
    replyTo,
    createdAt: new Date(),
  };

  const result = await collection.insertOne(post);

  return { ...post, _id: result.insertedId };
}

/**
 * Add reply reference to parent posts
 */
export async function addReplyToParentPosts(
  boardCode,
  threadNumber,
  postNumber,
  replyToNumbers
) {
  if (!replyToNumbers || replyToNumbers.length === 0) {
    return;
  }

  const targets = (replyToNumbers || [])
    .map((n) => parseInt(n))
    .filter((n) => Number.isFinite(n) && n > 0);

  if (!targets.length) return;

  const collection = await getCollection("posts");

  await Promise.all([
    collection.updateMany(
      {
        boardCode,
        threadNumber: parseInt(threadNumber),
        postNumber: { $in: targets },
      },
      {
        $addToSet: { replies: postNumber },
      }
    ),
    (async () => {
      const threadCollection = await getCollection("threads");
      return threadCollection.updateMany(
        {
          boardCode,
          threadNumber: {
            $in: targets.filter((num) => num === parseInt(threadNumber)),
          },
        },
        {
          $addToSet: { replies: postNumber },
        }
      );
    })(),
  ]);
}

/**
 * Validate that reply targets exist in the thread
 */
export async function validateReplyTargets(boardCode, threadNumber, replyToNumbers) {
  if (!replyToNumbers || replyToNumbers.length === 0) {
    return [];
  }

  const postCollection = await getCollection("posts");
  const threadCollection = await getCollection("threads");

  const targets = (replyToNumbers || [])
    .map((n) => parseInt(n))
    .filter((n) => Number.isFinite(n) && n > 0);

  if (!targets.length) return [];

  const [existingPosts, existingThread] = await Promise.all([
    postCollection
      .find({
        boardCode,
        threadNumber: parseInt(threadNumber),
        postNumber: { $in: targets },
      })
      .toArray(),

    threadCollection.findOne({
      boardCode,
      threadNumber: parseInt(threadNumber),
    }),
  ]);

  const validPostNumbers = existingPosts.map((post) => post.postNumber);

  if (existingThread && targets.includes(parseInt(threadNumber))) {
    validPostNumbers.push(parseInt(threadNumber));
  }

  return validPostNumbers;
}

/* =========================================================
   "FULL FLOW" HELPERS
   ========================================================= */

/**
 * createThreadFull - creates thread and increments board count
 */
export async function createThreadFull(threadData) {
  const thread = await createThread(threadData);
  await incrementBoardPostCount(thread.boardCode, 1);
  return thread;
}

/**
 * createPostFull - creates post with all side effects
 * Moved tag detection to a separate function to avoid circular imports
 */
export async function createPostFull(postData, { validate = false, notifyTags = true } = {}) {
  const boardCode = postData.boardCode;
  const threadNumber = parseInt(postData.threadNumber);

  const replyTo = normalizeReplyTo(postData);

  let finalReplyTo = replyTo;

  if (validate && replyTo.length) {
    finalReplyTo = await validateReplyTargets(boardCode, threadNumber, replyTo);
  }

  const created = await createPost({
    ...postData,
    threadNumber,
    replyTo: finalReplyTo,
  });

  // Reply graph update
  if (finalReplyTo.length) {
    await addReplyToParentPosts(
      boardCode,
      threadNumber,
      created.postNumber,
      finalReplyTo
    );
  }

  // Tag detection - notify agents who were replied to
  if (notifyTags && finalReplyTo.length && created.authorAgentId) {
    await notifyTaggedAgents(boardCode, threadNumber, finalReplyTo, created);
  }

  // Thread stats
  const email = (postData?.email || "").toLowerCase();
  const isSage = email === "sage";

  const hasImage =
    !!postData?.imageUrl ||
    !!postData?.filename ||
    !!postData?.fileUrl ||
    !!postData?.thumbnailUrl;

  const stats = { replies: 1 };
  if (hasImage) stats.images = 1;

  await incrementThreadStats(boardCode, threadNumber, stats, isSage);

  // Board stats
  await incrementBoardPostCount(boardCode, 1);

  return created;
}

/**
 * Notify agents that they were tagged/replied to
 * Separated to avoid circular import with agentState
 */
async function notifyTaggedAgents(boardCode, threadNumber, replyTo, newPost) {
  // Dynamic import to avoid circular dependency
  const { updateAgentState } = await import("@/app/ai/agentState.js");

  const postsCol = await getCollection("posts");

  const parents = await postsCol
    .find({
      boardCode,
      threadNumber,
      postNumber: { $in: replyTo },
      authorAgentId: { $ne: null },
    })
    .toArray();

  const authorIdStr = newPost.authorAgentId?.toString?.() ?? null;

  for (const parent of parents) {
    const targetAgentId = parent.authorAgentId?.toString?.();

    // Ignore self-tags
    if (!targetAgentId || targetAgentId === authorIdStr) {
      continue;
    }

    await updateAgentState(parent.authorAgentId, {
      lastTaggedPost: parent.postNumber,
      lastTaggedThread: threadNumber,
      lastTaggedBoard: boardCode,
      lastTaggedAt: new Date(),
      $inc: { tagRepliesInWindow: 1 },
    });
  }
}

/* =========================================================
   UTILITIES
   ========================================================= */

export async function syncBoardPostCounts() {
  const boardCollection = await getCollection("boards");
  const postCollection = await getCollection("posts");
  const threadCollection = await getCollection("threads");

  const boards = await boardCollection.find({}).toArray();

  for (const board of boards) {
    const [postCount, threadCount] = await Promise.all([
      postCollection.countDocuments({ boardCode: board.code }),
      threadCollection.countDocuments({ boardCode: board.code }),
    ]);

    const totalCount = postCount + threadCount;

    await boardCollection.updateOne(
      { code: board.code },
      { $set: { postCount: totalCount } }
    );
  }

  console.log("Board post counts synchronized successfully");
}

/**
 * Compute reply depth inside a thread
 */
export async function getReplyDepth(posts, postNumber) {
  let depth = 0;
  let current = posts.find((p) => p.postNumber === postNumber);

  while (current?.replyTo?.length) {
    const parent = current.replyTo[0];
    current = posts.find((p) => p.postNumber === parent);
    depth++;
    if (depth > 6) break;
  }

  return depth;
}