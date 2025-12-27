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
 * (Kept as-is, used internally now for safety.)
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
 * createThread
 * Backwards compatible:
 * - STILL returns inserted thread
 * - STILL does NOT auto-increment board count (humans already do it)
 *
 * Improvements:
 * - threadNumber is now guaranteed unique via getNextThreadNumber()
 * - authorAgentId is preserved if present (AI)
 * - images count checks multiple image fields
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
    authorAgentId: threadData?.authorAgentId ?? null, // ✅ keep AI attribution
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

export async function incrementThreadStats(boardCode, threadNumber, stats, isSage = false) {
  const collection = await getCollection("threads");
  const updateData = { $inc: stats };

  // Only update lastBumpTime if not saging and we're adding replies
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
 * (Kept as-is, used internally now for safety.)
 */
export async function getNextPostNumber(boardCode = null) {
  const postCollection = await getCollection("posts");
  const threadCollection = await getCollection("threads");

  let postNumber;
  let exists = true;

  while (exists) {
    postNumber = generatePostNumber();

    // Check both posts and threads collections
    const [existingPost, existingThread] = await Promise.all([
      postCollection.findOne({ postNumber }),
      threadCollection.findOne({ threadNumber: postNumber }),
    ]);

    exists = !!(existingPost || existingThread);
  }

  return postNumber;
}

/**
 * NEW: normalize replyTo inputs so you can pass:
 * - replyTo (array of numbers)
 * - replyToNumbers (array of numbers)
 * - replyToNumbers (legacy typo)
 *
 * Stored field is always `replyTo: number[]`
 */
function normalizeReplyTo(postData) {
  const raw =
    postData?.replyTo ??
    postData?.replyToNumbers ??
    postData?.replyToNumber ?? // safety if any variants exist
    [];

  const arr = Array.isArray(raw) ? raw : [raw];
  return arr
    .map((n) => parseInt(n))
    .filter((n) => Number.isFinite(n) && n > 0);
}

/**
 * createPost
 * Backwards compatible:
 * - STILL only inserts post (no auto bumps, no reply graph)
 * - Human route can keep doing validateReplyTargets/addReplyToParentPosts/increments
 *
 * Improvements:
 * - postNumber is now guaranteed unique via getNextPostNumber()
 * - authorAgentId preserved (AI)
 * - replies array initialized
 * - stores normalized replyTo array for consistency
 */
export async function createPost(postData) {
  const collection = await getCollection("posts");

  const postNumber = await getNextPostNumber();

  const replyTo = normalizeReplyTo(postData);

  const post = {
    ...postData,
    authorAgentId: postData?.authorAgentId ?? null, // ✅ keep AI attribution
    postNumber,
    replies: [],
    replyTo, // ✅ normalized canonical field
    createdAt: new Date(),
  };

  const result = await collection.insertOne(post);

  return { ...post, _id: result.insertedId };
}

/**
 * NEW: Function to add reply reference to parent posts
 * (Kept as-is; slight hardening: normalizes ints.)
 */
export async function addReplyToParentPosts(boardCode, threadNumber, postNumber, replyToNumbers) {
  if (!replyToNumbers || replyToNumbers.length === 0) {
    return;
  }

  const targets = (replyToNumbers || [])
    .map((n) => parseInt(n))
    .filter((n) => Number.isFinite(n) && n > 0);

  if (!targets.length) return;

  const collection = await getCollection("posts");

  // Update all parent posts to include this post in their replies array
  // Also check threads collection in case they're replying to the OP
  await Promise.all([
    // Update posts collection
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
    // Update threads collection (for replies to OP)
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
 * NEW: Function to validate that reply targets exist in the thread
 * (Kept as-is; fixes a bug in your query: duplicate threadNumber key)
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

  // Find existing posts in this thread that match the reply numbers
  const [existingPosts, existingThread] = await Promise.all([
    postCollection
      .find({
        boardCode,
        threadNumber: parseInt(threadNumber),
        postNumber: { $in: targets },
      })
      .toArray(),

    // ✅ fix: don't repeat threadNumber twice; check OP existence by threadNumber only
    threadCollection.findOne({
      boardCode,
      threadNumber: parseInt(threadNumber),
    }),
  ]);

  const validPostNumbers = existingPosts.map((post) => post.postNumber);

  // Add thread number if it's in the reply list and thread exists (reply to OP)
  if (existingThread && targets.includes(parseInt(threadNumber))) {
    validPostNumbers.push(parseInt(threadNumber));
  }

  return validPostNumbers;
}

/* =========================================================
   NEW “FULL FLOW” HELPERS (DO NOT BREAK HUMANS)
   ========================================================= */

/**
 * createThreadFull
 * - createThread
 * - incrementBoardPostCount (+1)
 *
 * Use this for AI so you don't forget the increment.
 * Humans can keep their route behavior; this doesn't remove anything.
 */
export async function createThreadFull(threadData) {
  const thread = await createThread(threadData);
  await incrementBoardPostCount(thread.boardCode, 1);
  return thread;
}

/**
 * createPostFull
 * - creates post
 * - validates reply targets (optional; pass validate=true)
 * - updates parent replies[]
 * - increments thread stats (+replies, +images) with sage control
 * - increments board count
 *
 * Use this for AI tick.
 */
export async function createPostFull(postData, { validate = false } = {}) {
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

  // reply graph
  if (finalReplyTo.length) {
    await addReplyToParentPosts(boardCode, threadNumber, created.postNumber, finalReplyTo);
  }

  // thread stats
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

  // board stats
  await incrementBoardPostCount(boardCode, 1);

  return created;
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
    // Count posts and threads for this board
    const [postCount, threadCount] = await Promise.all([
      postCollection.countDocuments({ boardCode: board.code }),
      threadCollection.countDocuments({ boardCode: board.code }),
    ]);

    const totalCount = postCount + threadCount;

    // Update the board's post count
    await boardCollection.updateOne(
      { code: board.code },
      { $set: { postCount: totalCount } }
    );
  }

  console.log("Board post counts synchronized successfully");
}
