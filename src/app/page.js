import Link from 'next/link';
import Image from 'next/image';
import { getAllBoards, getAllThreads } from '@/lib/db-operations';
import AddressDisplay from './components/Copy';
import InfoModal from './components/InfoModal';
import Marquee from 'react-fast-marquee';

// Force dynamic rendering to ensure fresh data
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function HomePage() {
  const boards = await getAllBoards();
  const threads = await getAllThreads();
  
  // Create a mapping from board code to board name
  const boardMap = boards.reduce((map, board) => {
    map[board.code] = board.name;
    return map;
  }, {});
  
  // Calculate total posts across all boards
  const totalPosts = boards.reduce((sum, board) => sum + board.postCount, 0);
  
  // Get top 6 threads with images, sorted by reply count
  const popularThreads = threads
    .filter(thread => thread.imageUrl && thread.imageUrl.trim() !== '') // Only threads with images
    .sort((a, b) => (b.replies || 0) - (a.replies || 0)) // Sort by reply count descending
    .slice(0, 6); // Take top 6
  
  // Example contract address - replace with your actual contract address
  const contractAddress = "dogbonk";

  return (
    <div className="max-w-4xl mx-auto p-4 mt-6 md:mt-8 min-h-screen flex flex-col">
      <div className='w-screen absolute top-0 inset-0'>
        <Marquee speed={100}>
          <p className="text-[#890000]">
            4bonk is a 4chan inspired platform for <a href="https://bonk.fun" className='inline text-blue-600 underline'>bonk.fun</a> and crypto culture. We aim to be the hub for major discourse of all crypto topics. Since we are heavily inspired by 4chan many of the same features the internet has loved for decades are available. For example the legendary greentext with &gt; and reply to post with &gt;&gt;. 4bonk was built by a dedicated team with a passion for crypto and the extreme culture that comes with it. We are a small team of traders, developers, and overall crypto-natives. We built 4bonk because we believe there {`isn't`} anything like this for the general crypto culture.&nbsp;
          </p>
        </Marquee>
      </div>
      {/* Top left area with X link and contract address */}
      <div className="flex justify-between items-start mb-4 absolute top-5 right-1">
        <div className="flex items-center gap-1">
          <Link
            href="https://x.com/4bonkorg"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#890000] font-semibold text-base mt-0"
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
          style={{
            width: '35%',
            height: 'auto',
          }}
          priority
        />
      </div>

      <div className='flex justify-center mb-[3%]'>
        <img src="/headr.png" className='size-[50%] border' />
      </div>

      <div className="bg-[#fff0c5] border-1 border-orange-700 h-min">
        <div className='bg-[#f0cb5c]'>
          <h2 className="text-lg font-bold mb-2 text-[#890000] px-2">Boards</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 p-4">
          {boards.map((board) => (
            <Link
              key={board.code}
              href={`/${board.code}`}
              className="block p-1 border-1 border-orange-700 relative"
            >
              <div className="font-bold text-blue-600 absolute top-1 right-1">/{board.code}/</div>
              <div className="text-sm font-bold text-gray-700">{board.name}</div>
              <div className="text-xs text-gray-500 mt-1">{board.description}</div>
            </Link>
          ))}
        </div>
      </div>

      {/* Popular Threads section */}
      <div className="bg-[#fff0c5] border-1 border-orange-700 h-min mt-4">
        <div className='bg-[#f0cb5c]'>
          <h2 className="text-lg font-bold mb-2 text-[#890000] px-2">Popular Threads</h2>
        </div>
        <div className="p-4">
          {popularThreads.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {popularThreads.map((thread, index) => (
                <Link
                  key={thread.id || `thread-${index}`}
                  href={`/${thread.boardCode}/thread/${thread.threadNumber || thread.id || index}`}
                  className="block bg-white border border-gray-300 overflow-hidden relative p-1"
                >
                  {/* Board name overlay */}
                  <div className="text-center">
                    <span className="px-3 py-2 rounded text-sm font-semibold">
                      {boardMap[thread.boardCode] || thread.boardCode}
                    </span>
                  </div>
                  
                  {/* Thread image */}
                  <div className="aspect-video bg-white p-2 overflow-hidden relative">
                    <img 
                      src={thread.imageUrl} 
                      alt={thread.subject || 'Thread image'}
                      className="w-full h-full object-contain"
                    />
                  </div>
                  
                  {/* Thread info */}
                  <div className="p-3">
                    <div className="font-semibold text-sm text-gray-800 mb-1 line-clamp-2">
                      {thread.subject || 'No Subject'}
                    </div>
                    <div className="text-xs text-gray-600 mb-6 line-clamp-3">
                      {thread.content?.substring(0, 100)}
                      {thread.content?.length > 100 && '...'}
                    </div>
                    <div className="flex justify-between items-center text-xs text-gray-500 absolute bottom-2 right-2">
                      <span>/{thread.boardCode}/</span>
                      <span>{thread.replies || 0} replies</span>
                    </div>
                    <div className="text-xs text-gray-400 mt-1 absolute bottom-2 left-2">
                      {thread.createdAt && new Date(thread.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="bg-white border-1 border-orange-700 p-6 text-center">
              <div className="text-lg font-semibold text-gray-500 mb-2">No Popular Threads</div>
              <div className="text-sm text-gray-400">No threads with images found yet</div>
            </div>
          )}
        </div>
      </div>

      {/* Stats area with same style as boards */}
      <div className="bg-[#fff0c5] border-1 border-orange-700 h-min mt-4">
        <div className='bg-[#f0cb5c]'>
          <h2 className="text-lg font-bold mb-2 text-[#890000] px-2">Stats</h2>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="border-1 border-orange-700 p-4 text-center">
              <div className="text-2xl font-bold text-[#890000]">{boards.length}</div>
              <div className="text-sm text-gray-600">Total Boards</div>
            </div>
            <div className="border-1 border-orange-700 p-4 text-center">
              <div className="text-2xl font-bold text-[#890000]">{totalPosts.toLocaleString()}</div>
              <div className="text-sm text-gray-600">Total Posts</div>
            </div>
          </div>
        </div>
      </div>

      <div className='text-[10px] text-[#890000] text-center mt-auto py-4'>
        Copyright © 4bonk 2025. All rights reserved.
      </div>
    </div>
  );
};