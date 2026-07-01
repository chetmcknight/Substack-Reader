import { LibraryFeed } from '../types.ts';

const STORAGE_KEY = 'stackreader_library';
const APPS_SCRIPT_URL = '/api/sheet';

const INITIAL_PLACEHOLDERS: LibraryFeed[] = [];

const getHeaders = (contentType?: string): Record<string, string> => {
  const headers: Record<string, string> = {};
  if (contentType) {
    headers['Content-Type'] = contentType;
  }
  const customUrl = localStorage.getItem('stackreader_apps_script_url');
  if (customUrl) {
    headers['x-apps-script-url'] = customUrl;
  }
  return headers;
};

const isSyncEnabled = (): boolean => {
  const customUrl = localStorage.getItem('stackreader_apps_script_url');
  return typeof customUrl === 'string' && customUrl.trim().startsWith('https://');
};

export const dbService = {
  // Triggers remote initialization action in the background to set up column headers
  initializeSheet: async (): Promise<void> => {
    if (!isSyncEnabled()) return;
    try {
      const response = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        headers: getHeaders('application/json'),
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
    if (!isSyncEnabled()) return;
    try {
      const response = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        headers: getHeaders('application/json'),
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
    if (!isSyncEnabled()) {
      localStorage.removeItem("sheet_error_diagnostic");
      // Fallback to local storage
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
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
    }

    try {
      // Fetch from Google Sheets Apps Script with a timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const response = await fetch(APPS_SCRIPT_URL, {
        signal: controller.signal,
        headers: getHeaders()
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        const text = await response.text();

        // Diagnostic check for Google Apps Script TypeError
        if (text.includes("TypeError") || text.includes("setHeaders") || text.includes("is not a function")) {
          console.warn("Handled Apps Script response mismatch - error page detected. Diagnostic flag set.");
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
              if (item) {
                let title = "";
                let originalUrl = "";
                let image = "";
                let description = "";

                if (Array.isArray(item)) {
                  // Resilient array row parser - searches elements to find fields dynamically
                  const urls = item.map(v => String(v || '').trim()).filter(v => v.startsWith('http://') || v.startsWith('https://'));
                  
                  // Image URL is usually a URL with an image extension or keywords
                  const imageUrls = urls.filter(v => 
                    v.toLowerCase().match(/\.(jpeg|jpg|gif|png|svg|webp)/i) || 
                    v.toLowerCase().includes('logo') || 
                    v.toLowerCase().includes('avatar') || 
                    v.toLowerCase().includes('image')
                  );
                  
                  const nonImageUrls = urls.filter(v => !imageUrls.includes(v));

                  if (nonImageUrls.length > 0) {
                    originalUrl = nonImageUrls[0];
                  } else if (urls.length > 0) {
                    originalUrl = urls[0];
                  }

                  if (imageUrls.length > 0) {
                    image = imageUrls[0];
                  }

                  const nonUrlStrings = item.map(v => String(v || '').trim()).filter(v => v && !v.startsWith('http'));
                  if (nonUrlStrings.length > 0) {
                    title = nonUrlStrings[0];
                    if (nonUrlStrings.length > 1) {
                      description = nonUrlStrings[1];
                    }
                  }

                  // Standard fallbacks if column parsing didn't find them:
                  if (!title && item[0]) title = String(item[0]).trim();
                  if (!description && item[1]) description = String(item[1]).trim();
                  if (!originalUrl) {
                    originalUrl = String(item[3] || item[2] || item[0] || "").trim();
                  }
                  if (!image && item[4]) image = String(item[4]).trim();
                } else if (typeof item === 'object') {
                  // Flexible object key mapping supporting camelCase, lowercase, TitleCase, etc.
                  title = String(item.title || item.Title || item.name || item.Name || "").trim();
                  description = String(item.description || item.Description || "").trim();
                  originalUrl = String(
                    item.originalUrl || 
                    item.originalurl || 
                    item.url || 
                    item.Url || 
                    item.URL ||
                    item.feedUrl || 
                    item.feedurl || 
                    item.FeedUrl || 
                    item.OriginalUrl || 
                    ""
                  ).trim();
                  image = String(
                    item.image || 
                    item.logoUrl || 
                    item.logourl || 
                    item.logo || 
                    item.LogoUrl || 
                    item.Logo || 
                    ""
                  ).trim();

                  // Robust fallback - search all object properties for any URL
                  if (!originalUrl) {
                    for (const key of Object.keys(item)) {
                      const val = String((item as any)[key] || '').trim();
                      if (val.startsWith('http://') || val.startsWith('https://')) {
                        if (!val.toLowerCase().match(/\.(jpeg|jpg|gif|png|svg|webp)/i) && !key.toLowerCase().includes('logo')) {
                          originalUrl = val;
                          break;
                        }
                      }
                    }
                  }
                }

                if (originalUrl) {
                  const urlKey = originalUrl.toLowerCase();
                  const titleKey = title.toLowerCase();

                  // Filter out headers/placeholders
                  if (
                    urlKey === "originalurl" || 
                    urlKey === "url" || 
                    urlKey === "feedurl" || 
                    titleKey === "title" || 
                    titleKey === "title name" ||
                    urlKey.startsWith("http://originalurl") ||
                    urlKey.startsWith("https://originalurl")
                  ) {
                    continue;
                  }

                  if (!seen.has(urlKey)) {
                    seen.add(urlKey);
                    uniqueData.push({
                      title: title || "Untitled Publication",
                      originalUrl: originalUrl,
                      image: image || "",
                      description: description || "Substack publication feed.",
                      sourceType: 'SUBSTACK'
                    });
                  }
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
    if (isSyncEnabled()) {
      fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        headers: getHeaders('application/json'),
        body: JSON.stringify({
          action: 'add',
          feed: feed
        })
      }).catch(err => console.error("Error syncing feed addition to Google Sheets:", err));

      // Trigger remote deduplication and auto-setup in the background
      dbService.deduplicateSheet().catch(() => {});
    }

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
    if (isSyncEnabled()) {
      fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        headers: getHeaders('application/json'),
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
    }

    return library;
  }
};
