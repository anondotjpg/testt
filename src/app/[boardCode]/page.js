'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { BsPinAngleFill } from 'react-icons/bs';
import { FaLock } from "react-icons/fa";
import Post from '../components/Post';
import PostForm from '../components/PostForm';

export default function BoardPage({ params }) {
  // Unwrap params (Next 14.2+ / 15 behavior)
  const { boardCode } = use(params);

  console.log('[BoardPage] resolved boardCode:', boardCode);

  const [board, setBoard] = useState(null);
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [hiddenThreads, setHiddenThreads] = useState(new Set());
  const [allBoards, setAllBoards] = useState([]);

  const fetchBoards = async () => {
    console.log('[fetchBoards] fetching /api/boards');
    try {
      const response = await fetch('/api/boards');
      console.log('[fetchBoards] status:', response.status);

      if (!response.ok) {
        console.error('[fetchBoards] non-OK response');
        return;
      }

      const boards = await response.json();
      console.log('[fetchBoards] received boards:', boards);
      setAllBoards(boards);
    } catch (error) {
      console.error('[fetchBoards] error:', error);
    }
  };

  const fetchThreads = async (pageNum = 1, append = false) => {
    console.log('[fetchThreads] start', { boardCode, pageNum, append });

    try {
      const url = `/api/${boardCode}/threads?page=${pageNum}`;
      console.log('[fetchThreads] fetching:', url);

      const response = await fetch(url);
      console.log('[fetchThreads] response status:', response.status);

      if (!response.ok) {
        const text = await response.text();
        console.error('[fetchThreads] non-OK body:', text);
        return;
      }

      const data = await response.json();
      console.log('[fetchThreads] response data:', data);

      setBoard(data.board);

      if (!data.board) {
        console.warn('[fetchThreads] board is NULL from API');
      }

      const sortedThreads = data.threads.sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        return b.replies - a.replies;
      });

      setThreads(prev =>
        append ? [...prev, ...sortedThreads] : sortedThreads
      );

      setHasMore(data.hasMore);
    } catch (error) {
      console.error('[fetchThreads] exception:', error);
    } finally {
      setLoading(false);
      console.log('[fetchThreads] done');
    }
  };

  useEffect(() => {
    console.log('[BoardPage] useEffect fired for boardCode:', boardCode);
    fetchBoards();
    fetchThreads();
  }, [boardCode]);

  const loadMore = () => {
    console.log('[loadMore] clicked');
    if (hasMore && !loading) {
      const next = page + 1;
      setPage(next);
      fetchThreads(next, true);
    }
  };

  const handleThreadCreated = () => {
    console.log('[handleThreadCreated] refreshing threads');
    fetchThreads();
  };

  const toggleThreadVisibility = (threadNumber) => {
    console.log('[toggleThreadVisibility]', threadNumber);
    setHiddenThreads(prev => {
      const next = new Set(prev);
      next.has(threadNumber) ? next.delete(threadNumber) : next.add(threadNumber);
      return next;
    });
  };

  console.log('[render] loading:', loading, 'board:', board);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <img src="/load.gif" alt="Loading..." className="w-24 h-24" />
      </div>
    );
  }

  if (!board) {
    console.warn('[render] board is null → showing Board not found');
    return <div className="text-center p-8">Board not found</div>;
  }

  return (
    <div className="max-w-sm md:max-w-6xl mx-auto px-4 pb-4">
      <div className="text-center mb-4 md:mb-6">
        <div className="text-sm">
          [
          {allBoards.map((b, i) => (
            <span key={b.code}>
              <Link
                href={`/${b.code}`}
                className={`hover:underline font-mono ${
                  b.code === boardCode ? 'text-red-600 font-bold' : 'text-blue-600'
                }`}
              >
                {b.code}
              </Link>
              {i < allBoards.length - 1 && ' / '}
            </span>
          ))}
          ]
        </div>
      </div>

      <div className="pt-4 mb-6">
        <h1 className="text-xl md:text-3xl font-bold text-[#890000] text-center">
          /{board.code}/ - {board.name}
        </h1>
        {board.description && (
          <p className="text-gray-600 mt-1 text-center hidden md:block">
            {board.description}
          </p>
        )}
      </div>

      <div className="flex justify-center">
        <PostForm boardCode={boardCode} onPostCreated={handleThreadCreated} />
      </div>

      <div className="space-y-6">
        {threads.map(thread => {
          const hidden = hiddenThreads.has(thread.threadNumber);
          return (
            <div key={thread.threadNumber} className="border border-gray-300 bg-white">
              <div className="p-4">
                <button
                  onClick={() => toggleThreadVisibility(thread.threadNumber)}
                  className="font-mono text-sm mr-2"
                >
                  [{hidden ? '+' : '−'}]
                </button>

                <Link
                  href={`/${boardCode}/thread/${thread.threadNumber}`}
                  className="text-blue-600 font-bold"
                >
                  {thread.subject || `Thread #${thread.threadNumber}`}
                </Link>

                {!hidden && <Post post={thread} isOP boardCode={boardCode} />}
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
            className="bg-gray-200 px-6 py-2 border"
          >
            {loading ? 'Loading…' : 'Load More Threads'}
          </button>
        </div>
      )}
    </div>
  );
}
