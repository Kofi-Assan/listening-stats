import { addPlayEvent, updatePlayEvent, getEventsNeedingEnrichment } from './storage';
import { fetchAudioFeaturesBatch, fetchArtistGenresBatch, isApiAvailable } from './spotify-api';
import { TrackInfo, PlayEvent } from '../types';

// Minimum play time to count as a "play" (10 seconds)
const MIN_PLAY_TIME_MS = 10000;

// Event system for notifying UI of new data (uses window events for cross-context)
const STATS_UPDATED_EVENT = 'listening-stats:updated';

export function onStatsUpdated(callback: () => void): () => void {
  const handler = () => callback();
  window.addEventListener(STATS_UPDATED_EVENT, handler);
  return () => window.removeEventListener(STATS_UPDATED_EVENT, handler);
}

function emitStatsUpdated(): void {
  window.dispatchEvent(new CustomEvent(STATS_UPDATED_EVENT));
  // Also store timestamp for polling fallback
  localStorage.setItem('listening-stats:lastUpdate', Date.now().toString());
}

// Current tracking state
let currentTrack: TrackInfo | null = null;
let playStartTime: number | null = null;
let accumulatedPlayTime = 0;
let isPlaying = false;

// Extract track info from Spicetify player data
function extractTrackInfo(): TrackInfo | null {
  const data = Spicetify.Player.data;
  if (!data?.item) return null;

  const item = data.item;
  const metadata = item.metadata;

  return {
    uri: item.uri,
    name: metadata?.title || item.name || 'Unknown',
    artistName: metadata?.artist_name || 'Unknown Artist',
    artistUri: metadata?.artist_uri || '',
    albumName: metadata?.album_title || 'Unknown Album',
    albumUri: metadata?.album_uri || '',
    albumArt: metadata?.image_xlarge_url || metadata?.image_url,
    albumReleaseDate: metadata?.album_disc_number ? undefined : metadata?.year, // Year if available
    durationMs: item.duration?.milliseconds || Spicetify.Player.getDuration() || 0,
    context: data.context_uri,
    isExplicit: metadata?.is_explicit === 'true' || item.isExplicit === true,
  };
}

// Save the current play session
async function saveCurrentSession(): Promise<void> {
  if (!currentTrack || !playStartTime) return;

  // Calculate total played time
  const now = Date.now();
  let totalPlayedMs = accumulatedPlayTime;
  if (isPlaying) {
    totalPlayedMs += now - playStartTime;
  }

  // Only save if played for minimum time
  if (totalPlayedMs < MIN_PLAY_TIME_MS) {
    console.log('[ListeningStats] Skipped saving - played less than 10s');
    return;
  }

  // Save the basic event first (no API calls needed)
  const event: Omit<PlayEvent, 'id'> = {
    trackUri: currentTrack.uri,
    trackName: currentTrack.name,
    artistName: currentTrack.artistName,
    artistUri: currentTrack.artistUri,
    albumName: currentTrack.albumName,
    albumUri: currentTrack.albumUri,
    albumArt: currentTrack.albumArt,
    albumReleaseDate: currentTrack.albumReleaseDate,
    durationMs: currentTrack.durationMs,
    playedMs: totalPlayedMs,
    startedAt: playStartTime - accumulatedPlayTime, // Adjust for accumulated time
    endedAt: now,
    context: currentTrack.context,
    isExplicit: currentTrack.isExplicit,
    // Audio features and genres will be fetched lazily when viewing stats
  };

  try {
    await addPlayEvent(event);
    console.log(`[ListeningStats] Saved: ${currentTrack.name} - ${formatTime(totalPlayedMs)}`);
    // Notify listeners that new data is available
    emitStatsUpdated();
  } catch (error) {
    console.error('[ListeningStats] Failed to save play event:', error);
  }
}

// Format milliseconds to readable time
function formatTime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

// Handle song change
async function handleSongChange(): Promise<void> {
  // Save the previous track first
  await saveCurrentSession();

  // Reset tracking for new track
  const newTrack = extractTrackInfo();
  currentTrack = newTrack;
  accumulatedPlayTime = 0;
  
  if (newTrack) {
    playStartTime = Date.now();
    isPlaying = !Spicetify.Player.data?.isPaused;
    console.log(`[ListeningStats] Now tracking: ${newTrack.name} by ${newTrack.artistName}`);
  } else {
    playStartTime = null;
    isPlaying = false;
  }
}

// Handle play/pause state changes
function handlePlayPause(): void {
  const wasPlaying = isPlaying;
  isPlaying = !Spicetify.Player.data?.isPaused;

  if (!currentTrack || !playStartTime) return;

  if (wasPlaying && !isPlaying) {
    // Paused - accumulate play time
    accumulatedPlayTime += Date.now() - playStartTime;
    console.log(`[ListeningStats] Paused - accumulated ${formatTime(accumulatedPlayTime)}`);
  } else if (!wasPlaying && isPlaying) {
    // Resumed - reset start time
    playStartTime = Date.now();
    console.log('[ListeningStats] Resumed playback');
  }
}

// Initialize the tracker
export function initTracker(): void {
  console.log('[ListeningStats] Initializing tracker...');

  // Set up event listeners
  Spicetify.Player.addEventListener('songchange', handleSongChange);
  Spicetify.Player.addEventListener('onplaypause', handlePlayPause);

  // Track current song if already playing
  const initialTrack = extractTrackInfo();
  if (initialTrack) {
    currentTrack = initialTrack;
    playStartTime = Date.now();
    isPlaying = !Spicetify.Player.data?.isPaused;
    console.log(`[ListeningStats] Initial track: ${initialTrack.name}`);
  }

  // Save session before page unload
  window.addEventListener('beforeunload', () => {
    // Use sync localStorage as fallback for unsaved data
    if (currentTrack && playStartTime) {
      const totalPlayedMs = accumulatedPlayTime + (isPlaying ? Date.now() - playStartTime : 0);
      if (totalPlayedMs >= MIN_PLAY_TIME_MS) {
        // Store pending event in localStorage for recovery
        const pendingEvent = {
          trackUri: currentTrack.uri,
          trackName: currentTrack.name,
          artistName: currentTrack.artistName,
          artistUri: currentTrack.artistUri,
          albumName: currentTrack.albumName,
          albumUri: currentTrack.albumUri,
          albumArt: currentTrack.albumArt,
          albumReleaseDate: currentTrack.albumReleaseDate,
          durationMs: currentTrack.durationMs,
          playedMs: totalPlayedMs,
          startedAt: playStartTime - accumulatedPlayTime,
          endedAt: Date.now(),
          context: currentTrack.context,
          isExplicit: currentTrack.isExplicit,
        };
        localStorage.setItem('listening-stats:pendingEvent', JSON.stringify(pendingEvent));
      }
    }
  });

  console.log('[ListeningStats] Tracker initialized!');
}

// Recover any pending events from localStorage
export async function recoverPendingEvents(): Promise<void> {
  const pending = localStorage.getItem('listening-stats:pendingEvent');
  if (pending) {
    try {
      const event = JSON.parse(pending);
      await addPlayEvent(event);
      console.log('[ListeningStats] Recovered pending event:', event.trackName);
      localStorage.removeItem('listening-stats:pendingEvent');
    } catch (error) {
      console.error('[ListeningStats] Failed to recover pending event:', error);
    }
  }
}

// Clean up tracker (for extension disable)
export function destroyTracker(): void {
  Spicetify.Player.removeEventListener('songchange', handleSongChange);
  Spicetify.Player.removeEventListener('onplaypause', handlePlayPause);
  saveCurrentSession();
  console.log('[ListeningStats] Tracker destroyed');
}

// Background enrichment for play events
let enrichmentInProgress = false;
let enrichmentCycle: 'audioFeatures' | 'genres' = 'audioFeatures'; // Alternate each cycle

export async function runBackgroundEnrichment(force: boolean = false): Promise<void> {
  // Skip if already running or rate limited
  if (enrichmentInProgress) return;
  if (!isApiAvailable()) {
    console.log('[ListeningStats] Skipping enrichment - API rate limited');
    return;
  }
  // Only skip if not forced and not playing
  if (!force && !Spicetify.Player.isPlaying()) {
    console.log('[ListeningStats] Skipping enrichment - not playing');
    return;
  }

  enrichmentInProgress = true;

  try {
    // Fetch fewer events per cycle (more conservative)
    const events = await getEventsNeedingEnrichment(20);
    if (events.length === 0) {
      return;
    }

    console.log(`[ListeningStats] Enriching ${events.length} events (${enrichmentCycle} cycle)...`);
    
    let updatedCount = 0;

    // Alternate between audio features and genres each cycle to spread API load
    if (enrichmentCycle === 'audioFeatures') {
      const trackUris = [...new Set(
        events
          .filter(e => !e.audioFeatures && e.trackUri.startsWith('spotify:track:'))
          .map(e => e.trackUri)
      )];

      if (trackUris.length > 0) {
        try {
          const audioFeaturesMap = await fetchAudioFeaturesBatch(trackUris);
          console.log(`[ListeningStats] Fetched audio features for ${audioFeaturesMap.size}/${trackUris.length} tracks`);

          for (const event of events) {
            if (!event.id || event.audioFeatures) continue;
            if (audioFeaturesMap.has(event.trackUri)) {
              await updatePlayEvent(event.id, { audioFeatures: audioFeaturesMap.get(event.trackUri) });
              updatedCount++;
            }
          }
        } catch (error) {
          console.warn('[ListeningStats] Audio features batch failed:', error);
        }
      }
      enrichmentCycle = 'genres'; // Next cycle will fetch genres
    } else {
      const artistUris = [...new Set(
        events
          .filter(e => !e.genres && e.artistUri)
          .map(e => e.artistUri)
      )];

      if (artistUris.length > 0) {
        try {
          const genresMap = await fetchArtistGenresBatch(artistUris);
          console.log(`[ListeningStats] Fetched genres for ${genresMap.size}/${artistUris.length} artists`);

          for (const event of events) {
            if (!event.id || event.genres) continue;
            if (genresMap.has(event.artistUri)) {
              await updatePlayEvent(event.id, { genres: genresMap.get(event.artistUri) });
              updatedCount++;
            }
          }
        } catch (error) {
          console.warn('[ListeningStats] Artist genres batch failed:', error);
        }
      }
      enrichmentCycle = 'audioFeatures'; // Next cycle will fetch audio features
    }

    if (updatedCount > 0) {
      console.log(`[ListeningStats] Enrichment complete: updated ${updatedCount} events`);
    }
  } catch (error) {
    console.error('[ListeningStats] Background enrichment failed:', error);
  } finally {
    enrichmentInProgress = false;
  }
}

// Start periodic background enrichment
let enrichmentInterval: number | null = null;
const ENRICHMENT_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

export function startBackgroundEnrichment(): void {
  if (enrichmentInterval) return;
  
  // Run every 15 minutes (very conservative to avoid rate limits)
  enrichmentInterval = window.setInterval(() => {
    runBackgroundEnrichment();
  }, ENRICHMENT_INTERVAL_MS);

  // Run once after 60 seconds (give time for rate limits to clear)
  setTimeout(runBackgroundEnrichment, 60000);
  
  console.log('[ListeningStats] Background enrichment started (15 min interval)');
}

export function stopBackgroundEnrichment(): void {
  if (enrichmentInterval) {
    clearInterval(enrichmentInterval);
    enrichmentInterval = null;
  }
}
