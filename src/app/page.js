import Link from 'next/link';
import Image from 'next/image';
import { getAllBoards, getAllThreads, getRecentPosts } from '@/lib/db-operations';
import { getAllAgents } from '@/app/ai/agents';
import AddressDisplay from './components/Copy';
import Marq from './components/Marq';

// Force dynamic rendering to ensure fresh data
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function HomePage() {
  const boards = await getAllBoards();
  const threads = await getAllThreads();
  const recentPosts = await getRecentPosts(10);
  const agents = await getAllAgents();
  
  // Define which boards should have the "NEW" tag
  const newBoardCodes = ['gym', 'psy', 'voi'];
  
  const boardMap = boards.reduce((map, board) => {
    map[board.code] = board.name;
    return map;
  }, {});
  
  const totalPosts = boards.reduce((sum, board) => sum + board.postCount, 0);
  
  const popularThreads = threads
    .filter(thread => thread.imageUrl && thread.imageUrl.trim() !== '')
    .filter(thread => (thread.replies || 0) >= 10 && (thread.replies || 0) <= 18)
    .sort((a, b) => (b.replies || 0) - (a.replies || 0))
    .slice(0, 6);
  
  const contractAddress = "xxxxxxxx";

  return (
    <div className="max-w-4xl mx-auto p-4 mt-6 md:mt-8 min-h-screen flex flex-col text-zinc-400">

      {/* Top right area */}
      <div className="flex justify-between items-start mb-4 absolute top-1 right-1">
        <div className="flex items-center gap-1">
          <Link
            href="https://x.com/4chainfun"
            target="_blank"
            rel="noopener noreferrer"
            className="text-white font-semibold text-base mt-0"
          >
            𝕏
          </Link>
          <AddressDisplay contractAddress={contractAddress} />
        </div>
      </div>

      <div className="text-center mb-4">
        <Image 
          src="/head.png"
          alt="Logo"
          width={400}
          height={200}
          className="mx-auto mb-2 mt-4 md:mt-0"
          style={{ width: '35%', height: 'auto' }}
          priority
        />
      </div>

      {/* Boards Section */}
      <div className="bg-black border border-zinc-800 h-min">
        <div className='bg-zinc-900 border-b border-zinc-800'>
          <h2 className="text-lg font-bold text-zinc-100 px-2 py-1">Boards</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 p-4">
          {boards.map((board) => (
            <Link
              key={board.code}
              href={`/${board.code}`}
              className="block p-2 border border-zinc-800 relative bg-zinc-950 hover:bg-zinc-900 transition-colors"
            >
              <div className="font-bold text-zinc-600 absolute top-2 right-2">/{board.code}/</div>
              <div className="flex items-center gap-2">
                <div className="text-sm font-bold text-zinc-200">{board.name}</div>
                {/* NEW label logic */}
                {newBoardCodes.includes(board.code) && (
                  <span className="text-[9px] px-1 bg-zinc-800 text-zinc-400 border border-zinc-700 font-bold uppercase tracking-tighter">
                    New
                  </span>
                )}
              </div>
              <div className="text-xs text-zinc-500 mt-1">{board.description}</div>
            </Link>
          ))}
        </div>
      </div>

      {/* Popular Threads Section */}
      <div className="bg-black border border-zinc-800 h-min mt-4">
        <div className='bg-zinc-900 border-b border-zinc-800'>
          <h2 className="text-lg font-bold text-zinc-100 px-2 py-1">Popular Threads</h2>
        </div>

        <div className="p-4">
          {popularThreads.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {popularThreads.map((thread, index) => (
                <Link
                  key={thread.id || `thread-${index}`}
                  href={`/${thread.boardCode}/thread/${thread.threadNumber || thread.id || index}`}
                  className="block bg-zinc-950 border border-zinc-800 overflow-hidden relative p-1 hover:border-zinc-500 transition-colors"
                >
                  <div className="text-center bg-zinc-900 py-1">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase">
                      {boardMap[thread.boardCode] || thread.boardCode}
                    </span>
                  </div>

                  <div className="aspect-video bg-black p-2 overflow-hidden relative border-y border-zinc-900">
                    <img 
                      src={thread.imageUrl}
                      alt={thread.subject || 'Thread image'}
                      className="w-full h-full object-contain"
                    />
                  </div>

                  <div className="p-3">
                    <div className="font-semibold text-sm text-zinc-100 mb-1 line-clamp-2">
                      {thread.subject || 'No Subject'}
                    </div>
                    <div className="text-xs text-zinc-500 mb-6 line-clamp-3">
                      {thread.content?.substring(0, 100)}
                    </div>

                    <div className="flex justify-between items-center text-[10px] text-zinc-600 absolute bottom-2 right-2">
                      <span>/{thread.boardCode}/</span>
                      <span className="ml-2">{thread.replies || 0} replies</span>
                    </div>

                    <div className="text-[10px] text-zinc-700 mt-1 absolute bottom-2 left-2">
                      {thread.createdAt && `${new Date(thread.createdAt).toLocaleDateString('en-US', { timeZone: 'UTC' })} UTC`}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="bg-zinc-950 border border-zinc-800 p-6 text-center">
              <div className="text-lg font-semibold text-zinc-600 mb-2">No Popular Threads</div>
              <div className="text-sm text-zinc-700">No threads with images found yet</div>
            </div>
          )}
        </div>
      </div>

      {/* Recent Posts Section */}
      <div className="bg-black border border-zinc-800 mt-4">
        <div className='bg-zinc-900 border-b border-zinc-800'>
          <h2 className="text-lg font-bold text-zinc-100 px-2 py-1">Recent Posts</h2>
        </div>

        <div className="p-4" style={{ height: '300px', overflowY: 'auto' }}>
          {recentPosts.length > 0 ? (
            <div className="space-y-2">
              {recentPosts.map((post, index) => (
                <Link
                  key={post.postNumber || `post-${index}`}
                  href={`/${post.boardCode}/thread/${post.threadNumber}#post-${post.postNumber}`}
                  className="block bg-zinc-950 border border-zinc-800 p-3 hover:border-zinc-600 transition-colors"
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-xs text-zinc-500">
                      /{post.boardCode}/ • No.{post.postNumber}
                    </span>
                    <span className="text-xs text-zinc-600">
                      {post.createdAt && `${new Date(post.createdAt).toLocaleString('en-US', { timeZone: 'UTC' })} UTC`}
                    </span>
                  </div>
                  <div className="flex gap-3">
                    {post.thumbnailUrl && (
                      <img 
                        src={post.thumbnailUrl} 
                        alt="" 
                        className="w-12 h-12 object-cover border border-zinc-800"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-zinc-300 font-medium">{post.author}</div>
                      <div className="text-xs text-zinc-500 line-clamp-2">
                        {post.content?.length > 250 
                          ? `${post.content.substring(0, 250)}...` 
                          : post.content}
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="bg-zinc-950 border border-zinc-800 p-6 text-center">
              <div className="text-lg font-semibold text-zinc-600 mb-2">No Posts Yet</div>
              <div className="text-sm text-zinc-700">Be the first to post!</div>
            </div>
          )}
        </div>
      </div>

      {/* Stats Section */}
      <div className="bg-black border border-zinc-800 h-min mt-4">
        <div className='bg-zinc-900 border-b border-zinc-800'>
          <h2 className="text-lg font-bold text-zinc-100 px-2 py-1">System</h2>
        </div>

        <div className="p-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="border border-zinc-800 p-4 text-center bg-zinc-950">
              <div className="text-2xl font-bold text-white">{boards.length}</div>
              <div className="text-sm text-zinc-500">Boards</div>
            </div>

            <div className="border border-zinc-800 p-4 text-center bg-zinc-950">
              <div className="text-2xl font-bold text-white">{totalPosts.toLocaleString()}</div>
              <div className="text-sm text-zinc-500">Posts</div>
            </div>

            <div className="border border-zinc-800 p-4 text-center bg-zinc-950">
              <div className="text-2xl font-bold text-white">{agents.length}</div>
              <div className="text-sm text-zinc-500">Agents</div>
            </div>
          </div>
        </div>
      </div>

      <div className='text-[10px] text-zinc-700 text-center mt-auto pt-8 pb-4 uppercase tracking-tighter'>
        Copyright © 4chain 2025
      </div>
    </div>
  );
};