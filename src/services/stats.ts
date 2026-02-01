import { getPlayEventsForPeriod } from './storage';
import { PlayEvent, ListeningStats, TimePeriod, MoodCategory, AudioAnalysis } from '../types';

// Determine mood category based on valence and energy
function getMoodCategory(valence: number | null, energy: number | null): MoodCategory {
  if (valence === null || energy === null) return 'mixed';
  
  if (valence >= 0.6 && energy >= 0.6) return 'happy';
  if (valence < 0.4 && energy >= 0.6) return 'energetic';
  if (valence >= 0.5 && energy < 0.5) return 'chill';
  if (valence < 0.4 && energy < 0.5) return 'melancholic';
  return 'mixed';
}

export async function calculateStats(period: TimePeriod): Promise<ListeningStats> {
  const events = await getPlayEventsForPeriod(period);
  const allTimeEvents = period !== 'allTime' ? await getPlayEventsForPeriod('allTime') : events;
  
  const totalTimeMs = events.reduce((sum, event) => sum + event.playedMs, 0);

  // Track aggregation
  const trackMap = new Map<string, {
    trackUri: string;
    trackName: string;
    artistName: string;
    albumArt?: string;
    playCount: number;
    totalTimeMs: number;
  }>();

  // Artist aggregation
  const artistMap = new Map<string, {
    artistUri: string;
    artistName: string;
    artistImage?: string;
    playCount: number;
    totalTimeMs: number;
  }>();

  // Album aggregation
  const albumMap = new Map<string, {
    albumUri: string;
    albumName: string;
    artistName: string;
    albumArt?: string;
    playCount: number;
    totalTimeMs: number;
  }>();

  // Genre aggregation
  const genreMap = new Map<string, { playCount: number; totalTimeMs: number }>();

  // Hourly distribution (24 hours)
  const hourlyDistribution = new Array(24).fill(0);

  // Day tracking for streaks and listened days
  const daysWithActivity = new Set<string>();

  // Audio features aggregation
  const audioFeaturesSum = {
    danceability: 0,
    energy: 0,
    speechiness: 0,
    acousticness: 0,
    instrumentalness: 0,
    liveness: 0,
    valence: 0,
    tempo: 0,
  };
  let eventsWithFeatures = 0;
  let explicitCount = 0;

  // Release year distribution
  const releaseYears: Record<string, number> = {};

  // Skip tracking
  let skippedCount = 0;
  const SKIP_THRESHOLD_MS = 30000; // 30 seconds

  // Get all-time tracks/artists for discovery calculation
  const allTimeTrackUris = new Set(allTimeEvents.map(e => e.trackUri));
  const allTimeArtistKeys = new Set(allTimeEvents.map(e => e.artistUri || e.artistName));
  const periodStartTime = events.length > 0 ? Math.min(...events.map(e => e.startedAt)) : Date.now();
  
  // Track first-time discoveries
  const newTracksInPeriod = new Set<string>();
  const newArtistsInPeriod = new Set<string>();

  for (const event of events) {
    // Day tracking
    const dayKey = new Date(event.startedAt).toDateString();
    daysWithActivity.add(dayKey);

    // Skip tracking
    if (event.playedMs < SKIP_THRESHOLD_MS && event.durationMs > SKIP_THRESHOLD_MS) {
      skippedCount++;
    }

    // Track aggregation
    const existingTrack = trackMap.get(event.trackUri);
    if (existingTrack) {
      existingTrack.playCount++;
      existingTrack.totalTimeMs += event.playedMs;
    } else {
      trackMap.set(event.trackUri, {
        trackUri: event.trackUri,
        trackName: event.trackName,
        artistName: event.artistName,
        albumArt: event.albumArt,
        playCount: 1,
        totalTimeMs: event.playedMs,
      });
    }

    // Artist aggregation
    const artistKey = event.artistUri || event.artistName;
    const existingArtist = artistMap.get(artistKey);
    if (existingArtist) {
      existingArtist.playCount++;
      existingArtist.totalTimeMs += event.playedMs;
      // Keep the album art as a placeholder for artist image
      if (!existingArtist.artistImage && event.albumArt) {
        existingArtist.artistImage = event.albumArt;
      }
    } else {
      artistMap.set(artistKey, {
        artistUri: event.artistUri,
        artistName: event.artistName,
        artistImage: event.albumArt, // Use album art as placeholder
        playCount: 1,
        totalTimeMs: event.playedMs,
      });
    }

    // Album aggregation
    if (event.albumUri) {
      const existingAlbum = albumMap.get(event.albumUri);
      if (existingAlbum) {
        existingAlbum.playCount++;
        existingAlbum.totalTimeMs += event.playedMs;
      } else {
        albumMap.set(event.albumUri, {
          albumUri: event.albumUri,
          albumName: event.albumName,
          artistName: event.artistName,
          albumArt: event.albumArt,
          playCount: 1,
          totalTimeMs: event.playedMs,
        });
      }
    }

    // Genre aggregation (from event's genres array)
    if (event.genres) {
      for (const genre of event.genres) {
        const existing = genreMap.get(genre);
        if (existing) {
          existing.playCount++;
          existing.totalTimeMs += event.playedMs;
        } else {
          genreMap.set(genre, { playCount: 1, totalTimeMs: event.playedMs });
        }
      }
    }

  // Audio features aggregation (exclude default 0.5 values from internal API)
    if (event.audioFeatures) {
      const af = event.audioFeatures;
      // Check for default/placeholder data - all exactly 0.5 is suspicious
      const isDefaultData = af.valence === 0.5 && af.energy === 0.5 && af.danceability === 0.5;
      if (!isDefaultData && (af.danceability > 0 || af.energy > 0 || af.valence > 0)) {
        audioFeaturesSum.danceability += af.danceability || 0;
        audioFeaturesSum.energy += af.energy || 0;
        audioFeaturesSum.speechiness += af.speechiness || 0;
        audioFeaturesSum.acousticness += af.acousticness || 0;
        audioFeaturesSum.instrumentalness += af.instrumentalness || 0;
        audioFeaturesSum.liveness += af.liveness || 0;
        audioFeaturesSum.valence += af.valence || 0;
        audioFeaturesSum.tempo += af.tempo || 0;
        eventsWithFeatures++;
      }
    }

    // Explicit content tracking
    if (event.isExplicit) {
      explicitCount++;
    }

    // Release year distribution
    if (event.albumReleaseDate) {
      const year = new Date(event.albumReleaseDate).getFullYear().toString();
      releaseYears[year] = (releaseYears[year] || 0) + 1;
    }

    // Hourly distribution
    const hour = new Date(event.startedAt).getHours();
    hourlyDistribution[hour] += event.playedMs;

    // Discovery tracking - check if this was first play ever
    if (period !== 'allTime') {
      const firstPlayOfTrack = allTimeEvents
        .filter(e => e.trackUri === event.trackUri)
        .sort((a, b) => a.startedAt - b.startedAt)[0];
      if (firstPlayOfTrack && firstPlayOfTrack.startedAt >= periodStartTime) {
        newTracksInPeriod.add(event.trackUri);
      }

      const firstPlayOfArtist = allTimeEvents
        .filter(e => (e.artistUri || e.artistName) === artistKey)
        .sort((a, b) => a.startedAt - b.startedAt)[0];
      if (firstPlayOfArtist && firstPlayOfArtist.startedAt >= periodStartTime) {
        newArtistsInPeriod.add(artistKey);
      }
    }
  }

  // Calculate streak (consecutive days from today going back)
  let streakDays = 0;
  const today = new Date();
  for (let i = 0; i < 365; i++) {
    const checkDate = new Date(today);
    checkDate.setDate(today.getDate() - i);
    const dayKey = checkDate.toDateString();
    if (daysWithActivity.has(dayKey)) {
      streakDays++;
    } else if (i > 0) { // Don't break on today if no activity yet
      break;
    }
  }

  // Peak hour
  const peakHour = hourlyDistribution.indexOf(Math.max(...hourlyDistribution));

  const topTracks = Array.from(trackMap.values())
    .sort((a, b) => b.totalTimeMs - a.totalTimeMs)
    .slice(0, 10);

  const topArtists = Array.from(artistMap.values())
    .sort((a, b) => b.totalTimeMs - a.totalTimeMs)
    .slice(0, 10);

  const topAlbums = Array.from(albumMap.values())
    .sort((a, b) => b.totalTimeMs - a.totalTimeMs)
    .slice(0, 10);

  const topGenres = Array.from(genreMap.entries())
    .map(([genre, data]) => ({ genre, ...data }))
    .sort((a, b) => b.totalTimeMs - a.totalTimeMs)
    .slice(0, 10);

  const recentTracks = events
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, 10);

  // Calculate averaged audio analysis
  const analysis: AudioAnalysis = {
    danceability: eventsWithFeatures > 0 ? audioFeaturesSum.danceability / eventsWithFeatures : 0,
    energy: eventsWithFeatures > 0 ? audioFeaturesSum.energy / eventsWithFeatures : 0,
    speechiness: eventsWithFeatures > 0 ? audioFeaturesSum.speechiness / eventsWithFeatures : 0,
    acousticness: eventsWithFeatures > 0 ? audioFeaturesSum.acousticness / eventsWithFeatures : 0,
    instrumentalness: eventsWithFeatures > 0 ? audioFeaturesSum.instrumentalness / eventsWithFeatures : 0,
    liveness: eventsWithFeatures > 0 ? audioFeaturesSum.liveness / eventsWithFeatures : 0,
    valence: eventsWithFeatures > 0 ? audioFeaturesSum.valence / eventsWithFeatures : 0,
    tempo: eventsWithFeatures > 0 ? audioFeaturesSum.tempo / eventsWithFeatures : 0,
    explicit: events.length > 0 ? explicitCount / events.length : 0,
  };

  // Build genre frequency map
  const genres: Record<string, number> = {};
  for (const [genre, data] of genreMap.entries()) {
    genres[genre] = data.playCount;
  }

  // Legacy fields for backward compatibility
  const averageMood = eventsWithFeatures > 0 ? analysis.valence : null;
  const averageEnergy = eventsWithFeatures > 0 ? analysis.energy : null;
  const danceability = eventsWithFeatures > 0 ? analysis.danceability : null;
  const moodCategory = getMoodCategory(averageMood, averageEnergy);

  // Average session length (rough estimate: total time / number of unique days)
  const listenedDays = daysWithActivity.size;
  const avgSessionLength = listenedDays > 0 ? totalTimeMs / listenedDays : 0;

  // Skip rate
  const skipRate = events.length > 0 ? skippedCount / events.length : 0;

  return {
    totalTimeMs,
    trackCount: events.length,
    uniqueTrackCount: trackMap.size,
    uniqueArtistCount: artistMap.size,
    topTracks,
    topArtists,
    topAlbums,
    hourlyDistribution,
    peakHour,
    recentTracks,
    genres,
    topGenres,
    analysis,
    releaseYears,
    averageMood,
    averageEnergy,
    moodCategory,
    danceability,
    streakDays,
    newArtistsCount: newArtistsInPeriod.size,
    newTracksCount: newTracksInPeriod.size,
    avgSessionLength,
    skipRate,
    listenedDays,
  };
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  } else {
    return `${seconds}s`;
  }
}

export function formatDurationLong(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else {
    return `${minutes} min`;
  }
}

export function getPeriodDisplayName(period: TimePeriod): string {
  switch (period) {
    case 'today': return 'Today';
    case 'week': return 'This Week';
    case 'month': return 'This Month';
    case 'allTime': return 'All Time';
  }
}
