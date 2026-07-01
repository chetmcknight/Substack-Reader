
import { FeedData, FeedItem, FeedSourceType } from '../types.ts';

/**
 * Normalizes user input into a valid Feed URL or Profile URL.
 */
export const normalizeInputToFeedUrl = (input: string): string => {
  let cleanInput = input.trim();

  // Handle @username (Assume Substack default)
  if (cleanInput.startsWith('@')) {
    const handle = cleanInput.substring(1);
    return `https://${handle}.substack.com/feed`;
  }

  // Remove protocol
  let domainPart = cleanInput.replace(/^https?:\/\//, '');
  
  if (domainPart.endsWith('/')) {
    domainPart = domainPart.slice(0, -1);
  }

  // Handle Substack domains specifically
  if (domainPart.includes('substack.com')) {
    if (domainPart.endsWith('/feed')) {
      return `https://${domainPart}`;
    }
    if (domainPart.includes('/p/')) {
        const root = domainPart.split('/')[0];
        return `https://${root}/feed`;
    }
    const rootDomain = domainPart.split('/')[0];
    return `https://${rootDomain}/feed`;
  }

  // Fallback for custom domains
  if (!cleanInput.startsWith('http')) {
    cleanInput = `https://${cleanInput}`;
  }
  
  if (!cleanInput.endsWith('/feed') && !cleanInput.includes('?')) {
     try {
       const url = new URL(cleanInput);
       if (url.pathname === '/' || url.pathname === '') {
          return `${url.origin}/feed`;
       }
       // If it's a simple path like /username, it might be a profile, but usually we just append /feed for RSS
       if (!url.pathname.includes('.')) {
          return `${cleanInput}/feed`;
       }
     } catch (e) {
       return `${cleanInput}/feed`;
     }
  }

  return cleanInput;
};

/**
 * Fetch with timeout helper
 */
const fetchWithTimeout = async (url: string, options: RequestInit = {}, timeout = 10000): Promise<Response> => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
};

/**
 * Helper to parse raw XML string into FeedData
 */
const parseRSSXML = (xmlString: string, originalUrl: string): FeedData => {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, "text/xml");

    // Check for parse error, but do not throw immediately if we can still find channel or entry tags
    const parserError = xmlDoc.querySelector("parsererror");
    if (parserError) {
        console.warn("DOMParser encountered an XML parsing issue, but we will try our best to parse the tree anyway:", parserError.textContent);
        if (xmlString.toLowerCase().includes('404')) throw new Error("Feed not found (404).");
        if (xmlString.toLowerCase().includes('403')) throw new Error("Access blocked (403).");
    }

    const channel = xmlDoc.querySelector("channel") || xmlDoc.querySelector("feed") || xmlDoc.documentElement;
    if (!channel) {
        throw new Error("Invalid RSS/Atom feed structure: could not identify a root element.");
    }

    const title = channel.querySelector("title")?.textContent?.trim() || "Untitled Publication";
    const description = (channel.querySelector("description") || channel.querySelector("subtitle") || channel.querySelector("summary"))?.textContent?.trim() || "";
    
    let link = "";
    const linkElement = channel.querySelector("link");
    if (linkElement) {
        link = linkElement.getAttribute("href") || linkElement.textContent || originalUrl;
    } else {
        link = originalUrl;
    }
    
    let image = channel.querySelector("image > url")?.textContent || channel.querySelector("logo")?.textContent || channel.querySelector("icon")?.textContent;
    if (!image) {
       const itunesImage = channel.getElementsByTagNameNS("*", "image")[0];
       if (itunesImage) image = itunesImage.getAttribute("href") || undefined;
    }
    if (!image) {
        const imgMatch = description.match(/<img[^>]+src="([^">]+)"/);
        if (imgMatch) image = imgMatch[1];
    }

    const items: FeedItem[] = [];
    const itemElements = xmlDoc.querySelectorAll("item, entry");
    
    itemElements.forEach((item) => {
      const itemTitle = item.querySelector("title")?.textContent?.trim() || "Untitled Post";
      
      let itemLink = "";
      const itemLinkElem = item.querySelector("link");
      if (itemLinkElem) {
          itemLink = itemLinkElem.getAttribute("href") || itemLinkElem.textContent || "";
      }

      const pubDate = (item.querySelector("pubDate") || item.querySelector("published") || item.querySelector("updated"))?.textContent || "";
      
      const descriptionNode = item.querySelector("description") || item.querySelector("summary") || item.querySelector("content");
      let fullContent = "";
      const encodedContent = item.getElementsByTagName("content:encoded")[0] || 
                             item.getElementsByTagNameNS("*", "encoded")[0];
      
      if (encodedContent) {
          fullContent = encodedContent.textContent || "";
      } else if (descriptionNode) {
          fullContent = descriptionNode.textContent || "";
      }

      let contentSnippet = "";
      if (fullContent) {
        try {
          const tempDiv = document.createElement("div");
          tempDiv.innerHTML = fullContent;
          // Clean scripts and styles for safety and cleanliness
          const scripts = tempDiv.getElementsByTagName('script');
          while(scripts.length > 0) scripts[0].parentNode?.removeChild(scripts[0]);
          const styles = tempDiv.getElementsByTagName('style');
          while(styles.length > 0) styles[0].parentNode?.removeChild(styles[0]);
          
          contentSnippet = tempDiv.textContent?.replace(/\s+/g, ' ').trim().substring(0, 240) || "";
          if (contentSnippet && contentSnippet.length >= 240) {
              contentSnippet += "...";
          }
        } catch (err) {
          contentSnippet = fullContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 240) + "...";
        }
      }

      const guid = item.querySelector("guid")?.textContent || item.querySelector("id")?.textContent || itemLink;

      items.push({
        title: itemTitle,
        link: itemLink,
        pubDate,
        contentSnippet: contentSnippet || "Click to view full post content.",
        content: fullContent,
        guid,
      });
    });

    if (items.length === 0) {
        if (parserError) {
            throw new Error(`Failed to parse XML due to errors: ${parserError.textContent?.substring(0, 100)}`);
        }
        throw new Error("No feed items could be extracted from this XML.");
    }

    return {
      title,
      description,
      link,
      image,
      items,
      originalUrl,
      sourceType: 'SUBSTACK',
    };
};

/**
 * Strategy 2: RSS2JSON API
 * Good fallback if local proxy fails.
 */
const fetchWithRSS2JSON = async (originalUrl: string): Promise<FeedData> => {
    const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(originalUrl)}`;
    const response = await fetchWithTimeout(apiUrl, {}, 8000);
    
    if (!response.ok) throw new Error("RSS2JSON gateway failed");
    
    const data = await response.json();
    if (data.status !== 'ok') throw new Error("RSS2JSON failed to parse feed");

    return {
        title: data.feed.title,
        description: data.feed.description,
        link: data.feed.link,
        image: data.feed.image,
        originalUrl,
        sourceType: 'SUBSTACK',
        items: data.items.map((item: any) => ({
            title: item.title,
            link: item.link,
            pubDate: item.pubDate,
            contentSnippet: item.description 
                ? item.description.replace(/<[^>]*>/g, '').substring(0, 240) + (item.description.length > 240 ? '...' : '')
                : '',
            content: item.content || item.description, // RSS2JSON maps content:encoded to content
            guid: item.guid || item.link
        }))
    };
};

/**
 * Main Fetch Function
 */
export const fetchAndParseFeed = async (url: string): Promise<FeedData> => {
  // Strategy 1: Local Server Proxy (Best for Online/Production)
  // This uses the /api/proxy endpoint defined in server.ts
  try {
    const proxyUrl = `/api/proxy?url=${encodeURIComponent(url)}`;
    const response = await fetchWithTimeout(proxyUrl, {}, 5000);
    
    // 404 means the proxy endpoint doesn't exist (e.g. static host without backend)
    // 500 means the fetch failed server-side
    if (response.ok) {
        const xmlText = await response.text();
        if (xmlText.trim().startsWith('<')) {
            return parseRSSXML(xmlText, url);
        }
    }
  } catch (e) {
    console.warn("Local proxy fetch failed, trying external APIs...");
  }

  // Strategy 2: Client-side CORS Proxy (corsproxy.io)
  try {
    const corsProxyUrl = `https://corsproxy.io/?url=${encodeURIComponent(url)}`;
    const response = await fetchWithTimeout(corsProxyUrl, {}, 6000);
    if (response.ok) {
        const xmlText = await response.text();
        if (xmlText.trim().startsWith('<')) {
            return parseRSSXML(xmlText, url);
        }
    }
  } catch (corsErr) {
    console.warn("Client-side corsproxy.io failed, trying RSS2JSON...");
  }

  // Strategy 3: RSS2JSON (Best External API)
  try {
    return await fetchWithRSS2JSON(url);
  } catch (jsonError) {
    console.warn("RSS2JSON failed, switching to AllOrigins...");
  }

  // Strategy 4: AllOrigins (Last Resort)
  try {
      const allOriginsUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
      const response = await fetchWithTimeout(allOriginsUrl, {}, 8000);
      if (response.ok) {
          const data = await response.json();
          if (data.contents && data.contents.trim().startsWith('<')) {
              return parseRSSXML(data.contents, url);
          }
      }
  } catch (e) {
      console.error("All fetch strategies failed");
  }

  throw new Error("Unable to load feed. All connection attempts timed out or were blocked.");
};
