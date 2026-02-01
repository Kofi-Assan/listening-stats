(() => {
  // node_modules/idb/build/index.js
  var instanceOfAny = (object, constructors) => constructors.some((c) => object instanceof c);
  var idbProxyableTypes;
  var cursorAdvanceMethods;
  function getIdbProxyableTypes() {
    return idbProxyableTypes || (idbProxyableTypes = [
      IDBDatabase,
      IDBObjectStore,
      IDBIndex,
      IDBCursor,
      IDBTransaction
    ]);
  }
  function getCursorAdvanceMethods() {
    return cursorAdvanceMethods || (cursorAdvanceMethods = [
      IDBCursor.prototype.advance,
      IDBCursor.prototype.continue,
      IDBCursor.prototype.continuePrimaryKey
    ]);
  }
  var transactionDoneMap = /* @__PURE__ */ new WeakMap();
  var transformCache = /* @__PURE__ */ new WeakMap();
  var reverseTransformCache = /* @__PURE__ */ new WeakMap();
  function promisifyRequest(request) {
    const promise = new Promise((resolve, reject) => {
      const unlisten = () => {
        request.removeEventListener("success", success);
        request.removeEventListener("error", error);
      };
      const success = () => {
        resolve(wrap(request.result));
        unlisten();
      };
      const error = () => {
        reject(request.error);
        unlisten();
      };
      request.addEventListener("success", success);
      request.addEventListener("error", error);
    });
    reverseTransformCache.set(promise, request);
    return promise;
  }
  function cacheDonePromiseForTransaction(tx) {
    if (transactionDoneMap.has(tx))
      return;
    const done = new Promise((resolve, reject) => {
      const unlisten = () => {
        tx.removeEventListener("complete", complete);
        tx.removeEventListener("error", error);
        tx.removeEventListener("abort", error);
      };
      const complete = () => {
        resolve();
        unlisten();
      };
      const error = () => {
        reject(tx.error || new DOMException("AbortError", "AbortError"));
        unlisten();
      };
      tx.addEventListener("complete", complete);
      tx.addEventListener("error", error);
      tx.addEventListener("abort", error);
    });
    transactionDoneMap.set(tx, done);
  }
  var idbProxyTraps = {
    get(target, prop, receiver) {
      if (target instanceof IDBTransaction) {
        if (prop === "done")
          return transactionDoneMap.get(target);
        if (prop === "store") {
          return receiver.objectStoreNames[1] ? void 0 : receiver.objectStore(receiver.objectStoreNames[0]);
        }
      }
      return wrap(target[prop]);
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
    has(target, prop) {
      if (target instanceof IDBTransaction && (prop === "done" || prop === "store")) {
        return true;
      }
      return prop in target;
    }
  };
  function replaceTraps(callback) {
    idbProxyTraps = callback(idbProxyTraps);
  }
  function wrapFunction(func) {
    if (getCursorAdvanceMethods().includes(func)) {
      return function(...args) {
        func.apply(unwrap(this), args);
        return wrap(this.request);
      };
    }
    return function(...args) {
      return wrap(func.apply(unwrap(this), args));
    };
  }
  function transformCachableValue(value) {
    if (typeof value === "function")
      return wrapFunction(value);
    if (value instanceof IDBTransaction)
      cacheDonePromiseForTransaction(value);
    if (instanceOfAny(value, getIdbProxyableTypes()))
      return new Proxy(value, idbProxyTraps);
    return value;
  }
  function wrap(value) {
    if (value instanceof IDBRequest)
      return promisifyRequest(value);
    if (transformCache.has(value))
      return transformCache.get(value);
    const newValue = transformCachableValue(value);
    if (newValue !== value) {
      transformCache.set(value, newValue);
      reverseTransformCache.set(newValue, value);
    }
    return newValue;
  }
  var unwrap = (value) => reverseTransformCache.get(value);
  function openDB(name, version, { blocked, upgrade, blocking, terminated } = {}) {
    const request = indexedDB.open(name, version);
    const openPromise = wrap(request);
    if (upgrade) {
      request.addEventListener("upgradeneeded", (event) => {
        upgrade(wrap(request.result), event.oldVersion, event.newVersion, wrap(request.transaction), event);
      });
    }
    if (blocked) {
      request.addEventListener("blocked", (event) => blocked(
        // Casting due to https://github.com/microsoft/TypeScript-DOM-lib-generator/pull/1405
        event.oldVersion,
        event.newVersion,
        event
      ));
    }
    openPromise.then((db) => {
      if (terminated)
        db.addEventListener("close", () => terminated());
      if (blocking) {
        db.addEventListener("versionchange", (event) => blocking(event.oldVersion, event.newVersion, event));
      }
    }).catch(() => {
    });
    return openPromise;
  }
  var readMethods = ["get", "getKey", "getAll", "getAllKeys", "count"];
  var writeMethods = ["put", "add", "delete", "clear"];
  var cachedMethods = /* @__PURE__ */ new Map();
  function getMethod(target, prop) {
    if (!(target instanceof IDBDatabase && !(prop in target) && typeof prop === "string")) {
      return;
    }
    if (cachedMethods.get(prop))
      return cachedMethods.get(prop);
    const targetFuncName = prop.replace(/FromIndex$/, "");
    const useIndex = prop !== targetFuncName;
    const isWrite = writeMethods.includes(targetFuncName);
    if (
      // Bail if the target doesn't exist on the target. Eg, getAll isn't in Edge.
      !(targetFuncName in (useIndex ? IDBIndex : IDBObjectStore).prototype) || !(isWrite || readMethods.includes(targetFuncName))
    ) {
      return;
    }
    const method = async function(storeName, ...args) {
      const tx = this.transaction(storeName, isWrite ? "readwrite" : "readonly");
      let target2 = tx.store;
      if (useIndex)
        target2 = target2.index(args.shift());
      return (await Promise.all([
        target2[targetFuncName](...args),
        isWrite && tx.done
      ]))[0];
    };
    cachedMethods.set(prop, method);
    return method;
  }
  replaceTraps((oldTraps) => ({
    ...oldTraps,
    get: (target, prop, receiver) => getMethod(target, prop) || oldTraps.get(target, prop, receiver),
    has: (target, prop) => !!getMethod(target, prop) || oldTraps.has(target, prop)
  }));
  var advanceMethodProps = ["continue", "continuePrimaryKey", "advance"];
  var methodMap = {};
  var advanceResults = /* @__PURE__ */ new WeakMap();
  var ittrProxiedCursorToOriginalProxy = /* @__PURE__ */ new WeakMap();
  var cursorIteratorTraps = {
    get(target, prop) {
      if (!advanceMethodProps.includes(prop))
        return target[prop];
      let cachedFunc = methodMap[prop];
      if (!cachedFunc) {
        cachedFunc = methodMap[prop] = function(...args) {
          advanceResults.set(this, ittrProxiedCursorToOriginalProxy.get(this)[prop](...args));
        };
      }
      return cachedFunc;
    }
  };
  async function* iterate(...args) {
    let cursor = this;
    if (!(cursor instanceof IDBCursor)) {
      cursor = await cursor.openCursor(...args);
    }
    if (!cursor)
      return;
    cursor = cursor;
    const proxiedCursor = new Proxy(cursor, cursorIteratorTraps);
    ittrProxiedCursorToOriginalProxy.set(proxiedCursor, cursor);
    reverseTransformCache.set(proxiedCursor, unwrap(cursor));
    while (cursor) {
      yield proxiedCursor;
      cursor = await (advanceResults.get(proxiedCursor) || cursor.continue());
      advanceResults.delete(proxiedCursor);
    }
  }
  function isIteratorProp(target, prop) {
    return prop === Symbol.asyncIterator && instanceOfAny(target, [IDBIndex, IDBObjectStore, IDBCursor]) || prop === "iterate" && instanceOfAny(target, [IDBIndex, IDBObjectStore]);
  }
  replaceTraps((oldTraps) => ({
    ...oldTraps,
    get(target, prop, receiver) {
      if (isIteratorProp(target, prop))
        return iterate;
      return oldTraps.get(target, prop, receiver);
    },
    has(target, prop) {
      return isIteratorProp(target, prop) || oldTraps.has(target, prop);
    }
  }));

  // src/services/storage.ts
  var DB_NAME = "listening-stats";
  var DB_VERSION = 2;
  var STORE_NAME = "playEvents";
  var dbInstance = null;
  async function getDB() {
    if (dbInstance) return dbInstance;
    dbInstance = await openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, newVersion, transaction) {
        if (oldVersion < 1) {
          const store = db.createObjectStore(STORE_NAME, {
            keyPath: "id",
            autoIncrement: true
          });
          store.createIndex("by-startedAt", "startedAt");
          store.createIndex("by-trackUri", "trackUri");
          store.createIndex("by-artistUri", "artistUri");
        }
        if (oldVersion < 2) {
          console.log("[ListeningStats] DB upgraded to v2 - audio features support");
        }
      }
    });
    return dbInstance;
  }
  async function addPlayEvent(event) {
    const db = await getDB();
    return db.add(STORE_NAME, event);
  }
  async function updatePlayEvent(id, updates) {
    const db = await getDB();
    const event = await db.get(STORE_NAME, id);
    if (event) {
      const updated = { ...event, ...updates };
      await db.put(STORE_NAME, updated);
    }
  }
  function isPlaceholderAudioFeatures(af) {
    return af.valence === 0.5 && af.energy === 0.5 && af.danceability === 0.5;
  }
  async function getEventsNeedingEnrichment(limit = 50) {
    const db = await getDB();
    const allEvents = await db.getAll(STORE_NAME);
    return allEvents.filter((event) => {
      const needsFeatures = !event.audioFeatures || isPlaceholderAudioFeatures(event.audioFeatures);
      return needsFeatures && event.trackUri.startsWith("spotify:track:");
    }).slice(0, limit);
  }

  // src/services/spotify-api.ts
  var STORAGE_PREFIX = "listening-stats:";
  var MIN_API_INTERVAL_MS = 1e4;
  var BATCH_SIZE = 3;
  var DEFAULT_BACKOFF_MS = 3e5;
  var MAX_BACKOFF_MS = 36e5;
  var CACHE_PERSIST_INTERVAL_MS = 6e4;
  var audioFeaturesCache = /* @__PURE__ */ new Map();
  var artistGenresCache = /* @__PURE__ */ new Map();
  var rateLimitedUntil = 0;
  var lastApiCallTime = 0;
  var cachesPersistTimeout = null;
  function initFromStorage() {
    try {
      const storedRateLimit = localStorage.getItem(`${STORAGE_PREFIX}rateLimitedUntil`);
      if (storedRateLimit) {
        rateLimitedUntil = parseInt(storedRateLimit, 10);
        if (Date.now() >= rateLimitedUntil) {
          rateLimitedUntil = 0;
          localStorage.removeItem(`${STORAGE_PREFIX}rateLimitedUntil`);
        }
      }
      const storedAudioFeatures = localStorage.getItem(`${STORAGE_PREFIX}audioFeaturesCache`);
      if (storedAudioFeatures) {
        const parsed = JSON.parse(storedAudioFeatures);
        audioFeaturesCache = new Map(Object.entries(parsed));
        console.log(`[ListeningStats] Loaded ${audioFeaturesCache.size} cached audio features`);
      }
      const storedGenres = localStorage.getItem(`${STORAGE_PREFIX}artistGenresCache`);
      if (storedGenres) {
        const parsed = JSON.parse(storedGenres);
        artistGenresCache = new Map(Object.entries(parsed));
        console.log(`[ListeningStats] Loaded ${artistGenresCache.size} cached artist genres`);
      }
    } catch (error) {
      console.warn("[ListeningStats] Failed to load cached API data:", error);
    }
  }
  function scheduleCachePersist() {
    if (cachesPersistTimeout) return;
    cachesPersistTimeout = window.setTimeout(() => {
      persistCaches();
      cachesPersistTimeout = null;
    }, CACHE_PERSIST_INTERVAL_MS);
  }
  function persistCaches() {
    try {
      const audioFeaturesObj = {};
      const audioEntries = Array.from(audioFeaturesCache.entries()).slice(-500);
      audioEntries.forEach(([k, v]) => {
        audioFeaturesObj[k] = v;
      });
      localStorage.setItem(`${STORAGE_PREFIX}audioFeaturesCache`, JSON.stringify(audioFeaturesObj));
      const genresObj = {};
      const genreEntries = Array.from(artistGenresCache.entries()).slice(-500);
      genreEntries.forEach(([k, v]) => {
        genresObj[k] = v;
      });
      localStorage.setItem(`${STORAGE_PREFIX}artistGenresCache`, JSON.stringify(genresObj));
    } catch (error) {
      console.warn("[ListeningStats] Failed to persist caches:", error);
    }
  }
  function handleRateLimit(error) {
    let backoffMs = DEFAULT_BACKOFF_MS;
    if (error?.headers?.["retry-after"]) {
      const retryAfter = parseInt(error.headers["retry-after"], 10);
      if (!isNaN(retryAfter)) {
        backoffMs = Math.min(retryAfter * 1e3, MAX_BACKOFF_MS);
      }
    } else if (error?.body?.["Retry-After"]) {
      const retryAfter = parseInt(error.body["Retry-After"], 10);
      if (!isNaN(retryAfter)) {
        backoffMs = Math.min(retryAfter * 1e3, MAX_BACKOFF_MS);
      }
    }
    rateLimitedUntil = Date.now() + backoffMs;
    localStorage.setItem(`${STORAGE_PREFIX}rateLimitedUntil`, rateLimitedUntil.toString());
    console.log(`[ListeningStats] Rate limited, backing off for ${Math.ceil(backoffMs / 6e4)} minutes`);
  }
  function clearRateLimit() {
    if (rateLimitedUntil > 0) {
      rateLimitedUntil = 0;
      localStorage.removeItem(`${STORAGE_PREFIX}rateLimitedUntil`);
    }
  }
  function isApiAvailable() {
    return Date.now() >= rateLimitedUntil;
  }
  async function waitForApiSlot() {
    if (!isApiAvailable()) {
      const waitTime = rateLimitedUntil - Date.now();
      console.log(`[ListeningStats] Rate limited, skipping (${Math.ceil(waitTime / 1e3)}s remaining)`);
      return false;
    }
    const timeSinceLastCall = Date.now() - lastApiCallTime;
    if (timeSinceLastCall < MIN_API_INTERVAL_MS) {
      await new Promise((resolve) => setTimeout(resolve, MIN_API_INTERVAL_MS - timeSinceLastCall));
    }
    lastApiCallTime = Date.now();
    return true;
  }
  initFromStorage();
  function extractTrackId(uri) {
    const match = uri.match(/spotify:track:([a-zA-Z0-9]+)/);
    return match ? match[1] : null;
  }
  function extractArtistId(uri) {
    const match = uri.match(/spotify:artist:([a-zA-Z0-9]+)/);
    return match ? match[1] : null;
  }
  async function getAudioAnalysis(trackUri) {
    try {
      const data = await Spicetify.getAudioData(trackUri);
      if (data?.track?.tempo) {
        return { tempo: data.track.tempo };
      }
    } catch (error) {
    }
    return null;
  }
  function isPlaceholderAudioFeatures2(af) {
    return af.valence === 0.5 && af.energy === 0.5 && af.danceability === 0.5;
  }
  async function fetchAudioFeaturesBatch(trackUris) {
    const result = /* @__PURE__ */ new Map();
    const uncachedUris = trackUris.filter((uri) => {
      if (audioFeaturesCache.has(uri)) {
        const cached = audioFeaturesCache.get(uri);
        if (!isPlaceholderAudioFeatures2(cached)) {
          result.set(uri, cached);
          return false;
        }
      }
      return extractTrackId(uri) !== null;
    });
    if (uncachedUris.length === 0) {
      return result;
    }
    const tempoFromAnalysis = /* @__PURE__ */ new Map();
    for (const uri of uncachedUris) {
      const analysis = await getAudioAnalysis(uri);
      if (analysis) {
        tempoFromAnalysis.set(uri, analysis.tempo);
      }
    }
    const stillNeeded = uncachedUris;
    if (stillNeeded.length > 0 && await waitForApiSlot()) {
      const smallBatch = stillNeeded.slice(0, BATCH_SIZE);
      try {
        const ids = smallBatch.map((uri) => extractTrackId(uri)).join(",");
        const response = await Spicetify.CosmosAsync.get(
          `https://api.spotify.com/v1/audio-features?ids=${ids}`
        );
        if (response?.audio_features) {
          clearRateLimit();
          response.audio_features.forEach((features, index) => {
            if (features) {
              const uri = smallBatch[index];
              const tempo = tempoFromAnalysis.get(uri) || features.tempo;
              const audioFeatures = {
                energy: features.energy,
                valence: features.valence,
                danceability: features.danceability,
                tempo,
                acousticness: features.acousticness,
                instrumentalness: features.instrumentalness,
                speechiness: features.speechiness,
                liveness: features.liveness
              };
              audioFeaturesCache.set(uri, audioFeatures);
              result.set(uri, audioFeatures);
            }
          });
          scheduleCachePersist();
          console.log(`[ListeningStats] Got ${response.audio_features.filter(Boolean).length} audio features from Web API`);
        }
      } catch (error) {
        if (error?.message?.includes("429") || error?.status === 429) {
          handleRateLimit(error);
        } else {
          console.warn("[ListeningStats] Web API audio features failed:", error);
        }
      }
    }
    return result;
  }
  async function fetchArtistGenresBatch(artistUris) {
    const result = /* @__PURE__ */ new Map();
    const uncachedUris = artistUris.filter((uri) => {
      if (artistGenresCache.has(uri)) {
        result.set(uri, artistGenresCache.get(uri));
        return false;
      }
      return extractArtistId(uri) !== null;
    });
    if (uncachedUris.length === 0) {
      return result;
    }
    if (await waitForApiSlot()) {
      const smallBatch = uncachedUris.slice(0, BATCH_SIZE);
      try {
        const ids = smallBatch.map((uri) => extractArtistId(uri)).join(",");
        const response = await Spicetify.CosmosAsync.get(
          `https://api.spotify.com/v1/artists?ids=${ids}`
        );
        if (response?.artists) {
          clearRateLimit();
          response.artists.forEach((artist, index) => {
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
      } catch (error) {
        if (error?.message?.includes("429") || error?.status === 429) {
          handleRateLimit(error);
        } else {
          console.warn("[ListeningStats] Artist genres fetch failed:", error);
        }
      }
    }
    return result;
  }

  // src/services/tracker.ts
  var MIN_PLAY_TIME_MS = 1e4;
  var STATS_UPDATED_EVENT = "listening-stats:updated";
  function emitStatsUpdated() {
    window.dispatchEvent(new CustomEvent(STATS_UPDATED_EVENT));
    localStorage.setItem("listening-stats:lastUpdate", Date.now().toString());
  }
  var currentTrack = null;
  var playStartTime = null;
  var accumulatedPlayTime = 0;
  var isPlaying = false;
  function extractTrackInfo() {
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
      albumReleaseDate: metadata?.album_disc_number ? void 0 : metadata?.year,
      // Year if available
      durationMs: item.duration?.milliseconds || Spicetify.Player.getDuration() || 0,
      context: data.context_uri,
      isExplicit: metadata?.is_explicit === "true" || item.isExplicit === true
    };
  }
  async function saveCurrentSession() {
    if (!currentTrack || !playStartTime) return;
    const now = Date.now();
    let totalPlayedMs = accumulatedPlayTime;
    if (isPlaying) {
      totalPlayedMs += now - playStartTime;
    }
    if (totalPlayedMs < MIN_PLAY_TIME_MS) {
      console.log("[ListeningStats] Skipped saving - played less than 10s");
      return;
    }
    const event = {
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
      // Adjust for accumulated time
      endedAt: now,
      context: currentTrack.context,
      isExplicit: currentTrack.isExplicit
      // Audio features and genres will be fetched lazily when viewing stats
    };
    try {
      await addPlayEvent(event);
      console.log(`[ListeningStats] Saved: ${currentTrack.name} - ${formatTime(totalPlayedMs)}`);
      emitStatsUpdated();
    } catch (error) {
      console.error("[ListeningStats] Failed to save play event:", error);
    }
  }
  function formatTime(ms) {
    const seconds = Math.floor(ms / 1e3);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  }
  async function handleSongChange() {
    await saveCurrentSession();
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
  function handlePlayPause() {
    const wasPlaying = isPlaying;
    isPlaying = !Spicetify.Player.data?.isPaused;
    if (!currentTrack || !playStartTime) return;
    if (wasPlaying && !isPlaying) {
      accumulatedPlayTime += Date.now() - playStartTime;
      console.log(`[ListeningStats] Paused - accumulated ${formatTime(accumulatedPlayTime)}`);
    } else if (!wasPlaying && isPlaying) {
      playStartTime = Date.now();
      console.log("[ListeningStats] Resumed playback");
    }
  }
  function initTracker() {
    console.log("[ListeningStats] Initializing tracker...");
    Spicetify.Player.addEventListener("songchange", handleSongChange);
    Spicetify.Player.addEventListener("onplaypause", handlePlayPause);
    const initialTrack = extractTrackInfo();
    if (initialTrack) {
      currentTrack = initialTrack;
      playStartTime = Date.now();
      isPlaying = !Spicetify.Player.data?.isPaused;
      console.log(`[ListeningStats] Initial track: ${initialTrack.name}`);
    }
    window.addEventListener("beforeunload", () => {
      if (currentTrack && playStartTime) {
        const totalPlayedMs = accumulatedPlayTime + (isPlaying ? Date.now() - playStartTime : 0);
        if (totalPlayedMs >= MIN_PLAY_TIME_MS) {
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
            isExplicit: currentTrack.isExplicit
          };
          localStorage.setItem("listening-stats:pendingEvent", JSON.stringify(pendingEvent));
        }
      }
    });
    console.log("[ListeningStats] Tracker initialized!");
  }
  async function recoverPendingEvents() {
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
  var enrichmentInProgress = false;
  var enrichmentCycle = "audioFeatures";
  async function runBackgroundEnrichment(force = false) {
    if (enrichmentInProgress) return;
    if (!isApiAvailable()) {
      console.log("[ListeningStats] Skipping enrichment - API rate limited");
      return;
    }
    if (!force && !Spicetify.Player.isPlaying()) {
      console.log("[ListeningStats] Skipping enrichment - not playing");
      return;
    }
    enrichmentInProgress = true;
    try {
      const events = await getEventsNeedingEnrichment(20);
      if (events.length === 0) {
        return;
      }
      console.log(`[ListeningStats] Enriching ${events.length} events (${enrichmentCycle} cycle)...`);
      let updatedCount = 0;
      if (enrichmentCycle === "audioFeatures") {
        const trackUris = [...new Set(
          events.filter((e) => !e.audioFeatures && e.trackUri.startsWith("spotify:track:")).map((e) => e.trackUri)
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
            console.warn("[ListeningStats] Audio features batch failed:", error);
          }
        }
        enrichmentCycle = "genres";
      } else {
        const artistUris = [...new Set(
          events.filter((e) => !e.genres && e.artistUri).map((e) => e.artistUri)
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
            console.warn("[ListeningStats] Artist genres batch failed:", error);
          }
        }
        enrichmentCycle = "audioFeatures";
      }
      if (updatedCount > 0) {
        console.log(`[ListeningStats] Enrichment complete: updated ${updatedCount} events`);
      }
    } catch (error) {
      console.error("[ListeningStats] Background enrichment failed:", error);
    } finally {
      enrichmentInProgress = false;
    }
  }
  var enrichmentInterval = null;
  var ENRICHMENT_INTERVAL_MS = 15 * 60 * 1e3;
  function startBackgroundEnrichment() {
    if (enrichmentInterval) return;
    enrichmentInterval = window.setInterval(() => {
      runBackgroundEnrichment();
    }, ENRICHMENT_INTERVAL_MS);
    setTimeout(runBackgroundEnrichment, 6e4);
    console.log("[ListeningStats] Background enrichment started (15 min interval)");
  }

  // src/app.tsx
  async function main() {
    console.log("[ListeningStats] Tracker extension starting...");
    await recoverPendingEvents();
    initTracker();
    startBackgroundEnrichment();
    console.log("[ListeningStats] Tracker extension loaded!");
  }
  (function init() {
    if (!Spicetify.Player || !Spicetify.Platform) {
      setTimeout(init, 100);
      return;
    }
    main();
  })();
})();
