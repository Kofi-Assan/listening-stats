import { AudioFeatures } from '../types';

// Constants
const STORAGE_PREFIX = 'listening-stats:';
const MIN_API_INTERVAL_MS = 10000; // 10 seconds between Web API calls
const BATCH_SIZE = 3; // Very small batches to avoid rate limits
const DEFAULT_BACKOFF_MS = 300000; // 5 minutes default if no Retry-After header
const MAX_BACKOFF_MS = 3600000; // 1 hour max
const CACHE_PERSIST_INTERVAL_MS = 60000; // Persist caches every minute

// In-memory caches (loaded from localStorage on init)
let audioFeaturesCache = new Map<string, AudioFeatures>();
let artistGenresCache = new Map<string, string[]>();

// Rate limiting state
let rateLimitedUntil = 0;
let lastApiCallTime = 0;
let cachesPersistTimeout: number | null = null;

// Initialize: load persisted state from localStorage
function initFromStorage(): void {
  try {
    // Load rate limit state
    const storedRateLimit = localStorage.getItem(`${STORAGE_PREFIX}rateLimitedUntil`);
    if (storedRateLimit) {
      rateLimitedUntil = parseInt(storedRateLimit, 10);
      if (Date.now() >= rateLimitedUntil) {
        // Expired, clear it
        rateLimitedUntil = 0;
        localStorage.removeItem(`${STORAGE_PREFIX}rateLimitedUntil`);
      }
    }

    // Load audio features cache
    const storedAudioFeatures = localStorage.getItem(`${STORAGE_PREFIX}audioFeaturesCache`);
    if (storedAudioFeatures) {
      const parsed = JSON.parse(storedAudioFeatures);
      audioFeaturesCache = new Map(Object.entries(parsed));
      console.log(`[ListeningStats] Loaded ${audioFeaturesCache.size} cached audio features`);
    }

    // Load genres cache
    const storedGenres = localStorage.getItem(`${STORAGE_PREFIX}artistGenresCache`);
    if (storedGenres) {
      const parsed = JSON.parse(storedGenres);
      artistGenresCache = new Map(Object.entries(parsed));
      console.log(`[ListeningStats] Loaded ${artistGenresCache.size} cached artist genres`);
    }
  } catch (error) {
    console.warn('[ListeningStats] Failed to load cached API data:', error);
  }
}

// Persist caches to localStorage (debounced)
function scheduleCachePersist(): void {
  if (cachesPersistTimeout) return;
  cachesPersistTimeout = window.setTimeout(() => {
    persistCaches();
    cachesPersistTimeout = null;
  }, CACHE_PERSIST_INTERVAL_MS);
}

function persistCaches(): void {
  try {
    // Persist audio features (limit to 500 most recent to avoid localStorage limits)
    const audioFeaturesObj: Record<string, AudioFeatures> = {};
    const audioEntries = Array.from(audioFeaturesCache.entries()).slice(-500);
    audioEntries.forEach(([k, v]) => { audioFeaturesObj[k] = v; });
    localStorage.setItem(`${STORAGE_PREFIX}audioFeaturesCache`, JSON.stringify(audioFeaturesObj));

    // Persist genres (limit to 500)
    const genresObj: Record<string, string[]> = {};
    const genreEntries = Array.from(artistGenresCache.entries()).slice(-500);
    genreEntries.forEach(([k, v]) => { genresObj[k] = v; });
    localStorage.setItem(`${STORAGE_PREFIX}artistGenresCache`, JSON.stringify(genresObj));
  } catch (error) {
    console.warn('[ListeningStats] Failed to persist caches:', error);
  }
}

// Handle rate limit response - parse Retry-After header
function handleRateLimit(error: any): void {
  let backoffMs = DEFAULT_BACKOFF_MS;

  // Try to extract Retry-After from error
  // Spicetify.CosmosAsync may include headers in the error
  if (error?.headers?.['retry-after']) {
    const retryAfter = parseInt(error.headers['retry-after'], 10);
    if (!isNaN(retryAfter)) {
      backoffMs = Math.min(retryAfter * 1000, MAX_BACKOFF_MS);
    }
  } else if (error?.body?.['Retry-After']) {
    const retryAfter = parseInt(error.body['Retry-After'], 10);
    if (!isNaN(retryAfter)) {
      backoffMs = Math.min(retryAfter * 1000, MAX_BACKOFF_MS);
    }
  }

  rateLimitedUntil = Date.now() + backoffMs;
  localStorage.setItem(`${STORAGE_PREFIX}rateLimitedUntil`, rateLimitedUntil.toString());
  console.log(`[ListeningStats] Rate limited, backing off for ${Math.ceil(backoffMs / 60000)} minutes`);
}

// Clear rate limit (called on successful API response)
function clearRateLimit(): void {
  if (rateLimitedUntil > 0) {
    rateLimitedUntil = 0;
    localStorage.removeItem(`${STORAGE_PREFIX}rateLimitedUntil`);
  }
}

// Check if API is available (not rate limited)
export function isApiAvailable(): boolean {
  return Date.now() >= rateLimitedUntil;
}

// Get remaining rate limit time in seconds (for UI)
export function getRateLimitRemaining(): number {
  if (rateLimitedUntil <= 0) return 0;
  return Math.max(0, Math.ceil((rateLimitedUntil - Date.now()) / 1000));
}

// Wait for rate limit and minimum interval
async function waitForApiSlot(): Promise<boolean> {
  if (!isApiAvailable()) {
    const waitTime = rateLimitedUntil - Date.now();
    console.log(`[ListeningStats] Rate limited, skipping (${Math.ceil(waitTime/1000)}s remaining)`);
    return false;
  }
  
  const timeSinceLastCall = Date.now() - lastApiCallTime;
  if (timeSinceLastCall < MIN_API_INTERVAL_MS) {
    await new Promise(resolve => setTimeout(resolve, MIN_API_INTERVAL_MS - timeSinceLastCall));
  }
  
  lastApiCallTime = Date.now();
  return true;
}

// Initialize on module load
initFromStorage();

// Extract track ID from Spotify URI (spotify:track:xxx -> xxx)
function extractTrackId(uri: string): string | null {
  const match = uri.match(/spotify:track:([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}

// Extract artist ID from Spotify URI
function extractArtistId(uri: string): string | null {
  const match = uri.match(/spotify:artist:([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}

/**
 * Try to get audio analysis via Spicetify's internal API (no rate limits)
 * This gives us tempo but not energy/valence/danceability
 */
async function getAudioAnalysis(trackUri: string): Promise<{ tempo: number } | null> {
  try {
    // Spicetify.getAudioData uses internal wg:// endpoint - no rate limits!
    const data = await Spicetify.getAudioData(trackUri);
    if (data?.track?.tempo) {
      return { tempo: data.track.tempo };
    }
  } catch (error) {
    // Silently fail - not all tracks have analysis
  }
  return null;
}

/**
 * Fetch audio features for multiple tracks using hybrid approach:
 * 1. Try internal audio analysis API first (for tempo - no rate limits)
 * 2. Fall back to Web API for full features (with rate limiting)
 */
// Check if audio features are placeholder/default values (all 0.5)
function isPlaceholderAudioFeatures(af: AudioFeatures): boolean {
  return af.valence === 0.5 && af.energy === 0.5 && af.danceability === 0.5;
}

export async function fetchAudioFeaturesBatch(trackUris: string[]): Promise<Map<string, AudioFeatures>> {
  const result = new Map<string, AudioFeatures>();
  
  // Filter out cached URIs (but skip placeholder values)
  const uncachedUris = trackUris.filter(uri => {
    if (audioFeaturesCache.has(uri)) {
      const cached = audioFeaturesCache.get(uri)!;
      // Skip placeholder values - they need to be re-fetched
      if (!isPlaceholderAudioFeatures(cached)) {
        result.set(uri, cached);
        return false;
      }
    }
    return extractTrackId(uri) !== null;
  });

  if (uncachedUris.length === 0) {
    return result;
  }

  // Store tempo from internal API for later merge
  const tempoFromAnalysis = new Map<string, number>();
  
  // First, try to get tempo from internal audio analysis (no rate limits)
  for (const uri of uncachedUris) {
    const analysis = await getAudioAnalysis(uri);
    if (analysis) {
      tempoFromAnalysis.set(uri, analysis.tempo);
    }
  }

  // Try to get full features from Web API if not rate limited
  const stillNeeded = uncachedUris;
  
  if (stillNeeded.length > 0 && await waitForApiSlot()) {
    const smallBatch = stillNeeded.slice(0, BATCH_SIZE);
    
    try {
      const ids = smallBatch.map(uri => extractTrackId(uri)!).join(',');
      const response = await Spicetify.CosmosAsync.get(
        `https://api.spotify.com/v1/audio-features?ids=${ids}`
      );

      if (response?.audio_features) {
        clearRateLimit(); // Success! Clear any rate limit state
        response.audio_features.forEach((features: any, index: number) => {
          if (features) {
            const uri = smallBatch[index];
            // Prefer internal API tempo if available (more reliable)
            const tempo = tempoFromAnalysis.get(uri) || features.tempo;
            
            const audioFeatures: AudioFeatures = {
              energy: features.energy,
              valence: features.valence,
              danceability: features.danceability,
              tempo: tempo,
              acousticness: features.acousticness,
              instrumentalness: features.instrumentalness,
              speechiness: features.speechiness,
              liveness: features.liveness,
            };
            
            audioFeaturesCache.set(uri, audioFeatures);
            result.set(uri, audioFeatures);
          }
        });
        scheduleCachePersist();
        console.log(`[ListeningStats] Got ${response.audio_features.filter(Boolean).length} audio features from Web API`);
      }
    } catch (error: any) {
      if (error?.message?.includes('429') || error?.status === 429) {
        handleRateLimit(error);
      } else {
        console.warn('[ListeningStats] Web API audio features failed:', error);
      }
    }
  }

  return result;
}

/**
 * Fetch genres for multiple artists (Web API only, with rate limiting)
 * Note: Internal hm:// endpoints don't work on newer Spotify versions
 */
export async function fetchArtistGenresBatch(artistUris: string[]): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  
  // Filter out cached URIs
  const uncachedUris = artistUris.filter(uri => {
    if (artistGenresCache.has(uri)) {
      result.set(uri, artistGenresCache.get(uri)!);
      return false;
    }
    return extractArtistId(uri) !== null;
  });

  if (uncachedUris.length === 0) {
    return result;
  }

  // Try Web API if not rate limited (only small batches)
  if (await waitForApiSlot()) {
    const smallBatch = uncachedUris.slice(0, BATCH_SIZE);
    
    try {
      const ids = smallBatch.map(uri => extractArtistId(uri)!).join(',');
      const response = await Spicetify.CosmosAsync.get(
        `https://api.spotify.com/v1/artists?ids=${ids}`
      );

      if (response?.artists) {
        clearRateLimit(); // Success! Clear any rate limit state
        response.artists.forEach((artist: any, index: number) => {
          if (artist) {
            const genres = artist.genres || [];
            const uri = smallBatch[index];
            artistGenresCache.set(uri, genres);
            result.set(uri, genres);
          }
        });
        scheduleCachePersist();
        console.log(`[ListeningStats] Got genres for ${response.artists.filter(Boolean).length} artists`);
      }
    } catch (error: any) {
      if (error?.message?.includes('429') || error?.status === 429) {
        handleRateLimit(error);
      } else {
        console.warn('[ListeningStats] Artist genres fetch failed:', error);
      }
    }
  }

  return result;
}

/**
 * Clear caches (for testing or memory management)
 */
export function clearApiCaches(): void {
  audioFeaturesCache.clear();
  artistGenresCache.clear();
  localStorage.removeItem(`${STORAGE_PREFIX}audioFeaturesCache`);
  localStorage.removeItem(`${STORAGE_PREFIX}artistGenresCache`);
}

/**
 * Reset rate limit state (for manual recovery)
 */
export function resetRateLimit(): void {
  rateLimitedUntil = 0;
  localStorage.removeItem(`${STORAGE_PREFIX}rateLimitedUntil`);
  console.log('[ListeningStats] Rate limit state reset');
}
