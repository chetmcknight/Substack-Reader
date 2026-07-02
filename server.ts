import express from 'express';
import path from 'path';
import { GoogleGenAI, Type } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  // Initialize Gemini Client lazily to avoid crashing if key is missing
  let genAI: GoogleGenAI | null = null;
  const getGenAI = () => {
    if (!genAI) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('GEMINI_API_KEY environment variable is required');
      }
      genAI = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });
    }
    return genAI;
  };

  // Enable JSON body parsing for API requests
  app.use(express.json({ limit: '50mb' }));

  // --- API PROXY ROUTE ---
  // This allows the frontend to request feeds via the backend, 
  // bypassing browser CORS restrictions and Substack's direct blocks.
  app.get('/api/feed', async (req, res) => {
    const { f } = req.query;
    const url = f;
    console.log(`[PROXY] Received request for URL: ${url} from User-Agent: ${req.headers['user-agent']}`);
    if (!url || typeof url !== 'string' || !url.startsWith('https://')) {
      console.log(`[PROXY] Invalid URL provided`);
      return res.status(400).send('Valid HTTPS URL is required');
    }

    const fetchWithFallback = async () => {
      // Try 1: Direct fetch with browser headers
      try {
        const response = await fetch(url, {
          signal: AbortSignal.timeout(6000),
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          }
        });
        if (response.ok) return response;
      } catch (err) {
        console.warn("Server direct fetch failed:", err);
      }

      // Try 2: Fetch via corsproxy.io (which is extremely reliable and handles Cloudflare)
      try {
        const corsProxyUrl = `https://corsproxy.io/?url=${encodeURIComponent(url)}`;
        const response = await fetch(corsProxyUrl, {
          signal: AbortSignal.timeout(6000),
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          }
        });
        if (response.ok) return response;
      } catch (err) {
        console.warn("Server corsproxy fetch failed:", err);
      }

      // Try 3: Fetch via api.codetabs.com
      try {
        const codetabsUrl = `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`;
        const response = await fetch(codetabsUrl, { signal: AbortSignal.timeout(5000) });
        if (response.ok) return response;
      } catch (err) {
        console.warn("Server codetabs fetch failed:", err);
      }

      // Try 4: Fetch via api.allorigins.win
      try {
        const alloriginsUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
        const response = await fetch(alloriginsUrl, { signal: AbortSignal.timeout(5000) });
        if (response.ok) {
          const json = await response.json();
          if (json.contents) {
            return new Response(json.contents, {
              headers: { 'Content-Type': 'application/xml; charset=utf-8' }
            });
          }
        }
      } catch (err) {
        console.warn("Server allorigins fetch failed:", err);
      }

      throw new Error("All proxy attempts failed on server");
    };

    try {
      const response = await fetchWithFallback();
      const contentType = response.headers.get('content-type');
      const text = await response.text();

      res.setHeader('Content-Type', contentType || 'application/xml');
      res.send(text);
    } catch (error: any) {
      console.error('Proxy Error:', error);
      res.status(502).send('Failed to fetch resource via proxy: ' + error.message);
    }
  });

  // --- GOOGLE SHEETS PROXY ---
  // Proxies requests to Google Apps Script to bypass strict browser/mobile CORS and ITP restrictions.
  app.all('/api/sheet', async (req, res) => {
    const customUrl = req.headers['x-apps-script-url'] || req.query.apps_script_url;
    const APPS_SCRIPT_URL = (typeof customUrl === 'string' && customUrl.startsWith('https://'))
      ? customUrl 
      : process.env.APPS_SCRIPT_URL;

    if (!APPS_SCRIPT_URL) {
      return res.status(500).json({ status: 'error', message: 'Apps Script URL not configured' });
    }
    
    try {
      if (req.method === 'GET') {
        const response = await fetch(APPS_SCRIPT_URL, {
          method: 'GET',
          signal: AbortSignal.timeout(15000)
        });
        if (!response.ok) {
          const errorText = await response.text().catch(() => 'no text');
          console.error(`Apps script get failed. Status: ${response.status}. Body: ${errorText}`);
          const shortError = errorText.length > 200 ? errorText.substring(0, 200) + '...' : errorText;
          throw new Error(`Google Sheets fetch failed with status ${response.status}. Details: ${shortError}`);
        }
        const text = await response.text();
        try {
          const json = JSON.parse(text);
          return res.json(json);
        } catch {
          res.setHeader('Content-Type', 'text/plain');
          return res.send(text);
        }
      } else if (req.method === 'POST') {
        const response = await fetch(APPS_SCRIPT_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(req.body),
          signal: AbortSignal.timeout(15000)
        });
        if (!response.ok) {
          const errorText = await response.text().catch(() => 'no text');
          console.error(`Apps script post failed. Status: ${response.status}. Body: ${errorText}`);
          
          // Truncate the error text if it's too long (e.g. an HTML error page)
          const shortError = errorText.length > 200 ? errorText.substring(0, 200) + '...' : errorText;
          throw new Error(`Google Sheets post failed with status ${response.status}. Details: ${shortError}`);
        }
        const text = await response.text();
        try {
          const json = JSON.parse(text);
          return res.json(json);
        } catch {
          res.setHeader('Content-Type', 'text/plain');
          return res.send(text);
        }
      } else {
        return res.status(405).send('Method Not Allowed');
      }
    } catch (error: any) {
      console.error('Google Sheets Proxy Error:', error);
      res.status(500).json({ error: error.message || 'Internal proxy error' });
    }
  });

  // --- GEMINI ANALYSIS ROUTE ---
  app.post('/api/analyze', async (req, res) => {
    try {
      const { feedData } = req.body;
      if (!feedData) {
        return res.status(400).json({ error: 'feedData is required' });
      }

      const ai = getGenAI();
      
      const recentItems = feedData.items.slice(0, 5).map((item: any) => 
        `- Title: ${item.title}\n  Snippet: ${item.contentSnippet}`
      ).join('\n');

      const prompt = `
        Analyze the following newsletter/feed based on its title, description, and recent posts.
        
        Title: ${feedData.title}
        Description: ${feedData.description}
        
        Recent Posts:
        ${recentItems}
        
        Provide a structured analysis.
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-1.5-flash',
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: { type: Type.STRING },
              tone: { type: Type.STRING },
              audience: { type: Type.STRING },
            },
            required: ["summary", "tone", "audience"],
          }
        }
      });

      const text = response.text;
      if (!text) {
        throw new Error('Empty response from Gemini');
      }
      
      res.json(JSON.parse(text));
    } catch (error: any) {
      console.error('Gemini Analysis Error:', error);
      res.status(500).json({ error: error.message || 'Internal analysis error' });
    }
  });

  // Determine if we are in production
  const isProduction = process.env.NODE_ENV === "production" || !process.argv[1]?.endsWith('server.ts');

  // Vite middleware for development
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

startServer();
