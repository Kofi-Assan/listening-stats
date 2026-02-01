import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { PlayEvent, TimePeriod, AudioFeatures } from '../types';

const DB_NAME = 'listening-stats';
const DB_VERSION = 2; // Bumped for audio features support
const STORE_NAME = 'playEvents';

interface ListeningStatsDB extends DBSchema {
  playEvents: {
    key: number;
    value: PlayEvent;
    indexes: {
      'by-startedAt': number;
      'by-trackUri': string;
      'by-artistUri': string;
    };
  };
}

let dbInstance: IDBPDatabase<ListeningStatsDB> | null = null;

async function getDB(): Promise<IDBPDatabase<ListeningStatsDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<ListeningStatsDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, newVersion, transaction) {
      if (oldVersion < 1) {
        // Initial schema
        const store = db.createObjectStore(STORE_NAME, {
          keyPath: 'id',
          autoIncrement: true,
        });
        store.createIndex('by-startedAt', 'startedAt');
        store.createIndex('by-trackUri', 'trackUri');
        store.createIndex('by-artistUri', 'artistUri');
      }
      // Version 2: audioFeatures and genres fields added
      // No schema changes needed - just new optional fields on PlayEvent
      if (oldVersion < 2) {
        console.log('[ListeningStats] DB upgraded to v2 - audio features support');
      }
    },
  });

  return dbInstance;
}

// Add a play event to the database
export async function addPlayEvent(event: Omit<PlayEvent, 'id'>): Promise<number> {
  const db = await getDB();
  return db.add(STORE_NAME, event as PlayEvent);
}

// Get play events within a time range
export async function getPlayEventsByTimeRange(
  startTime: number,
  endTime: number = Date.now()
): Promise<PlayEvent[]> {
  const db = await getDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const index = tx.store.index('by-startedAt');
  const range = IDBKeyRange.bound(startTime, endTime);
  return index.getAll(range);
}

// Get timestamp for start of period
export function getPeriodStartTime(period: TimePeriod): number {
  const now = new Date();

  switch (period) {
    case 'today':
      return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    case 'week':
      const dayOfWeek = now.getDay();
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - dayOfWeek);
      startOfWeek.setHours(0, 0, 0, 0);
      return startOfWeek.getTime();
    case 'month':
      return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    case 'allTime':
      return 0;
  }
}

// Get play events for a time period
export async function getPlayEventsForPeriod(period: TimePeriod): Promise<PlayEvent[]> {
  const startTime = getPeriodStartTime(period);
  return getPlayEventsByTimeRange(startTime);
}

// Get all play events (for debugging/export)
export async function getAllPlayEvents(): Promise<PlayEvent[]> {
  const db = await getDB();
  return db.getAll(STORE_NAME);
}

// Clear all data (for settings)
export async function clearAllData(): Promise<void> {
  const db = await getDB();
  await db.clear(STORE_NAME);
}

// Get total count of events
export async function getPlayEventCount(): Promise<number> {
  const db = await getDB();
  return db.count(STORE_NAME);
}

// Update a play event with enriched data (audio features, genres)
export async function updatePlayEvent(id: number, updates: Partial<PlayEvent>): Promise<void> {
  const db = await getDB();
  const event = await db.get(STORE_NAME, id);
  if (event) {
    const updated = { ...event, ...updates };
    await db.put(STORE_NAME, updated);
  }
}

// Check if audio features are placeholder/default values (all 0.5)
function isPlaceholderAudioFeatures(af: AudioFeatures): boolean {
  return af.valence === 0.5 && af.energy === 0.5 && af.danceability === 0.5;
}

// Get events that need audio features enrichment
export async function getEventsNeedingEnrichment(limit: number = 50): Promise<PlayEvent[]> {
  const db = await getDB();
  const allEvents = await db.getAll(STORE_NAME);
  return allEvents
    .filter(event => {
      // Need enrichment if no audio features or they're placeholder values
      const needsFeatures = !event.audioFeatures || isPlaceholderAudioFeatures(event.audioFeatures);
      return needsFeatures && event.trackUri.startsWith('spotify:track:');
    })
    .slice(0, limit);
}
