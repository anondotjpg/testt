'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { BsPinAngleFill, BsLockFill } from 'react-icons/bs';
import { FaLock } from "react-icons/fa";
import Post from '../components/Post';
import PostForm from '../components/PostForm';

export default function BoardPage({ params }) {
  // Unwrap the params Promise using React.use()
  const { boardCode } = use(params);
  
  const [board, setBoard] = useState(null);
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [hiddenThreads, setHiddenThreads] = useState(new Set());
  const [allBoards, setAllBoards] = useState([]);

  const fetchBoards = async () => {
    try {
      const response = await fetch('/api/boards');
      if (response.ok) {
        const boards = await response.json();
        setAllBoards(boards);
      }
    } catch (error) {
      console.error('Failed to fetch boards:', error);
    }
  };

  const fetchThreads = async (pageNum = 1, append = false) => {
    try {
      const response = await fetch(`/api/${boardCode}/threads?page=${pageNum}`);
      if (response.ok) {
        const data = await response.json();
        setBoard(data.board);
        
        // Sort threads: pinned posts first, then by replies in descending order
        const sortedThreads = data.threads.sort((a, b) => {
          // If one is pinned and the other isn't, prioritize pinned
          if (a.isPinned && !b.isPinned) return -1;
          if (!a.isPinned && b.isPinned) return 1;
          
          // If both are pinned or both are not pinned, sort by replies (descending)
          return b.replies - a.replies;
        });
        
        setThreads(prev => append ? [...prev, ...sortedThreads] : sortedThreads);
        setHasMore(data.hasMore);
      }
    } catch (error) {
      console.error('Failed to fetch threads:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBoards();
    fetchThreads();
  }, [boardCode]);

  const loadMore = () => {
    if (hasMore && !loading) {
      setPage(prev => prev + 1);
      fetchThreads(page + 1, true);
    }
  };

  const handleThreadCreated = () => {
    fetchThreads(); // Refresh the thread list
  };

  const toggleThreadVisibility = (threadNumber) => {
    setHiddenThreads(prev => {
      const newSet = new Set(prev);
      if (newSet.has(threadNumber)) {
        newSet.delete(threadNumber);
      } else {
        newSet.add(threadNumber);
      }
      return newSet;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <img
          src="/load.gif"
          alt="Loading..."
          className="w-24 h-24"
        />
      </div>
    );
  }  

  if (!board) {
    return <div className="text-center p-8">Board not found</div>;
  }

  return (
    <div className="max-w-sm md:max-w-5xl mx-auto px-4 pb-4">
      {/* Top center board links */}
      <div className="text-center mb-4 md:mb-6">
        <div className="text-sm">
          [
          {allBoards.map((b, index) => (
            <span key={b.code}>
              <Link
                href={`/${b.code}`}
                title={`${b.name}${b.description ? ` - ${b.description}` : ''}`}
                className={`hover:underline font-mono ${
                  b.code === boardCode ? 'text-red-600 font-bold' : 'text-blue-600'
                }`}
              >
                {b.code}
              </Link>
              {index < allBoards.length - 1 && ' / '}
            </span>
          ))}
          ]
        </div>
      </div>

      <div className="pt-4 mb-6">
        <div className="flex items-center justify-between mb-6">
          <div className='absolute left-1/2 -translate-x-1/2 mb-2'>
            <h1 className="text-xl md:text-3xl font-bold text-[#890000]">/{board.code}/ - {board.name}</h1>
            {board.description && (
              <p className="text-gray-600 mt-1 text-center hidden md:block">{board.description}</p>
            )}
          </div>
          <Link href="/" className="text-blue-600 hover:underline hidden md:block absolute top-4 left-4">
            [Return to Boards]
          </Link>
        </div>
        
        {board.isNSFW && (
          <div className='absolute top-2 right-2 hidden md:block'>
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-2 -mb-6 w-min whitespace-nowrap">
              <strong>NSFW Warning</strong>
            </div>
          </div>
        )}
      </div>

      <div className='flex justify-center'>
        <PostForm 
            boardCode={boardCode} 
            onPostCreated={handleThreadCreated}
        />
      </div>

      <div className="space-y-6">
        {threads.map((thread) => {
          const isHidden = hiddenThreads.has(thread.threadNumber);
          
          return (
            <div key={thread.threadNumber} className="border border-gray-300 bg-white">
              <div className="p-4">
                <div className="flex items-start">
                  <button
                    onClick={() => toggleThreadVisibility(thread.threadNumber)}
                    className="text-gray-600 hover:text-gray-800 font-mono text-sm mr-2 mt-0.5 select-none cursor-pointer"
                    title={isHidden ? "Show thread content" : "Hide thread content"}
                  >
                    [{isHidden ? '+' : '−'}]
                  </button>
                  
                  <div className="flex-1">
                    {thread.isPinned && (
                      <BsPinAngleFill className="inline text-red-600 mr-2" size={16} title="Pinned" />
                    )}
                    {thread.isLocked && (
                      <FaLock className="inline text-gray-600 mr-2" size={14} title="Locked" />
                    )}
                    <Link 
                      href={`/${boardCode}/thread/${thread.threadNumber}`}
                      className="text-blue-600 hover:underline font-bold"
                    >
                      {thread.subject || `Thread #${thread.threadNumber}`}
                    </Link>
                    <span className="text-gray-500 text-sm ml-2">
                      ({thread.replies} replies, {thread.images} images)
                    </span>
                    <Link
                        href={`/${boardCode}/thread/${thread.threadNumber}`}
                        className="text-gray-800 text-sm ml-2"
                    >
                      [reply]
                    </Link>
                  </div>
                </div>

                {!isHidden && (
                  <>
                    <Post post={thread} isOP={true} boardCode={boardCode} />

                    {thread.recentPosts && thread.recentPosts.length > 0 && (
                      <div className="mt-4 pl-4 border-l-2 border-gray-300">
                        <div className="text-sm text-gray-600 mb-2">Recent replies:</div>
                        {thread.recentPosts.map((post) => (
                          <div key={post.postNumber} className="mb-2">
                            <Post post={post} boardCode={boardCode} />
                          </div>
                        ))}
                        {thread.replies > 5 && (
                          <Link
                            href={`/${boardCode}/thread/${thread.threadNumber}`}
                            className="text-blue-600 hover:underline text-sm"
                          >
                            View all {thread.replies} replies →
                          </Link>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {hasMore && (
        <div className="text-center mt-6">
          <button
            onClick={loadMore}
            disabled={loading}
            className="bg-gray-200 hover:bg-gray-300 px-6 py-2 border border-gray-400 disabled:opacity-50 cursor-pointer"
          >
            {loading ? 'Loading...' : 'Load More Threads'}
          </button>
        </div>
      )}
    </div>
  );
}