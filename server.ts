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
  app.use(express.json());

  // --- API PROXY ROUTE ---
  // This allows the frontend to request feeds via the backend, 
  // bypassing browser CORS restrictions and Substack's direct blocks.
  app.get('/api/proxy', async (req, res) => {
    const { url } = req.query;
    if (!url || typeof url !== 'string') {
      return res.status(400).send('URL is required');
    }

    const fetchWithFallback = async () => {
      // Try 1: Direct fetch with browser headers
      try {
        const response = await fetch(url, {
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
        const response = await fetch(codetabsUrl);
        if (response.ok) return response;
      } catch (err) {
        console.warn("Server codetabs fetch failed:", err);
      }

      // Try 4: Fetch via api.allorigins.win
      try {
        const alloriginsUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
        const response = await fetch(alloriginsUrl);
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
    const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwF4gAkG3fpyIh3qvUttjeJcnZvmhOOXI_yTzx-IbqkRRDqkFafVuyU2g5FY2yjsSDu/exec';
    
    try {
      if (req.method === 'GET') {
        const response = await fetch(APPS_SCRIPT_URL);
        if (!response.ok) {
          throw new Error(`Google Sheets fetch failed with status ${response.status}`);
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
            'Content-Type': 'text/plain;charset=utf-8'
          },
          body: JSON.stringify(req.body)
        });
        if (!response.ok) {
          throw new Error(`Google Sheets post failed with status ${response.status}`);
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
        model: 'gemini-3.5-flash',
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
