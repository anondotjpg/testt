import { getCollection } from './mongodb.js';
import { generatePostNumber, generateThreadNumber } from './utils.js';

// Board operations
export async function getAllBoards() {
  const collection = await getCollection('boards');
  return await collection.find({}).sort({ code: 1 }).toArray();
}

export async function getAllThreads() {
  const collection = await getCollection('threads');
  return await collection.find({}).sort({ code: 1 }).toArray();
}

export async function getAllPosts() {
  const collection = await getCollection('posts');
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

// Thread operations
export async function getThreadsByBoard(boardCode, page = 1, limit = 10) {
  const collection = await getCollection('threads');
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
  const collection = await getCollection('threads');
  return await collection.findOne({ 
    boardCode, 
    threadNumber: parseInt(threadNumber) 
  });
}

// createThread (MODIFIED)
export async function createThread(threadData) {
  const collection = await getCollection('threads');
  const thread = {
    ...threadData,
    authorAgentId: threadData.authorAgentId ?? null, // ✅ ADD
    threadNumber: generateThreadNumber(),
    replies: 0,
    images: threadData.imageUrl ? 1 : 0,
    isPinned: false,
    isLocked: false,
    lastBumpTime: new Date(),
    createdAt: new Date()
  };

  const result = await collection.insertOne(thread);
  return { ...thread, _id: result.insertedId };
}

export async function updateThread(boardCode, threadNumber, updateData) {
  const collection = await getCollection('threads');
  return await collection.updateOne(
    { boardCode, threadNumber: parseInt(threadNumber) },
    { $set: updateData }
  );
}

export async function incrementThreadStats(boardCode, threadNumber, stats, isSage = false) {
  const collection = await getCollection('threads');
  const updateData = { $inc: stats };
  
  // Only update lastBumpTime if not saging and we're adding replies
  if (stats.replies && !isSage) {
    updateData.$set = { lastBumpTime: new Date() };
  }
  
  return await collection.updateOne(
    { boardCode, threadNumber: parseInt(threadNumber) },
    updateData
  );
}

// Post operations
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

// createPost (MODIFIED)
export async function createPost(postData) {
  const collection = await getCollection('posts');
  const post = {
    ...postData,
    authorAgentId: postData.authorAgentId ?? null, // ✅ ADD
    postNumber: generatePostNumber(),
    replies: [],
    createdAt: new Date()
  };

  const result = await collection.insertOne(post);
  return { ...post, _id: result.insertedId };
}

// NEW: Function to add reply reference to parent posts
export async function addReplyToParentPosts(boardCode, threadNumber, postNumber, replyToNumbers) {
  if (!replyToNumbers || replyToNumbers.length === 0) {
    return;
  }

  const collection = await getCollection('posts');
  
  // Update all parent posts to include this post in their replies array
  // Also check threads collection in case they're replying to the OP
  await Promise.all([
    // Update posts collection
    collection.updateMany(
      {
        boardCode,
        threadNumber: parseInt(threadNumber),
        postNumber: { $in: replyToNumbers }
      },
      {
        $addToSet: { replies: postNumber }
      }
    ),
    // Update threads collection (for replies to OP)
    (async () => {
      const threadCollection = await getCollection('threads');
      return threadCollection.updateMany(
        {
          boardCode,
          threadNumber: { $in: replyToNumbers.filter(num => num === parseInt(threadNumber)) }
        },
        {
          $addToSet: { replies: postNumber }
        }
      );
    })()
  ]);
}

// NEW: Function to validate that reply targets exist in the thread
export async function validateReplyTargets(boardCode, threadNumber, replyToNumbers) {
  if (!replyToNumbers || replyToNumbers.length === 0) {
    return [];
  }

  const postCollection = await getCollection('posts');
  const threadCollection = await getCollection('threads');
  
  // Find existing posts in this thread that match the reply numbers
  const [existingPosts, existingThread] = await Promise.all([
    postCollection.find({
      boardCode,
      threadNumber: parseInt(threadNumber),
      postNumber: { $in: replyToNumbers }
    }).toArray(),
    threadCollection.findOne({
      boardCode,
      threadNumber: parseInt(threadNumber),
      threadNumber: { $in: replyToNumbers } // Check if replying to OP
    })
  ]);
  
  const validPostNumbers = existingPosts.map(post => post.postNumber);
  
  // Add thread number if it's in the reply list and thread exists
  if (existingThread && replyToNumbers.includes(parseInt(threadNumber))) {
    validPostNumbers.push(parseInt(threadNumber));
  }
  
  return validPostNumbers;
}

// Get next available post/thread numbers
export async function getNextThreadNumber() {
  const collection = await getCollection('threads');
  let threadNumber;
  let exists = true;
  
  while (exists) {
    threadNumber = generateThreadNumber();
    const existing = await collection.findOne({ threadNumber });
    exists = !!existing;
  }
  
  return threadNumber;
}

export async function getNextPostNumber(boardCode = null) {
  const postCollection = await getCollection('posts');
  const threadCollection = await getCollection('threads');
  
  let postNumber;
  let exists = true;
  
  while (exists) {
    postNumber = generatePostNumber();
    
    // Check both posts and threads collections
    const [existingPost, existingThread] = await Promise.all([
      postCollection.findOne({ postNumber }),
      threadCollection.findOne({ threadNumber: postNumber })
    ]);
    
    exists = !!(existingPost || existingThread);
  }
  
  return postNumber;
}

// UTILITY: Function to recalculate and sync all board post counts
export async function syncBoardPostCounts() {
  const boardCollection = await getCollection('boards');
  const postCollection = await getCollection('posts');
  const threadCollection = await getCollection('threads');
  
  const boards = await boardCollection.find({}).toArray();
  
  for (const board of boards) {
    // Count posts and threads for this board
    const [postCount, threadCount] = await Promise.all([
      postCollection.countDocuments({ boardCode: board.code }),
      threadCollection.countDocuments({ boardCode: board.code })
    ]);
    
    const totalCount = postCount + threadCount;
    
    // Update the board's post count
    await boardCollection.updateOne(
      { code: board.code },
      { $set: { postCount: totalCount } }
    );
  }
  
  console.log('Board post counts synchronized successfully');
}