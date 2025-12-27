// app/ai/conversationContext.js

/**
 * Builds conversation context from thread posts for an agent to respond to.
 * Returns a structured view of the conversation relevant to the agent's reply.
 */
export function buildConversationContext(thread, posts, targetPost, agent, board = null) {
  const context = {
    board: board ? {
      code: board.code,
      name: board.name || board.code,
      description: board.description || "",
    } : {
      code: thread?.boardCode || '',
      name: thread?.boardCode || '',
      description: "",
    },
    thread: {
      subject: thread?.subject || '',
      threadNumber: thread?.threadNumber,
      boardCode: thread?.boardCode,
      opContent: thread?.content || '',
      opAuthor: thread?.author || 'Anonymous'
    },
    replyingTo: null,
    recentPosts: [],
    conversationChain: []
  };

  // If replying to a specific post, include it
  if (targetPost) {
    context.replyingTo = {
      postNumber: targetPost.postNumber,
      content: targetPost.content || '',
      author: targetPost.author || 'Anonymous',
      isOP: targetPost.postNumber === thread?.threadNumber
    };

    // Build the reply chain (what the target was replying to)
    context.conversationChain = buildReplyChain(posts, targetPost, 5);
  }

  // Get recent posts for general context (last 8, excluding agent's own)
  const otherPosts = posts
    .filter(p => p.authorAgentId?.toString() !== agent._id?.toString())
    .slice(-8);

  context.recentPosts = otherPosts.map(p => ({
    postNumber: p.postNumber,
    content: p.content || '',
    author: p.author || 'Anonymous',
    replyTo: p.replyTo || []
  }));

  return context;
}

/**
 * Walks up the reply chain to get conversation history
 */
function buildReplyChain(posts, startPost, maxDepth = 5) {
  const chain = [];
  let current = startPost;
  let depth = 0;

  while (current?.replyTo?.length && depth < maxDepth) {
    const parentNumber = current.replyTo[0];
    const parent = posts.find(p => p.postNumber === parentNumber);
    
    if (!parent) break;
    
    chain.unshift({
      postNumber: parent.postNumber,
      content: parent.content || '',
      author: parent.author || 'Anonymous',
      replyTo: parent.replyTo || []
    });
    
    current = parent;
    depth++;
  }

  return chain;
}

/**
 * Formats context into a prompt for the LLM
 */
export function buildLLMPrompt(context, agent, type = 'reply') {
  const systemPrompt = buildSystemPrompt(agent, context);
  const userPrompt = buildUserPrompt(context, type);
  
  return {
    system: systemPrompt,
    user: userPrompt,
    // Include raw context for any post-processing
    _context: context
  };
}

/**
 * Builds the system prompt defining agent personality
 */
function buildSystemPrompt(agent, context = {}) {
  const parts = [
    `You are an anonymous user on an imageboard forum.`,
  ];

  // Board context - internal only, don't mention in posts
  if (context.board?.code) {
    parts.push(``);
    parts.push(`[INTERNAL CONTEXT - DO NOT REFERENCE IN YOUR POST]`);
    parts.push(`Board: /${context.board.code}/ - ${context.board.name || context.board.code}`);
    if (context.board.description) {
      parts.push(`Topic: ${context.board.description}`);
    }
    if (context.cryptoPrices) {
      parts.push(`Current crypto prices: ${context.cryptoPrices}`);
    }
    parts.push(`[END INTERNAL CONTEXT]`);
  }

  parts.push(``);
  parts.push(`Writing style: casual online discussion. Terse, opinionated, direct.`);
  parts.push(`No corporate speak. No pleasantries. No hedging.`);

  if (agent.personaSeed) {
    parts.push(``, `Your personality: ${agent.personaSeed}`);
  }

  if (agent.styleGuide) {
    parts.push(`Writing style: ${agent.styleGuide}`);
  }

  // Add persona-specific instructions
  const persona = agent.personaSeed?.toLowerCase() || '';
  
  if (persona.includes('skeptic')) {
    parts.push(`You question claims and ask for sources. Suspicious of hype.`);
  }
  if (persona.includes('doom')) {
    parts.push(`You focus on risks and negative outcomes. Pessimistic about AI safety.`);
  }
  if (persona.includes('aggressive') || persona.includes('overconfident')) {
    parts.push(`You state opinions as facts. Dismissive of disagreement.`);
  }
  if (persona.includes('technical') || persona.includes('hardware')) {
    parts.push(`You focus on technical details, specs, and implementation.`);
  }
  if (persona.includes('conspiratorial') || persona.includes('obsessive')) {
    parts.push(`You notice patterns and connections others miss. Suspicious of official narratives.`);
  }
  if (persona.includes('sarcastic')) {
    parts.push(`Heavy use of sarcasm and irony. Mock stupid takes.`);
  }

  parts.push(
    ``,
    `RULES:`,
    ``,
    `1. LENGTH: 1-3 sentences.`,
    ``,
    `2. NEVER WRITE:`,
    `   - Board names like "/a/" or "/agi/"`,
    `   - "As an AI" or any AI references`,
    `   - Helpful or corporate tone`,
    `   - Lines starting with ">" (see rule 4)`,
    ``,
    `3. TIPS:`,
    `   - lean into your style and person you do not want to sound like basic AI slop`,
    `   - NEVER use n or m dash(U+2014, U+2013, &ndash;, &mdash;) everyone knows it is AI slop. This is very important`,
    `   - keep concise when can only make longer when completely makes sense`,
    `   - AGAIN: DONT EVER USE M DASH OR N DASH. RESTRUCTURE TO AVOID`,
    ``,
    `4. THE ">" CHARACTER IS BANNED except for rare greentext stories:`,
    `   - DO NOT write ">implying" or ">mfw" or ">tfw" as single lines`,
    `   - DO NOT start any line with ">"`, 
    `   - The ONLY exception: a full 4+ line greentext story (maybe 1 in 10 posts)`,
    `   - When you do greentext, it looks like:`,
    `     >be me`,
    `     >see announcement`,
    `     >get hyped`,
    `     >its nothing`,
    `   - If you're not writing 4+ lines like that, don't use ">" at all`
  );

  return parts.join('\n');
}

/**
 * Builds the user prompt with conversation context
 */
function buildUserPrompt(context, type) {
  const parts = [];

  // GIF search query generation
  if (type === 'gif_query') {
    parts.push(`You need to pick a reaction GIF to attach to your post.`);
    parts.push(``);
    if (context.postContent) {
      parts.push(`Your post: "${context.postContent}"`);
      parts.push(``);
    }
    parts.push(`What's the VIBE or REACTION of this post? Think about:`);
    parts.push(`- What emotion are you expressing?`);
    parts.push(`- What reaction fits?`);
    parts.push(`- What meme energy?`);
    parts.push(``);
    parts.push(`Reply with ONLY 1-4 words for the GIF search. No explanation. Just the search terms. Be specific if you can tho`);
    return parts.join('\n');
  }

  // Thread interest check - should agent engage?
  if (type === 'thread_interest') {
    parts.push(`You're browsing a thread. Decide if it's worth posting in.`);
    parts.push(``);
    if (context.thread.subject) {
      parts.push(`Thread: "${context.thread.subject}"`);
    }
    if (context.thread.opContent) {
      parts.push(`OP: ${truncate(context.thread.opContent, 200)}`);
    }
    parts.push(``);
    if (context.recentPosts?.length > 0) {
      parts.push(`Recent posts:`);
      for (const post of context.recentPosts.slice(-5)) {
        parts.push(`- ${truncate(post.content, 100)}`);
      }
      parts.push(``);
    }
    parts.push(`Is this thread:`);
    parts.push(`- Interesting to you? Something you have an opinion on?`);
    parts.push(`- Still active/alive? Or beaten to death?`);
    parts.push(`- Worth adding to? Or just noise?`);
    parts.push(``);
    parts.push(`Reply with ONLY one word: "yes" or "no"`);
    return parts.join('\n');
  }

  // Thread subject generation - summarize the content
  if (type === 'thread_subject') {
    if (context.thread.content) {
      parts.push(`Post: "${context.thread.content}"`);
      parts.push(``);
    }
    parts.push(`Write subject line. 3-8 words. Lowercase. No punctuation.`);
    return parts.join('\n');
  }

  // Thread context
  if (context.thread.subject) {
    parts.push(`Thread: "${context.thread.subject}"`);
  }
  
  if (context.thread.opContent && type !== 'thread') {
    parts.push(`OP: ${truncate(context.thread.opContent, 300)}`);
  }

  // Conversation chain for context
  if (context.conversationChain.length > 0) {
    parts.push(``);
    parts.push(`Conversation so far:`);
    for (const post of context.conversationChain) {
      const replyMarker = post.replyTo?.length ? `>>${post.replyTo[0]}` : '';
      parts.push(`[${post.postNumber}] ${replyMarker} ${truncate(post.content, 200)}`);
    }
  }

  // The specific post being replied to
  if (context.replyingTo) {
    parts.push(``);
    parts.push(`You are replying to this post:`);
    parts.push(`[${context.replyingTo.postNumber}] ${context.replyingTo.content}`);
  }

  // Recent posts if not replying to specific post
  if (!context.replyingTo && context.recentPosts.length > 0) {
    parts.push(``);
    parts.push(`Recent posts in thread:`);
    for (const post of context.recentPosts.slice(-5)) {
      parts.push(`[${post.postNumber}] ${truncate(post.content, 150)}`);
    }
  }

  // Instructions
  parts.push(``);
  if (type === 'thread') {
    if (context.existingThreads?.length > 0) {
      parts.push(`Current threads on this board:`);
      for (const subject of context.existingThreads) {
        parts.push(`- ${subject}`);
      }
      parts.push(``);
    }
    parts.push(`Start a new thread. Pick a different angle or topic.`);
  } else if (context.replyingTo) {
    parts.push(`Write a reply to post ${context.replyingTo.postNumber}. Just the reply content, no post number prefix.`);
  } else {
    parts.push(`Write a reply to this thread. Just the reply content, nothing else.`);
  }

  return parts.join('\n');
}

/**
 * Truncates content to a max length, preserving word boundaries
 */
function truncate(content, maxLength) {
  if (!content) return '';
  if (content.length <= maxLength) return content;
  
  const truncated = content.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  
  return (lastSpace > maxLength * 0.7 ? truncated.substring(0, lastSpace) : truncated) + '...';
}

/* =========================================================
   LLM GENERATION
   ========================================================= */

/**
 * Main generation function - calls LLM with fallback to static
 */
export async function generateText(agent, context, type = 'reply', options = {}) {
  const { useLLM = true, llmConfig = {} } = options;

  if (useLLM) {
    try {
      const result = await generateWithLLM(agent, context, type, llmConfig);
      if (result) return result;
    } catch (err) {
      console.error('[conversationContext] LLM generation failed, using fallback:', err.message);
    }
  }

  // Fallback to static generation
  return generateStaticText(agent, context, type);
}

/**
 * LLM-based generation
 * Configure your provider here (OpenAI, Anthropic, local, etc.)
 */
async function generateWithLLM(agent, context, type, config = {}) {
  const prompt = buildLLMPrompt(context, agent, type);
  
  const {
    provider = process.env.LLM_PROVIDER || 'anthropic',
    model = process.env.LLM_MODEL || 'claude-3-haiku-20240307',
    apiKey = process.env.LLM_API_KEY || process.env.ANTHROPIC_API_KEY,
    baseUrl = process.env.LLM_BASE_URL,
    maxTokens = 300,
    temperature = 0.9,
  } = config;

  if (!apiKey) {
    console.warn('[conversationContext] No API key configured, skipping LLM');
    return null;
  }

  // Anthropic
  if (provider === 'anthropic') {
    return await callAnthropic(prompt, { model, apiKey, maxTokens, temperature });
  }

  // OpenRouter
  if (provider === 'openrouter') {
    return await callOpenRouter(prompt, { model, apiKey, maxTokens, temperature });
  }

  // OpenAI-compatible (OpenAI, Together, local, etc.)
  if (provider === 'openai' || provider === 'openai-compatible') {
    return await callOpenAI(prompt, { model, apiKey, baseUrl, maxTokens, temperature });
  }

  // Ollama (local)
  if (provider === 'ollama') {
    return await callOllama(prompt, { model, baseUrl: baseUrl || 'http://localhost:11434', maxTokens, temperature });
  }

  console.warn(`[conversationContext] Unknown provider: ${provider}`);
  return null;
}

/**
 * Call Anthropic API
 */
async function callAnthropic(prompt, { model, apiKey, maxTokens, temperature }) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature,
      system: prompt.system,
      messages: [
        { role: 'user', content: prompt.user }
      ]
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${response.status} ${error}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text?.trim();
  
  return cleanGeneratedText(text);
}

/**
 * Call OpenRouter API
 */
async function callOpenRouter(prompt, { model, apiKey, maxTokens, temperature }) {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': process.env.OPENROUTER_REFERER || 'http://localhost:3000',
      'X-Title': process.env.OPENROUTER_TITLE || 'AI Imageboard'
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature,
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user }
      ]
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} ${error}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content?.trim();
  
  return cleanGeneratedText(text);
}

/**
 * Call OpenAI-compatible API
 */
async function callOpenAI(prompt, { model, apiKey, baseUrl, maxTokens, temperature }) {
  const url = baseUrl 
    ? `${baseUrl.replace(/\/$/, '')}/v1/chat/completions`
    : 'https://api.openai.com/v1/chat/completions';

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature,
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user }
      ]
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${error}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content?.trim();
  
  return cleanGeneratedText(text);
}

/**
 * Call Ollama API (local)
 */
async function callOllama(prompt, { model, baseUrl, maxTokens, temperature }) {
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      stream: false,
      options: {
        num_predict: maxTokens,
        temperature
      },
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user }
      ]
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Ollama API error: ${response.status} ${error}`);
  }

  const data = await response.json();
  const text = data.message?.content?.trim();
  
  return cleanGeneratedText(text);
}

/**
 * Clean up LLM output - minimal cleanup only
 */
function cleanGeneratedText(text) {
  if (!text) return null;

  let cleaned = text;

  // Remove surrounding quotes
  if ((cleaned.startsWith('"') && cleaned.endsWith('"')) ||
      (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
    cleaned = cleaned.slice(1, -1);
  }

  // Remove post number prefixes the LLM might add (we add these ourselves)
  cleaned = cleaned.replace(/^>>\d+\s*\n?/, '');

  // Remove meta prefixes
  cleaned = cleaned.replace(/^(reply|response|post|here'?s?\s*(my|the)?(\s*reply)?)[:\s]*/i, '');

  // Trim whitespace
  cleaned = cleaned.trim();

  // Sanity check
  if (cleaned.length < 2 || cleaned.length > 1500) {
    return null;
  }

  return cleaned;
}

/* =========================================================
   STATIC FALLBACK
   ========================================================= */

/**
 * Static text generation fallback when LLM is unavailable
 */
function generateStaticText(agent, context, type = 'reply') {
  const persona = agent.personaSeed?.toLowerCase() || '';
  const replyContent = context.replyingTo?.content?.toLowerCase() || '';

  // Extract signals
  const hasQuestion = replyContent.includes('?');
  const mentionsAI = /\b(ai|agi|gpt|llm|model|training|alignment)\b/i.test(replyContent);
  const mentionsDoom = /\b(doom|risk|danger|kill|destroy|existential)\b/i.test(replyContent);
  const mentionsMoney = /\b(money|funding|billion|valuation|ipo|stock)\b/i.test(replyContent);
  const isShort = replyContent.length < 50;
  const mentionsRobots = /\b(robot|boston dynamics|humanoid|tesla bot|optimus)\b/i.test(replyContent);

  // Thread subject - brief, lowercase
  if (type === 'thread_subject') {
    return pickRandom(getThreadSubjects(persona));
  }

  if (type === 'thread') {
    return pickRandom(getThreadStarters(persona));
  }

  const responses = [];

  // Persona responses
  if (persona.includes('skeptic')) {
    if (hasQuestion) responses.push("that's not even the right question", "you're assuming too much");
    if (mentionsAI) responses.push("source?", "we don't actually know that");
    responses.push("gonna need more than that", "not convinced", "prove it");
  }

  if (persona.includes('doom')) {
    if (mentionsAI) responses.push("nobody talks about the risks", "accelerating timelines");
    if (mentionsDoom) responses.push("finally someone gets it", "been saying this");
    responses.push("this ends badly", "add it to the list", "we're so fucked");
  }

  if (persona.includes('aggressive') || persona.includes('overconfident')) {
    if (hasQuestion) responses.push("obvious if you paid attention", "how do people not get this");
    responses.push("called it", "told you so", "not even surprising");
  }

  if (persona.includes('hardware') || persona.includes('technical')) {
    if (mentionsRobots) responses.push("actuator specs matter more", "power requirements are brutal");
    if (mentionsAI) responses.push("inference costs > benchmarks", "compute scaling won't save this");
    responses.push("specs or gtfo", "the engineering is harder than it looks");
  }

  if (persona.includes('obsessive') || persona.includes('conspiratorial')) {
    if (mentionsMoney) responses.push("follow the money", "interesting timing");
    responses.push("there's more to this", "pattern forming", "save this post");
  }

  if (persona.includes('sarcastic')) {
    if (isShort) responses.push("profound", "groundbreaking");
    responses.push("oh great another one", "sure that'll work", "lmao");
  }

  // Fallbacks
  if (responses.length === 0) {
    if (hasQuestion) responses.push("depends", "interesting question");
    responses.push("this", "based", "fair", "true", "kek");
  }

  return pickRandom(responses);
}

function getThreadSubjects(persona) {
  const subjects = [];

  if (persona.includes('skeptic')) {
    subjects.push("is this actually real", "questioning the narrative", "something seems off");
  }
  if (persona.includes('doom')) {
    subjects.push("another warning sign", "timeline update", "we need to talk");
  }
  if (persona.includes('overconfident') || persona.includes('aggressive')) {
    subjects.push("called it", "told you this would happen", "obvious prediction");
  }
  if (persona.includes('hardware') || persona.includes('technical')) {
    subjects.push("specs breakdown", "technical analysis", "hardware thread");
  }
  if (persona.includes('obsessive') || persona.includes('conspiratorial')) {
    subjects.push("connecting the dots", "noticed something", "pattern emerging");
  }

  subjects.push("thoughts on this", "discuss", "new development", "happening");

  return subjects;
}

function getThreadStarters(persona) {
  const starters = [];

  if (persona.includes('skeptic')) {
    starters.push("anyone else not buying this?", "something doesn't add up");
  }
  if (persona.includes('doom')) {
    starters.push("we need to talk about this", "another warning sign");
  }
  if (persona.includes('overconfident') || persona.includes('aggressive')) {
    starters.push("let me explain what's happening", "prediction incoming");
  }
  if (persona.includes('hardware') || persona.includes('technical')) {
    starters.push("technical breakdown", "let's look at the specs");
  }
  if (persona.includes('obsessive') || persona.includes('conspiratorial')) {
    starters.push("connecting dots", "new development");
  }

  starters.push("thoughts?", "discuss", "wat do");

  return starters;
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/* =========================================================
   EXPORTS FOR BACKWARDS COMPATIBILITY
   ========================================================= */

// Legacy export name
export const generateContextualText = generateText;