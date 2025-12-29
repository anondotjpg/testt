'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { BsPinAngleFill } from 'react-icons/bs';
import { FaLock } from "react-icons/fa";
import Post from '@/app/components/Post';
import PostForm from '@/app/components/PostForm';

export default function ThreadPage({ params }) {
  // Unwrap the params Promise using React.use()
  const { boardCode, threadNumber } = use(params);
  
  const [thread, setThread] = useState(null);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hiddenPosts, setHiddenPosts] = useState(new Set());
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

  const fetchThread = async () => {
    try {
      const response = await fetch(`/api/${boardCode}/threads/${threadNumber}`);
      if (response.ok) {
        const data = await response.json();
        setThread(data.thread);
        setPosts(data.posts);
      }
    } catch (error) {
      console.error('Failed to fetch thread:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBoards();
    fetchThread();
  }, [boardCode, threadNumber]);

  const handlePostCreated = (newPost) => {
    setPosts(prev => [...prev, newPost]);
    setThread(prev => ({
      ...prev,
      replies: prev.replies + 1,
      images: prev.images + (newPost.imageUrl ? 1 : 0)
    }));
  };

  const togglePostVisibility = (postNumber) => {
    setHiddenPosts(prev => {
      const newSet = new Set(prev);
      if (newSet.has(postNumber)) {
        newSet.delete(postNumber);
      } else {
        newSet.add(postNumber);
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

  if (!thread) {
    return <div className="text-center p-8">Thread not found</div>;
  }

  return (
    <div className="max-w-sm md:max-w-5xl mx-auto px-4 pb-4">
      {/* Top center board links */}
      <div className="text-center mb-4 md:mb-6 invisible md:visible">
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
            <h1 className="text-xl md:text-3xl font-bold text-[#890000] text-center">
              /{boardCode}/ - {thread.subject || `Thread #${thread.threadNumber}`}
            </h1>
          </div>
          <Link href={`/${boardCode}`} className="text-blue-600 hover:underline absolute top-4 left-4">
            [Return to Board]
          </Link>
        </div>

        {thread.isLocked && (
          <div className="bg-gray-100 border border-gray-400 text-gray-700 px-4 py-2 mb-4 text-center">
            <strong>Thread Locked:</strong> No new replies can be posted
          </div>
        )}
      </div>

      {!thread.isLocked && (
        <div className='flex justify-center'>
          <PostForm 
            boardCode={boardCode} 
            threadNumber={threadNumber}
            onPostCreated={handlePostCreated}
          />
        </div>
      )}

      {/* OP Post */}
      <div className="border border-gray-300 bg-white">
        <div className="p-4">
          <div className="flex items-center mb-2">
            {thread.isPinned && (
              <BsPinAngleFill className="text-red-600 mr-2" size={16} title="Pinned" />
            )}
            {thread.isLocked && (
              <FaLock className="text-gray-600 mr-2" size={14} title="Locked" />
            )}
            <span className="font-bold">
              {thread.subject || `Thread #${thread.threadNumber}`}
            </span>
            <span className="text-gray-500 text-sm ml-2">
              ({posts.length} replies, {thread.images} images)
            </span>
          </div>

          <Post post={thread} isOP={true} boardCode={boardCode} />

          {/* Replies section */}
          {posts.length > 0 && (
            <div className="mt-4 pl-4 border-l-2 border-gray-300">
              <div className="text-sm text-gray-600 mb-2">
                {posts.length} {posts.length === 1 ? 'reply' : 'replies'}:
              </div>
              <div className="space-y-4">
                {posts.map((post) => (
                  <Post 
                    key={post.postNumber}
                    post={post} 
                    boardCode={boardCode}
                    onToggleHide={() => togglePostVisibility(post.postNumber)}
                    isHidden={hiddenPosts.has(post.postNumber)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="text-center mt-6 text-gray-500 text-sm">
        {posts.length} replies • {thread.images} images
      </div>
    </div>
  );
}