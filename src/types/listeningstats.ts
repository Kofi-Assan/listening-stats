// Play event stored in IndexedDB
export interface PlayEvent {
  id?: number;
  trackUri: string;
  trackName: string;
  artistName: string;
  artistUri: string;
  albumName: string;
  albumUri: string;
  albumArt?: string;
  albumReleaseDate?: string; // ISO date string for release year tracking
  durationMs: number;
  playedMs: number;
  startedAt: number;
  endedAt: number;
  context?: string;
  isExplicit?: boolean;
  genres?: string[];
}

// Current track info from Spicetify
export interface TrackInfo {
  uri: string;
  name: string;
  artistName: string;
  artistUri: string;
  albumName: string;
  albumUri: string;
  albumArt?: string;
  albumReleaseDate?: string;
  durationMs: number;
  context?: string;
  isExplicit?: boolean;
}

// Stats for display
export interface ListeningStats {
  totalTimeMs: number;
  trackCount: number;
  uniqueTrackCount: number;
  uniqueArtistCount: number;
  topTracks: Array<{
    trackUri: string;
    trackName: string;
    artistName: string;
    albumArt?: string;
    playCount: number;
    totalTimeMs: number;
  }>;
  topArtists: Array<{
    artistUri: string;
    artistName: string;
    artistImage?: string;
    playCount: number;
    totalTimeMs: number;
  }>;
  topAlbums: Array<{
    albumUri: string;
    albumName: string;
    artistName: string;
    albumArt?: string;
    playCount: number;
    totalTimeMs: number;
  }>;
  hourlyDistribution: number[];
  peakHour: number; // Hour with most listening (0-23)
  recentTracks: PlayEvent[];
  // Genre distribution (genre -> frequency count)
  genres: Record<string, number>;
  topGenres: Array<{ genre: string; playCount: number; totalTimeMs: number }>;
  // Release year distribution (year -> frequency count)
  releaseYears: Record<string, number>;
  // Legacy fields for mood badge
  averageMood: number | null; // Average valence 0-1
  averageEnergy: number | null; // Average energy 0-1
  danceability: number | null; // Average danceability 0-1
  // Insights
  streakDays: number; // Consecutive days with listening
  newArtistsCount: number; // First-time artists in this period
  newTracksCount: number; // First-time tracks in this period
  avgSessionLength: number; // Average listening session in ms
  skipRate: number; // % of tracks played < 30s (0-1)
  listenedDays: number; // Number of unique days with activity
}

export type TimePeriod = "today" | "week" | "month" | "allTime";
