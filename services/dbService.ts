import { LibraryFeed } from '../types.ts';

const STORAGE_KEY = 'stackreader_library';
const APPS_SCRIPT_URL = '/api/sheet';

const INITIAL_PLACEHOLDERS: LibraryFeed[] = [];

export const dbService = {
  // Triggers remote initialization action in the background to set up column headers
  initializeSheet: async (): Promise<void> => {
    try {
      const response = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action: 'setup' })
      });
      if (!response.ok) {
        console.error("Failed to initialize sheet headers:", response.statusText);
      }
    } catch (err) {
      console.error("Error sending setup action:", err);
    }
  },

  // Triggers remote deduplication action in the background
  deduplicateSheet: async (): Promise<void> => {
    try {
      const response = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action: 'deduplicate' })
      });
      if (!response.ok) {
        console.error("Failed to deduplicate sheet:", response.statusText);
      }
    } catch (err) {
      console.error("Error sending background deduplicate action:", err);
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
        const text = await response.text();

        // Diagnostic check for Google Apps Script TypeError
        if (text.includes("TypeError") || text.includes("setHeaders") || text.includes("is not a function")) {
          console.error("Detected Google Apps Script Type Error in response:", text);
          localStorage.setItem("sheet_error_diagnostic", "true");
        } else {
          localStorage.removeItem("sheet_error_diagnostic");
        }

        try {
          const result = JSON.parse(text);
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
                const titleKey = (item.title || "").trim().toLowerCase();
                // Skip header row indicators if they are read back as a data item
                if (urlKey === "originalurl" || urlKey === "url" || titleKey === "title") {
                  continue;
                }
                if (!seen.has(urlKey)) {
                  seen.add(urlKey);
                  uniqueData.push(item);
                }
              }
            }

            // Trigger remote deduplication in the background
            dbService.deduplicateSheet().catch(() => {});

            // Update local storage cache
            localStorage.setItem(STORAGE_KEY, JSON.stringify(uniqueData));
            return uniqueData;
          }
        } catch (parseError) {
          console.warn("Could not parse Apps Script response as JSON:", text);
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
        'Content-Type': 'application/json'
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
    // Send a single highly robust payload with all common URL parameter formats
    fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'remove',
        url: url,
        originalUrl: url,
        feedUrl: url,
        feed: {
          url: url,
          originalUrl: url,
          feedUrl: url
        }
      })
    }).catch(err => console.error("Error syncing feed removal:", err));

    // Trigger remote deduplication and auto-setup in the background
    dbService.deduplicateSheet().catch(() => {});

    return library;
  }
};
