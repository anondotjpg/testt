// lib/crypto.js

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

let priceCache = {
  data: null,
  timestamp: 0
};

/**
 * Fetch main crypto prices from CoinGecko
 * Free API, no key required (rate limited)
 */
export async function getCryptoPrices() {
  // Return cached if fresh
  if (priceCache.data && Date.now() - priceCache.timestamp < CACHE_DURATION) {
    return priceCache.data;
  }

  try {
    const ids = 'bitcoin,ethereum,solana';
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`,
      { next: { revalidate: 300 } } // Next.js cache for 5 min
    );

    if (!res.ok) {
      console.error('[crypto] CoinGecko API error:', res.status);
      return priceCache.data || getDefaultPrices();
    }

    const data = await res.json();
    
    const prices = {
      btc: {
        price: data.bitcoin?.usd || 0,
        change24h: data.bitcoin?.usd_24h_change || 0
      },
      eth: {
        price: data.ethereum?.usd || 0,
        change24h: data.ethereum?.usd_24h_change || 0
      },
      sol: {
        price: data.solana?.usd || 0,
        change24h: data.solana?.usd_24h_change || 0
      },
      timestamp: Date.now()
    };

    // Update cache
    priceCache = {
      data: prices,
      timestamp: Date.now()
    };

    return prices;
  } catch (err) {
    console.error('[crypto] Failed to fetch prices:', err.message);
    return priceCache.data || getDefaultPrices();
  }
}

function getDefaultPrices() {
  return {
    btc: { price: 0, change24h: 0 },
    eth: { price: 0, change24h: 0 },
    sol: { price: 0, change24h: 0 },
    timestamp: 0
  };
}

/**
 * Format price for display
 */
export function formatPrice(price) {
  if (!price || price === 0) return '???';
  return price.toLocaleString('en-US', { 
    style: 'currency', 
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: price < 10 ? 2 : 0
  });
}

/**
 * Format change percentage
 */
export function formatChange(change) {
  if (change === undefined || change === null) return '';
  const sign = change >= 0 ? '+' : '';
  return `${sign}${change.toFixed(1)}%`;
}

/**
 * Get price summary string for LLM context
 */
export function getPriceSummary(prices) {
  if (!prices || !prices.btc?.price) return null;
  
  const btcDir = prices.btc.change24h >= 0 ? 'up' : 'down';
  const ethDir = prices.eth.change24h >= 0 ? 'up' : 'down';
  const solDir = prices.sol.change24h >= 0 ? 'up' : 'down';
  
  return `BTC: ${formatPrice(prices.btc.price)} (${btcDir} ${Math.abs(prices.btc.change24h).toFixed(1)}%), ETH: ${formatPrice(prices.eth.price)} (${ethDir} ${Math.abs(prices.eth.change24h).toFixed(1)}%), SOL: ${formatPrice(prices.sol.price)} (${solDir} ${Math.abs(prices.sol.change24h).toFixed(1)}%)`;
}