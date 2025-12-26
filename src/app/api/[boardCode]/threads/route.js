import {
  getBoardByCode,
  getThreadsByBoard,
  createThread,
  incrementBoardPostCount,
  getRecentPostsByThread,
  getNextPostNumber,
} from '@/lib/db-operations';
import { uploadImage } from '@/lib/imageUpload';
import { generateTripcode } from '@/lib/utils';

/* =========================================================
   GET /api/[boardCode]/threads
   ========================================================= */
export async function GET(request, { params }) {
  try {
    // 🚨 IMPORTANT: params is async in App Router
    const { boardCode } = await params;

    console.log('[threads GET] boardCode:', boardCode);

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page')) || 1;
    const limit = 10;

    console.log('[threads GET] page:', page, 'limit:', limit);

    const board = await getBoardByCode(boardCode);

    if (!board) {
      console.warn('[threads GET] board not found:', boardCode);
      return Response.json({ error: 'Board not found' }, { status: 404 });
    }

    console.log('[threads GET] board found:', board.code);

    const threads = await getThreadsByBoard(boardCode, page, limit);

    console.log('[threads GET] threads count:', threads.length);

    const threadsWithReplies = await Promise.all(
      threads.map(async (thread) => {
        const recentPosts = await getRecentPostsByThread(
          boardCode,
          thread.threadNumber,
          5
        );

        return {
          ...thread,
          recentPosts: recentPosts.reverse(),
        };
      })
    );

    return Response.json({
      board,
      threads: threadsWithReplies,
      hasMore: threads.length === limit,
    });
  } catch (error) {
    console.error('[threads GET] fatal error:', error);
    return Response.json(
      { error: 'Failed to fetch threads' },
      { status: 500 }
    );
  }
}

/* =========================================================
   POST /api/[boardCode]/threads
   ========================================================= */
export async function POST(request, { params }) {
  try {
    // 🚨 IMPORTANT: params is async in App Router
    const { boardCode } = await params;

    console.log('[threads POST] boardCode:', boardCode);

    const board = await getBoardByCode(boardCode);

    if (!board) {
      console.warn('[threads POST] board not found:', boardCode);
      return Response.json({ error: 'Board not found' }, { status: 404 });
    }

    const formData = await request.formData();

    const subject = formData.get('subject') || '';
    const content = formData.get('content') || '';
    const author = formData.get('author') || 'Anonymous';
    const email = formData.get('email') || '';
    const tripcode_password = formData.get('tripcode_password') || '';
    const image = formData.get('image');

    console.log('[threads POST] content length:', content.length);
    console.log('[threads POST] has image:', !!image);

    if (!content && !image) {
      return Response.json(
        { error: 'Thread must have content or image' },
        { status: 400 }
      );
    }

    const tripcode = generateTripcode(tripcode_password);

    let imageData = {};

    if (image && image.size > 0) {
      if (image.size > board.maxFileSize) {
        return Response.json({ error: 'File too large' }, { status: 400 });
      }

      if (!board.allowedFileTypes.includes(image.type)) {
        return Response.json(
          { error: 'File type not allowed' },
          { status: 400 }
        );
      }

      const postNumber = await getNextPostNumber();
      imageData = await uploadImage(image, boardCode, postNumber);

      console.log('[threads POST] image uploaded:', imageData?.filename);
    }

    const threadData = {
      boardCode,
      subject: subject.substring(0, 100),
      content: content.substring(0, 2000),
      author: author.substring(0, 50),
      tripcode,
      email: email.substring(0, 100),
      ...imageData,
    };

    const thread = await createThread(threadData);

    await incrementBoardPostCount(boardCode, 1);

    console.log('[threads POST] thread created:', thread.threadNumber);

    return Response.json(thread, { status: 201 });
  } catch (error) {
    console.error('[threads POST] fatal error:', error);
    return Response.json(
      { error: 'Failed to create thread' },
      { status: 500 }
    );
  }
}
