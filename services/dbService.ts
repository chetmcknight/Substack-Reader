import { LibraryFeed } from '../types.ts';

const STORAGE_KEY = 'stackreader_library';
const SHEET_PROXY = '/api/sheet';

const getCustomUrl = (): string | null => {
  const url = localStorage.getItem('stackreader_apps_script_url');
  return url && url !== 'disabled' && url.startsWith('https://') ? url : null;
};

const isSyncEnabled = (): boolean => {
  if (getCustomUrl()) return true;
  return localStorage.getItem('stackreader_backend_sync_enabled') === 'true';
};

const fetchSheet = async (method: string, body?: unknown): Promise<Response> => {
  const customUrl = getCustomUrl();
  const headers: Record<string, string> = {};
  if (customUrl) headers['x-apps-script-url'] = customUrl;
  if (body) headers['Content-Type'] = 'application/json';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(SHEET_PROXY, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    return res;
  } finally {
    clearTimeout(timeout);
  }
};

const loadLocal = (): LibraryFeed[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is LibraryFeed =>
        item && typeof item === 'object' && typeof item.originalUrl === 'string'
    );
  } catch {
    return [];
  }
};

const saveLocal = (items: LibraryFeed[]): void => {
  const seen = new Set<string>();
  const deduped: LibraryFeed[] = [];
  for (const item of items) {
    const key = item.originalUrl.trim().toLowerCase();
    if (!key || key === 'originalurl' || key === 'url' || key === 'feedurl') continue;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(deduped));
};

const normalize = (items: LibraryFeed[]): LibraryFeed[] =>
  items.map(f => ({
    title: f.title || 'Untitled Publication',
    originalUrl: f.originalUrl,
    image: f.image || '',
    description: f.description || '',
    sourceType: 'SUBSTACK' as const,
  }));

const mergeLocalAndSheet = (local: LibraryFeed[], sheet: LibraryFeed[]): LibraryFeed[] => {
  const seen = new Set<string>();
  const merged: LibraryFeed[] = [];

  const add = (item: LibraryFeed) => {
    const key = item.originalUrl.trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    merged.push(item);
  };

  for (const item of sheet) add(item);
  for (const item of local) add(item);

  return merged;
};

export const dbService = {
  initializeSheet: async (): Promise<void> => {
    if (!isSyncEnabled()) return;
    try {
      await fetchSheet('POST', { action: 'setup' });
    } catch {
      // silent - sheet not configured
    }
  },

  deduplicateSheet: async (): Promise<void> => {
    if (!isSyncEnabled()) return;
    try {
      await fetchSheet('POST', { action: 'deduplicate' });
    } catch {
      // silent
    }
  },

  getLibrary: async (): Promise<LibraryFeed[]> => {
    const local = loadLocal();

    if (!isSyncEnabled()) {
      localStorage.removeItem('sheet_error_diagnostic');
      return local;
    }

    try {
      const res = await fetchSheet('GET');

      if (!res.ok) {
        console.warn(`[Sync] Sheet GET returned ${res.status}`);
        localStorage.setItem('sheet_error_diagnostic', 'true');
        return local;
      }

      const text = await res.text();

      if (text.includes('TypeError') || text.includes('setHeaders') || text.includes('is not a function')) {
        console.warn('[Sync] Apps Script TypeError detected');
        localStorage.setItem('sheet_error_diagnostic', 'true');
        return local;
      }
      localStorage.removeItem('sheet_error_diagnostic');

      let sheetData: LibraryFeed[] = [];
      try {
        const result = JSON.parse(text);
        if (result.status === 'success' && Array.isArray(result.data)) {
          sheetData = result.data
            .map((item: any): LibraryFeed | null => {
              try {
                if (!item) return null;
                if (Array.isArray(item)) {
                  const vals = item.map((v: any) => String(v || '').trim());
                  const urls = vals.filter(v => v.startsWith('http'));
                  const nonUrls = vals.filter(v => v && !v.startsWith('http'));
                  const sub = (s: string) => /\.(jpeg|jpg|gif|png|svg|webp)/i.test(s) || /logo|avatar|image/i.test(s);
                  const imageUrl = urls.find(u => sub(u)) || '';
                  const feedUrl = urls.find(u => !sub(u)) || urls[0] || '';
                  return {
                    title: nonUrls[0] || 'Untitled Publication',
                    originalUrl: feedUrl,
                    image: imageUrl,
                    description: nonUrls[1] || '',
                    sourceType: 'SUBSTACK',
                  };
                }
                if (typeof item === 'object') {
                  const getVal = (...keys: string[]) => {
                    for (const k of keys) {
                      const v = (item as any)[k];
                      if (v != null && v !== '') return String(v).trim();
                    }
                    return '';
                  };
                  const url = getVal('originalUrl', 'originalurl', 'url', 'Url', 'URL', 'feedUrl', 'feedurl', 'FeedUrl', 'OriginalUrl');
                  const img = getVal('image', 'logoUrl', 'logourl', 'logo', 'LogoUrl', 'Logo');
                  const fallbackUrl: string = !url
                    ? (Object.values(item as any).find((v: any) => typeof v === 'string' && v.startsWith('http') && !/\.(jpg|jpeg|png|gif|svg|webp)/i.test(v)) as string) || ''
                    : url;
                  return {
                    title: getVal('title', 'Title', 'name', 'Name') || 'Untitled Publication',
                    originalUrl: fallbackUrl,
                    image: img,
                    description: getVal('description', 'Description') || '',
                    sourceType: 'SUBSTACK',
                  };
                }
                return null;
              } catch {
                return null;
              }
            })
            .filter((f: LibraryFeed | null): f is LibraryFeed => f != null && !!f.originalUrl);
        }
      } catch {
        console.warn('[Sync] Could not parse sheet response as JSON');
      }

      if (sheetData.length === 0) return local;

      const merged = mergeLocalAndSheet(normalize(local), sheetData);
      const deduped = [...new Map(merged.map(f => [f.originalUrl.trim().toLowerCase(), f])).values()];
      saveLocal(deduped);
      return deduped;
    } catch (err) {
      console.warn('[Sync] Sheet fetch failed, using local:', err);
      return local;
    }
  },

  addToLibrary: async (feed: LibraryFeed): Promise<LibraryFeed[]> => {
    const local = loadLocal();
    const cleanUrl = feed.originalUrl.trim().toLowerCase();
    const filtered = local.filter(f => f.originalUrl.trim().toLowerCase() !== cleanUrl);
    const updated = [feed, ...filtered];
    saveLocal(updated);

    // Always attempt sync - proxy returns 500 if not configured (fast)
    fetchSheet('POST', { action: 'add', feed }).then(r => {
      if (!r.ok && r.status !== 500) console.warn('[Sync] Add failed:', r.status);
    }).catch(() => {});

    return updated;
  },

  removeFromLibrary: async (url: string): Promise<LibraryFeed[]> => {
    const cleanUrl = url.trim().toLowerCase();
    const local = loadLocal();
    const updated = local.filter(f => f.originalUrl.trim().toLowerCase() !== cleanUrl);
    saveLocal(updated);

    fetchSheet('POST', { action: 'remove', originalUrl: url, url, feedUrl: url }).then(r => {
      if (!r.ok && r.status !== 500) console.warn('[Sync] Remove failed:', r.status);
    }).catch(() => {});

    return updated;
  },
};


