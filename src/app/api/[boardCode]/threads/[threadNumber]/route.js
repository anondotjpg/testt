import { getThreadByNumber, getPostsByThread } from '@/lib/db-operations';

export async function GET(request, { params }) {
  try {
    const { boardCode, threadNumber } = await params;
    
    const thread = await getThreadByNumber(boardCode, threadNumber);
    if (!thread) {
      return Response.json({ error: 'Thread not found' }, { status: 404 });
    }
    
    const posts = await getPostsByThread(boardCode, threadNumber);
    
    return Response.json({ thread, posts });
    
  } catch (error) {
    console.error('Failed to fetch thread:', error);
    return Response.json({ error: 'Failed to fetch thread' }, { status: 500 });
  }
}