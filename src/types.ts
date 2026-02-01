// Audio features from Spotify API
export interface AudioFeatures {
  energy: number; // 0-1, intensity and activity
  valence: number; // 0-1, musical positiveness (mood)
  danceability: number; // 0-1, how suitable for dancing
  tempo: number; // BPM
  acousticness: number; // 0-1, acoustic vs electronic
  instrumentalness: number; // 0-1, vocals vs instrumental
  speechiness: number; // 0-1, presence of spoken words
  liveness: number; // 0-1, presence of audience in recording
}

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
  // Rich data (fetched from Spotify API)
  audioFeatures?: AudioFeatures;
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

// Mood insight based on valence
export type MoodCategory =
  | "happy"
  | "energetic"
  | "chill"
  | "melancholic"
  | "mixed";

// Audio feature analysis result (like harbassan's stats approach)
export interface AudioAnalysis {
  danceability: number;
  energy: number;
  speechiness: number;
  acousticness: number;
  instrumentalness: number;
  liveness: number;
  valence: number;
  tempo: number;
  explicit: number; // percentage of explicit tracks
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
  // Audio analysis (aggregated features)
  analysis: AudioAnalysis;
  // Release year distribution (year -> frequency count)
  releaseYears: Record<string, number>;
  // Legacy fields for mood badge
  averageMood: number | null; // Average valence 0-1
  averageEnergy: number | null; // Average energy 0-1
  moodCategory: MoodCategory;
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
