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
      console.log(
        `[ListeningStats] Saved: ${currentTrack.name} - ${formatTime(totalPlayedMs)}`
      );
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
      console.log(
        `[ListeningStats] Now tracking: ${newTrack.name} by ${newTrack.artistName}`
      );
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
      console.log(
        `[ListeningStats] Paused - accumulated ${formatTime(accumulatedPlayTime)}`
      );
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
          localStorage.setItem(
            "listening-stats:pendingEvent",
            JSON.stringify(pendingEvent)
          );
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

  // src/app.tsx
  async function main() {
    console.log("[ListeningStats] Tracker extension starting...");
    await recoverPendingEvents();
    initTracker();
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
