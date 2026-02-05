import { PlayEvent, TrackInfo } from "../types/listeningstats";
import { addPlayEvent } from "./storage";

// Minimum play time to count as a "play" (10 seconds)
const MIN_PLAY_TIME_MS = 10000;

// Event system for notifying UI of new data (uses window events for cross-context)
const STATS_UPDATED_EVENT = "listening-stats:updated";

export function onStatsUpdated(callback: () => void): () => void {
  const handler = () => callback();
  window.addEventListener(STATS_UPDATED_EVENT, handler);
  return () => window.removeEventListener(STATS_UPDATED_EVENT, handler);
}

function emitStatsUpdated(): void {
  window.dispatchEvent(new CustomEvent(STATS_UPDATED_EVENT));
  // Also store timestamp for polling fallback
  localStorage.setItem("listening-stats:lastUpdate", Date.now().toString());
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
    name: metadata?.title || item.name || "Unknown",
    artistName: metadata?.artist_name || "Unknown Artist",
    artistUri: metadata?.artist_uri || "",
    albumName: metadata?.album_title || "Unknown Album",
    albumUri: metadata?.album_uri || "",
    albumArt: metadata?.image_xlarge_url || metadata?.image_url,
    albumReleaseDate: metadata?.album_disc_number ? undefined : metadata?.year, // Year if available
    durationMs:
      item.duration?.milliseconds || Spicetify.Player.getDuration() || 0,
    context: data.context_uri,
    isExplicit: metadata?.is_explicit === "true" || item.isExplicit === true,
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
    console.log("[ListeningStats] Skipped saving - played less than 10s");
    return;
  }

  // Save the basic event first (no API calls needed)
  const event: Omit<PlayEvent, "id"> = {
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
    console.log(
      `[ListeningStats] Saved: ${currentTrack.name} - ${formatTime(totalPlayedMs)}`,
    );
    // Notify listeners that new data is available
    emitStatsUpdated();
  } catch (error) {
    console.error("[ListeningStats] Failed to save play event:", error);
  }
}

// Format milliseconds to readable time
function formatTime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
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
    console.log(
      `[ListeningStats] Now tracking: ${newTrack.name} by ${newTrack.artistName}`,
    );
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
    console.log(
      `[ListeningStats] Paused - accumulated ${formatTime(accumulatedPlayTime)}`,
    );
  } else if (!wasPlaying && isPlaying) {
    // Resumed - reset start time
    playStartTime = Date.now();
    console.log("[ListeningStats] Resumed playback");
  }
}

// Initialize the tracker
export function initTracker(): void {
  console.log("[ListeningStats] Initializing tracker...");

  // Set up event listeners
  Spicetify.Player.addEventListener("songchange", handleSongChange);
  Spicetify.Player.addEventListener("onplaypause", handlePlayPause);

  // Track current song if already playing
  const initialTrack = extractTrackInfo();
  if (initialTrack) {
    currentTrack = initialTrack;
    playStartTime = Date.now();
    isPlaying = !Spicetify.Player.data?.isPaused;
    console.log(`[ListeningStats] Initial track: ${initialTrack.name}`);
  }

  // Save session before page unload
  window.addEventListener("beforeunload", () => {
    // Use sync localStorage as fallback for unsaved data
    if (currentTrack && playStartTime) {
      const totalPlayedMs =
        accumulatedPlayTime + (isPlaying ? Date.now() - playStartTime : 0);
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
        localStorage.setItem(
          "listening-stats:pendingEvent",
          JSON.stringify(pendingEvent),
        );
      }
    }
  });

  console.log("[ListeningStats] Tracker initialized!");
}

// Recover any pending events from localStorage
export async function recoverPendingEvents(): Promise<void> {
  const pending = localStorage.getItem("listening-stats:pendingEvent");
  if (pending) {
    try {
      const event = JSON.parse(pending);
      await addPlayEvent(event);
      console.log("[ListeningStats] Recovered pending event:", event.trackName);
      localStorage.removeItem("listening-stats:pendingEvent");
    } catch (error) {
      console.error("[ListeningStats] Failed to recover pending event:", error);
    }
  }
}

// Clean up tracker (for extension disable)
export function destroyTracker(): void {
  Spicetify.Player.removeEventListener("songchange", handleSongChange);
  Spicetify.Player.removeEventListener("onplaypause", handlePlayPause);
  saveCurrentSession();
  console.log("[ListeningStats] Tracker destroyed");
}
