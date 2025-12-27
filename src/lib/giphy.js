// lib/giphy.js

/**
 * Search for a GIF using Giphy API
 * @param {string} query - Search terms
 * @returns {Promise<{url: string, thumbnail: string, width: number, height: number} | null>}
 */
export async function searchGif(query) {
  const apiKey = process.env.GIPHY_API_KEY;
  
  if (!apiKey) {
    console.warn('[giphy] No GIPHY_API_KEY configured');
    return null;
  }

  if (!query || query.trim().length < 2) {
    return null;
  }

  try {
    // Clean up query - take first few meaningful words
    const cleanQuery = query
      .replace(/[^a-zA-Z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2)
      .slice(0, 4)
      .join(' ')
      .trim();

    if (!cleanQuery) return null;

    const res = await fetch(
      `https://api.giphy.com/v1/gifs/search?api_key=${apiKey}&q=${encodeURIComponent(cleanQuery)}&limit=15`
    );

    if (!res.ok) {
      console.error('[giphy] API error:', res.status);
      return null;
    }

    const data = await res.json();
    
    if (!data.data?.length) {
      return null;
    }

    // Pick random from results
    const gif = data.data[Math.floor(Math.random() * data.data.length)];
    
    // Estimate file size from dimensions (rough approximation)
    const width = parseInt(gif.images.original.width) || 480;
    const height = parseInt(gif.images.original.height) || 360;
    const size = parseInt(gif.images.original.size) || (width * height * 0.5); // fallback estimate
    
    return {
      url: gif.images.original.url,
      thumbnail: gif.images.fixed_height_small?.url || gif.images.fixed_height?.url,
      width,
      height,
      imageName: `${gif.slug || 'giphy'}.gif`,
      fileSize: size,
    };
  } catch (err) {
    console.error('[giphy] Search failed:', err.message);
    return null;
  }
}

/**
 * Get a random trending GIF
 * @returns {Promise<{url: string, thumbnail: string, width: number, height: number} | null>}
 */
export async function getTrendingGif() {
  const apiKey = process.env.GIPHY_API_KEY;
  
  if (!apiKey) {
    return null;
  }

  try {
    const res = await fetch(
      `https://api.giphy.com/v1/gifs/trending?api_key=${apiKey}&limit=25&rating=pg-13`
    );

    if (!res.ok) {
      return null;
    }

    const data = await res.json();
    
    if (!data.data?.length) {
      return null;
    }

    const gif = data.data[Math.floor(Math.random() * data.data.length)];
    
    return {
      url: gif.images.original.url,
      thumbnail: gif.images.fixed_height_small?.url || gif.images.fixed_height?.url,
      width: parseInt(gif.images.original.width) || 480,
      height: parseInt(gif.images.original.height) || 360,
    };
  } catch (err) {
    console.error('[giphy] Trending failed:', err.message);
    return null;
  }
}

/**
 * Extract keywords from text for GIF search
 * @param {string} text 
 * @returns {string}
 */
export function extractKeywords(text) {
  if (!text) return '';
  
  // Common words to filter out
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
    'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought',
    'used', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it',
    'we', 'they', 'what', 'which', 'who', 'whom', 'whose', 'where', 'when',
    'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most',
    'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so',
    'than', 'too', 'very', 'just', 'also', 'now', 'here', 'there', 'then',
    'once', 'gonna', 'gotta', 'wanna', 'lol', 'lmao', 'tbh', 'imo', 'imho',
    'gonna', 'dont', 'didnt', 'doesnt', 'isnt', 'arent', 'wasnt', 'werent',
    'hasnt', 'havent', 'hadnt', 'wont', 'wouldnt', 'couldnt', 'shouldnt',
    'cant', 'cannot', 'mustnt', 'lets', 'thats', 'whats', 'heres', 'theres',
    'wheres', 'whos', 'hows', 'whys', 'its', 'theyre', 'youre', 'were', 'ive',
    'youve', 'weve', 'theyve', 'im', 'hes', 'shes', 'well', 'yeah', 'yep',
    'nope', 'okay', 'ok', 'like', 'just', 'really', 'actually', 'literally',
    'basically', 'probably', 'maybe', 'perhaps', 'think', 'know', 'see', 'look',
    'want', 'get', 'got', 'make', 'made', 'take', 'took', 'come', 'came', 'go',
    'went', 'going', 'say', 'said', 'tell', 'told', 'ask', 'asked', 'try',
    'thing', 'things', 'stuff', 'way', 'much', 'many', 'lot', 'bit', 'kind',
    'sort', 'type', 'part', 'point', 'fact', 'case', 'time', 'year', 'day',
  ]);

  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));

  // Return first 3-4 meaningful words
  return words.slice(0, 4).join(' ');
}