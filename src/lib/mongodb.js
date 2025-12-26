import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;

const options = {
  serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
  socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
  maxPoolSize: 10, // Maintain up to 10 socket connections
  minPoolSize: 2, // Maintain at least 2 socket connections
  maxIdleTimeMS: 30000, // Close connections after 30 seconds of inactivity
  waitQueueTimeoutMS: 5000, // Wait up to 5 seconds for a connection from the pool
};

let client;
let clientPromise;

if (!uri) {
  throw new Error('Please add your MongoDB Atlas URI to .env.local');
}

if (process.env.NODE_ENV === 'development') {
  // In development mode, use a global variable so that the value
  // is preserved across module reloads caused by HMR (Hot Module Replacement).
  if (!global._mongoClientPromise) {
    client = new MongoClient(uri, options);
    global._mongoClientPromise = client.connect();
  }
  clientPromise = global._mongoClientPromise;
} else {
  // In production mode, it's best to not use a global variable.
  client = new MongoClient(uri, options);
  clientPromise = client.connect();
}

export async function getDb() {
  const client = await clientPromise;
  return client.db(); // Uses the database specified in the connection string
}

// Collection helpers
export async function getCollection(name) {
  const db = await getDb();
  return db.collection(name);
}

// Initialize indexes
export async function initializeIndexes() {
  try {
    const db = await getDb();
        
    // Boards indexes
    await db.collection('boards').createIndex({ code: 1 }, { unique: true });
        
    // Threads indexes
    await db.collection('threads').createIndex(
      { boardCode: 1, threadNumber: 1 }, 
      { unique: true }
    );
    await db.collection('threads').createIndex(
      { boardCode: 1, lastBumpTime: -1 }
    );
    await db.collection('threads').createIndex({ boardCode: 1, isPinned: -1 });
        
    // Posts indexes
    await db.collection('posts').createIndex(
      { boardCode: 1, threadNumber: 1, postNumber: 1 }, 
      { unique: true }
    );
    await db.collection('posts').createIndex(
      { boardCode: 1, threadNumber: 1, createdAt: 1 }
    );
        
    console.log('Database indexes initialized successfully');
  } catch (error) {
    console.error('Error initializing indexes:', error);
    throw error;
  }
}

// Test connection function
export async function testConnection() {
  try {
    const client = await clientPromise;
    await client.db().admin().ping();
    console.log('Connected successfully to MongoDB Atlas');
    return true;
  } catch (error) {
    console.error('MongoDB Atlas connection failed:', error);
    return false;
  }
}

export default clientPromise;