/**
 * IndexedDB layer (no wrapper library).
 *
 * Heavy data (audio blobs, full-size artwork) lives in its own stores and is only read
 * on demand, so loading the library at startup reads metadata alone.
 *
 * Safari quirk handled here: iOS can drop the IndexedDB connection while a Home Screen
 * app is suspended ("Connection to Indexed Database server lost"). Every operation goes
 * through `withStore`, which reopens the database and retries once on that failure.
 */

export const DB_NAME = 'pocketdeck'
export const DB_VERSION = 1

export type StoreName = 'tracks' | 'audio' | 'artThumbs' | 'artFull' | 'playlists' | 'kv'

let dbPromise: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      // v1 schema
      if (!db.objectStoreNames.contains('tracks')) {
        const tracks = db.createObjectStore('tracks', { keyPath: 'id' })
        tracks.createIndex('contentHash', 'contentHash', { unique: true })
        tracks.createIndex('addedAt', 'addedAt')
      }
      if (!db.objectStoreNames.contains('audio')) db.createObjectStore('audio', { keyPath: 'trackId' })
      if (!db.objectStoreNames.contains('artThumbs')) db.createObjectStore('artThumbs', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('artFull')) db.createObjectStore('artFull', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('playlists')) db.createObjectStore('playlists', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv', { keyPath: 'key' })
    }
    req.onsuccess = () => {
      const db = req.result
      db.onclose = () => {
        dbPromise = null
      }
      db.onversionchange = () => {
        db.close()
        dbPromise = null
      }
      resolve(db)
    }
    req.onerror = () => reject(req.error)
    req.onblocked = () => reject(new Error('Database upgrade blocked by another open window'))
  })
}

export function getDB(): Promise<IDBDatabase> {
  dbPromise ??= open().catch((e) => {
    dbPromise = null
    throw e
  })
  return dbPromise
}

function isConnectionLost(e: unknown) {
  const name = (e as DOMException)?.name
  return name === 'InvalidStateError' || name === 'UnknownError' || /connection.*lost|closing/i.test(String(e))
}

function reqP<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error ?? new DOMException('Transaction aborted', 'AbortError'))
  })
}

/** Run `fn` in a transaction over `stores`; resolves after commit. Retries once on lost connection. */
export async function withStores<R>(
  stores: StoreName[],
  mode: IDBTransactionMode,
  fn: (tx: IDBTransaction) => Promise<R> | R,
): Promise<R> {
  const attempt = async () => {
    const db = await getDB()
    const tx = db.transaction(stores, mode)
    const done = txDone(tx)
    const result = await fn(tx)
    await done
    return result
  }
  try {
    return await attempt()
  } catch (e) {
    if (!isConnectionLost(e)) throw e
    dbPromise = null
    return attempt()
  }
}

export function get<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
  return withStores([store], 'readonly', (tx) => reqP(tx.objectStore(store).get(key) as IDBRequest<T | undefined>))
}

export function getAll<T>(store: StoreName): Promise<T[]> {
  return withStores([store], 'readonly', (tx) => reqP(tx.objectStore(store).getAll() as IDBRequest<T[]>))
}

export function put<T>(store: StoreName, value: T): Promise<void> {
  return withStores([store], 'readwrite', async (tx) => {
    await reqP(tx.objectStore(store).put(value))
  })
}

export function del(store: StoreName, key: IDBValidKey): Promise<void> {
  return withStores([store], 'readwrite', async (tx) => {
    await reqP(tx.objectStore(store).delete(key))
  })
}

export function has(store: StoreName, key: IDBValidKey): Promise<boolean> {
  return withStores([store], 'readonly', async (tx) => (await reqP(tx.objectStore(store).count(key))) > 0)
}

export function clearStores(stores: StoreName[]): Promise<void> {
  return withStores(stores, 'readwrite', async (tx) => {
    await Promise.all(stores.map((s) => reqP(tx.objectStore(s).clear())))
  })
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  const row = await get<{ key: string; value: T }>('kv', key)
  return row?.value
}

export function kvSet<T>(key: string, value: T): Promise<void> {
  return put('kv', { key, value })
}
