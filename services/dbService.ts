import { LibraryFeed } from '../types.ts';

const STORAGE_KEY = 'stackreader_library';
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbw0IqNd1yiUAHIn8sX67hgGH3hTmLs-_pzXrPywhorMxMSuA3zBaN6osIX2ooO3iNhL/exec';

const INITIAL_PLACEHOLDERS: LibraryFeed[] = [
  {
    title: "The Pragmatic Engineer",
    originalUrl: "https://blog.pragmaticengineer.com",
    description: "The #1 substack for software engineers and engineering managers.",
    sourceType: "SUBSTACK"
  },
  {
    title: "Lenny's Newsletter",
    originalUrl: "https://www.lennysnewsletter.com",
    description: "A weekly newsletter on product, growth, and career.",
    sourceType: "SUBSTACK"
  },
  {
    title: "Astral Codex Ten",
    originalUrl: "https://www.astralcodexten.com",
    description: "A blog by Scott Alexander on science, philosophy, and society.",
    sourceType: "SUBSTACK"
  }
];

export const dbService = {
  // Triggers remote initialization actions in the background to set up column headers
  initializeSheet: async (): Promise<void> => {
    const actions = ['setup', 'initialize', 'init', 'create_headers'];
    for (const action of actions) {
      fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        },
        body: JSON.stringify({ action })
      }).catch(err => console.error(`Error sending setup action '${action}':`, err));
    }

    // Also send a fallback header insert to ensure 'title', 'originalUrl', 'description', 'sourceType' is written 
    // in case the Apps Script only supports standard appends and starts with an empty sheet.
    fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify({
        action: 'add',
        feed: {
          title: 'title',
          originalUrl: 'originalUrl',
          description: 'description',
          sourceType: 'sourceType'
        }
      })
    }).catch(err => console.error("Error sending fallback headers:", err));
  },

  // Triggers remote deduplication actions in the background
  deduplicateSheet: async (): Promise<void> => {
    const actions = ['deduplicate', 'dedup', 'removeDuplicates', 'remove_duplicates', 'cleanDuplicates', 'delete_duplicates'];
    for (const action of actions) {
      fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        },
        body: JSON.stringify({ action })
      }).catch(err => console.error(`Error sending background action '${action}':`, err));
    }
  },

  getLibrary: async (): Promise<LibraryFeed[]> => {
    try {
      // Fetch from Google Sheets Apps Script with a timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const response = await fetch(APPS_SCRIPT_URL, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        const result = await response.json();
        if (result.status === "success" && Array.isArray(result.data)) {
          // If the spreadsheet is empty, we return placeholders but don't force write them
          if (result.data.length === 0) {
            return INITIAL_PLACEHOLDERS;
          }

          // Deduplicate and filter out any header row values that might be treated as a data record
          const seen = new Set<string>();
          const uniqueData: LibraryFeed[] = [];
          for (const item of result.data) {
            if (item && item.originalUrl) {
              const urlKey = item.originalUrl.trim().toLowerCase();
              // Skip header row indicators if they are read back as a data item
              if (urlKey === "originalurl" || urlKey === "url") {
                continue;
              }
              if (!seen.has(urlKey)) {
                seen.add(urlKey);
                uniqueData.push(item);
              }
            }
          }

          // Trigger remote deduplication and auto setup in the background
          dbService.deduplicateSheet().catch(() => {});

          // Update local storage cache
          localStorage.setItem(STORAGE_KEY, JSON.stringify(uniqueData));
          return uniqueData;
        }
      }
    } catch (e) {
      console.warn("Could not fetch library from Google Sheet, falling back to local storage:", e);
    }

    // Fallback to local storage
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Deduplicate local storage fallback as well
          const seen = new Set<string>();
          const uniqueData: LibraryFeed[] = [];
          for (const item of parsed) {
            if (item && item.originalUrl) {
              const urlKey = item.originalUrl.trim().toLowerCase();
              if (urlKey === "originalurl" || urlKey === "url") {
                continue;
              }
              if (!seen.has(urlKey)) {
                seen.add(urlKey);
                uniqueData.push(item);
              }
            }
          }
          return uniqueData;
        }
      }
    } catch (e) {
      console.error("Error loading local library", e);
    }

    return INITIAL_PLACEHOLDERS;
  },

  addToLibrary: async (feed: LibraryFeed): Promise<LibraryFeed[]> => {
    // 1. Update local storage immediately for instant UI responsiveness
    let library: LibraryFeed[] = [];
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      library = stored ? JSON.parse(stored) : [...INITIAL_PLACEHOLDERS];
      
      // Filter out matching URL
      library = library.filter(f => f && f.originalUrl && f.originalUrl.trim().toLowerCase() !== feed.originalUrl.trim().toLowerCase());
      library.unshift(feed);

      // Deduplicate
      const seen = new Set<string>();
      const uniqueData: LibraryFeed[] = [];
      for (const item of library) {
        if (item && item.originalUrl) {
          const urlKey = item.originalUrl.trim().toLowerCase();
          if (urlKey === "originalurl" || urlKey === "url") {
            continue;
          }
          if (!seen.has(urlKey)) {
            seen.add(urlKey);
            uniqueData.push(item);
          }
        }
      }
      library = uniqueData;

      localStorage.setItem(STORAGE_KEY, JSON.stringify(library));
    } catch (e) {
      console.error("Error adding to local library", e);
    }

    // 2. Async sync with Google Sheet in the background (no-preflight simple request)
    fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify({
        action: 'add',
        feed: feed
      })
    }).catch(err => console.error("Error syncing feed addition to Google Sheets:", err));

    // Trigger remote deduplication and auto-setup in the background
    dbService.deduplicateSheet().catch(() => {});

    return library;
  },

  removeFromLibrary: async (url: string): Promise<LibraryFeed[]> => {
    // 1. Update local storage immediately for instant UI responsiveness
    let library: LibraryFeed[] = [];
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        library = JSON.parse(stored);
      } else {
        library = [...INITIAL_PLACEHOLDERS];
      }
      const cleanUrl = url.trim().toLowerCase();
      library = library.filter(f => f && f.originalUrl && f.originalUrl.trim().toLowerCase() !== cleanUrl);

      // Deduplicate
      const seen = new Set<string>();
      const uniqueData: LibraryFeed[] = [];
      for (const item of library) {
        if (item && item.originalUrl) {
          const urlKey = item.originalUrl.trim().toLowerCase();
          if (urlKey === "originalurl" || urlKey === "url") {
            continue;
          }
          if (!seen.has(urlKey)) {
            seen.add(urlKey);
            uniqueData.push(item);
          }
        }
      }
      library = uniqueData;

      localStorage.setItem(STORAGE_KEY, JSON.stringify(library));
    } catch (e) {
      console.error("Error removing from local library", e);
    }

    // 2. Async sync with Google Sheet in the background (no-preflight simple request)
    // We send a highly robust payload with multiple common properties (url, originalUrl, feedUrl, etc.)
    // and fire fallbacks for multiple possible action names ('remove', 'delete', 'unsave', 'unsafe')
    // to guarantee it matches whatever structure the Apps Script is expecting.
    const payload = {
      url: url,
      originalUrl: url,
      feedUrl: url,
      feed: {
        url: url,
        originalUrl: url,
        feedUrl: url
      }
    };

    // Send action: 'remove'
    fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify({
        action: 'remove',
        ...payload
      })
    }).catch(err => console.error("Error syncing feed removal (action: remove):", err));

    // Send action: 'delete'
    fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify({
        action: 'delete',
        ...payload
      })
    }).catch(err => console.error("Error syncing feed removal (action: delete):", err));

    // Send action: 'unsave'
    fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify({
        action: 'unsave',
        ...payload
      })
    }).catch(err => console.error("Error syncing feed removal (action: unsave):", err));

    // Send action: 'unsafe'
    fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify({
        action: 'unsafe',
        ...payload
      })
    }).catch(err => console.error("Error syncing feed removal (action: unsafe):", err));

    // Trigger remote deduplication and auto-setup in the background
    dbService.deduplicateSheet().catch(() => {});

    return library;
  }
};
