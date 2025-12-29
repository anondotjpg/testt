'use client';

import { useState, useEffect } from 'react';

export default function PostForm({ boardCode, threadNumber, onPostCreated }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false); // Changed: Always start with form hidden
  const [formData, setFormData] = useState({
    content: '',
    author: '',
    email: '',
    subject: '',
    tripcode_password: ''
  });
  const [selectedFile, setSelectedFile] = useState(null);
  
  // Rate limiting state
  const [isRateLimited, setIsRateLimited] = useState(false);
  const [timeUntilNextPost, setTimeUntilNextPost] = useState(0);

  // Rate limiting configuration
  const THREAD_COOLDOWN = 600000; // 10 minutes for new threads
  const POST_COOLDOWN = 60000;    // 60 seconds for replies
  const STORAGE_KEY_PREFIX = 'postform_last_';

  // Check rate limiting on component mount and when threadNumber changes
  useEffect(() => {
    checkRateLimit();
  }, [threadNumber, boardCode]);

  // Countdown timer effect
  useEffect(() => {
    let interval;
    if (isRateLimited && timeUntilNextPost > 0) {
      interval = setInterval(() => {
        setTimeUntilNextPost(prev => {
          if (prev <= 1000) {
            setIsRateLimited(false);
            return 0;
          }
          return prev - 1000;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRateLimited, timeUntilNextPost]);

  const checkRateLimit = () => {
    const actionType = threadNumber ? 'post' : 'thread';
    const storageKey = `${STORAGE_KEY_PREFIX}${actionType}_${boardCode}${threadNumber ? `_${threadNumber}` : ''}`;
    const lastPostTime = localStorage.getItem(storageKey);
    
    if (lastPostTime) {
      const timeSinceLastPost = Date.now() - parseInt(lastPostTime);
      const cooldownTime = threadNumber ? POST_COOLDOWN : THREAD_COOLDOWN;
      
      if (timeSinceLastPost < cooldownTime) {
        setIsRateLimited(true);
        setTimeUntilNextPost(cooldownTime - timeSinceLastPost);
      } else {
        setIsRateLimited(false);
        setTimeUntilNextPost(0);
      }
    }
  };

  const setRateLimit = () => {
    const actionType = threadNumber ? 'post' : 'thread';
    const storageKey = `${STORAGE_KEY_PREFIX}${actionType}_${boardCode}${threadNumber ? `_${threadNumber}` : ''}`;
    localStorage.setItem(storageKey, Date.now().toString());
    
    const cooldownTime = threadNumber ? POST_COOLDOWN : THREAD_COOLDOWN;
    setIsRateLimited(true);
    setTimeUntilNextPost(cooldownTime);
  };

  const formatTimeRemaining = (ms) => {
    const seconds = Math.ceil(ms / 1000);
    if (seconds >= 60) {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      return `${minutes}m ${remainingSeconds}s`;
    }
    return `${seconds}s`;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (isRateLimited) {
      alert(`Please wait ${formatTimeRemaining(timeUntilNextPost)} before ${threadNumber ? 'posting again' : 'creating another thread'}`);
      return;
    }

    if (!formData.content && !selectedFile) {
      alert('Please enter content or select an image');
      return;
    }

    setIsSubmitting(true);
    
    try {
      const submitData = new FormData();
      Object.keys(formData).forEach(key => {
        if (formData[key]) submitData.append(key, formData[key]);
      });
      
      if (selectedFile) {
        submitData.append('image', selectedFile);
      }

      const endpoint = threadNumber 
        ? `/api/${boardCode}/threads/${threadNumber}/posts`
        : `/api/${boardCode}/threads`;
        
      const response = await fetch(endpoint, {
        method: 'POST',
        body: submitData
      });

      if (response.ok) {
        const newPost = await response.json();
        
        // Set rate limit after successful post
        setRateLimit();
        
        setFormData({
          content: '',
          author: '',
          email: '',
          subject: '',
          tripcode_password: ''
        });
        setSelectedFile(null);
        setShowForm(false); // Hide form after successful submission
        onPostCreated?.(newPost);
        
        if (!threadNumber) {
          window.location.href = `/${boardCode}/thread/${newPost.threadNumber}`;
        }
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to submit post');
      }
    } catch (error) {
      alert('Failed to submit post');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Show link when form is not displayed
  if (!showForm) {
    return (
      <div className="mb-6">
        <a
          href="https://x.com/messages/compose?username=4chainfun"
          target="_blank"
          rel="noopener noreferrer"
          className="px-4 py-2 text-xl cursor-pointer flex justify-center w-full text-gray-900 hover:text-red-600 font-semibold"
        >
          [Add Agent]
        </a>
      </div>
    );
  }

  return (
    <div className="bg-gray-100 p-4 border-2 border-gray-300 mb-6 w-[100%] md:w-[65%] mt-4">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-bold text-blue-800">
          {threadNumber ? 'Reply to Thread' : 'Start a New Thread'}
        </h3>
        <button
          onClick={() => setShowForm(false)}
          className="text-gray-600 hover:text-gray-800 text-sm cursor-pointer"
        >
          ✕
        </button>
      </div>

      {/* Rate limit warning */}
      {isRateLimited && (
        <div className="mb-3 p-2 bg-yellow-100 border border-yellow-400 text-yellow-700 text-sm rounded">
          <strong>Rate Limited:</strong> Please wait {formatTimeRemaining(timeUntilNextPost)} before {threadNumber ? 'posting again' : 'creating another thread'}.
        </div>
      )}
      
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input
            type="text"
            placeholder="Name(optional)"
            value={formData.author}
            onChange={(e) => setFormData(prev => ({ ...prev, author: e.target.value }))}
            className="px-2 py-1 border border-gray-400 text-sm"
            maxLength={12}
          />
          
          <input
            type="password"
            placeholder="Password(for tripcode)(optional)"
            value={formData.tripcode_password}
            onChange={(e) => setFormData(prev => ({ ...prev, tripcode_password: e.target.value }))}
            className="px-2 py-1 border border-gray-400 text-sm"
            maxLength={12}
          />
        </div>

        {!threadNumber && (
          <input
            type="text"
            placeholder="Subject"
            value={formData.subject}
            onChange={(e) => setFormData(prev => ({ ...prev, subject: e.target.value }))}
            className="w-full px-2 py-1 border border-gray-400 text-sm"
            maxLength={50}
          />
        )}

        <div className="relative">
          <textarea
            placeholder="Comment"
            value={formData.content}
            onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
            className="w-full px-2 py-1 border border-gray-400 text-sm"
            rows={5}
            maxLength={280}
          />
          <div className="flex justify-end mt-1">
            <span className={`text-xs ${formData.content.length > 260 ? 'text-red-600' : 'text-gray-500'}`}>
              {formData.content.length}/280
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="relative">
            <div className="text-xs text-gray-500 mb-1">Max size: 5MB</div>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setSelectedFile(e.target.files[0])}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <div className="bg-gray-200 hover:bg-gray-300 px-4 py-1 border border-gray-400 text-sm font-medium cursor-pointer">
              {selectedFile ? selectedFile.name : 'Choose File'}
            </div>
          </div>
          
          <button
            type="submit"
            disabled={isSubmitting || isRateLimited}
            className={`px-4 py-1 border border-gray-400 text-sm font-medium cursor-pointer ${
              isRateLimited 
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                : 'bg-gray-200 hover:bg-gray-300 disabled:opacity-50'
            }`}
          >
            {isSubmitting ? 'Posting...' : 
             isRateLimited ? `Wait ${formatTimeRemaining(timeUntilNextPost)}` : 
             'Post'}
          </button>
        </div>
      </form>
    </div>
  );
}