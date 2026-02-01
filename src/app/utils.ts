// Utility functions for the Listening Stats app

/**
 * Navigate to a Spotify URI
 */
export function navigateToUri(uri: string): void {
  if (uri && Spicetify.Platform?.History) {
    const [, type, id] = uri.split(':');
    if (type && id) {
      Spicetify.Platform.History.push(`/${type}/${id}`);
    }
  }
}

/**
 * Toggle like status for a track
 */
export async function toggleLike(trackUri: string, isLiked: boolean): Promise<boolean> {
  try {
    if (isLiked) {
      await Spicetify.Platform.LibraryAPI.remove({ uris: [trackUri] });
    } else {
      await Spicetify.Platform.LibraryAPI.add({ uris: [trackUri] });
    }
    return !isLiked;
  } catch (error) {
    console.error('[ListeningStats] Failed to toggle like:', error);
    return isLiked;
  }
}

/**
 * Check liked status for multiple tracks
 */
export async function checkLikedTracks(trackUris: string[]): Promise<Map<string, boolean>> {
  const result = new Map<string, boolean>();
  if (trackUris.length === 0) return result;
  
  try {
    const contains = await Spicetify.Platform.LibraryAPI.contains(...trackUris);
    trackUris.forEach((uri, i) => result.set(uri, contains[i]));
  } catch (error) {
    console.error('[ListeningStats] Failed to check liked status:', error);
  }
  return result;
}

/**
 * Fetch artist images from Spotify API
 */
export async function fetchArtistImages(artistUris: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const validUris = artistUris.filter(uri => uri?.startsWith('spotify:artist:'));
  if (validUris.length === 0) return result;
  
  try {
    const ids = validUris.map(uri => uri.split(':')[2]).join(',');
    const response = await Spicetify.CosmosAsync.get(`https://api.spotify.com/v1/artists?ids=${ids}`);
    if (response?.artists) {
      response.artists.forEach((artist: any, i: number) => {
        if (artist?.images?.[0]?.url) {
          result.set(validUris[i], artist.images[0].url);
        }
      });
    }
  } catch (error) {
    console.warn('[ListeningStats] Failed to fetch artist images:', error);
  }
  return result;
}

/**
 * Format hour number to 12h format
 */
export function formatHour(h: number): string {
  if (h === 0) return '12am';
  if (h === 12) return '12pm';
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}

/**
 * Format milliseconds to minutes string
 */
export function formatMinutes(ms: number): string {
  return `${Math.round(ms / 60000)} min`;
}

/**
 * Estimate artist payout based on stream count
 * Spotify pays roughly $0.003-0.005 per stream on average
 */
const PAYOUT_PER_STREAM = 0.004;

export function estimateArtistPayout(streamCount: number): string {
  const payout = streamCount * PAYOUT_PER_STREAM;
  return payout.toFixed(2);
}

/**
 * Get rank CSS class based on position
 */
export function getRankClass(index: number): string {
  if (index === 0) return 'gold';
  if (index === 1) return 'silver';
  if (index === 2) return 'bronze';
  return '';
}
