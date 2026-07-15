'use client';

/**
 * Client-side dismissal storage for the site announcement popup — IndexedDB
 * instead of localStorage, per requirements. Keyed by the announcement's
 * `version` (bumped on every admin save, see schema.sql's site_announcement
 * table), so editing the content in the Admin Dashboard automatically
 * re-shows the popup to visitors who already snoozed an older version —
 * a stale dismissal for version N never suppresses version N+1.
 *
 * Every call is wrapped so a failure (private browsing, IndexedDB disabled,
 * quota errors, etc.) degrades to "popup shows again next load" rather than
 * throwing — this is a nice-to-have UX affordance, never something worth
 * crashing the page over.
 */

const DB_NAME = 'vnsvault';
const DB_VERSION = 1;
const STORE_NAME = 'kv';
const DISMISS_KEY = 'announcement_dismissal';

interface Dismissal {
  version: number;
  /** Epoch ms — popup stays snoozed while Date.now() < until. */
  until: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Returns the stored dismissal, or null if none exists / storage failed. */
export async function getAnnouncementDismissal(): Promise<Dismissal | null> {
  try {
    const db = await openDb();
    return await new Promise<Dismissal | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(DISMISS_KEY);
      req.onsuccess = () => resolve((req.result as Dismissal | undefined) ?? null);
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    });
  } catch {
    return null;
  }
}

/** True if a still-active snooze exists for this exact announcement version. */
export function isDismissalActive(dismissal: Dismissal | null, version: number): boolean {
  return !!dismissal && dismissal.version === version && dismissal.until > Date.now();
}

/** Snooze the given announcement version for `hours` hours. */
export async function setAnnouncementDismissal(version: number, hours: number): Promise<void> {
  try {
    const db = await openDb();
    const dismissal: Dismissal = { version, until: Date.now() + hours * 60 * 60 * 1000 };
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(dismissal, DISMISS_KEY);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Non-fatal — see file header. Popup just reappears next load.
  }
}
