# StackReader Pro

**StackReader Pro** is a high-performance, atmospheric, and professional-grade RSS feed reader and analyzer optimized specifically for **Substack**. Engineered with a polished, minimalist dark interface and powered by **Gemini 3.5 Flash**, it is designed to offer a distraction-free and lightning-fast reading experience with deep AI-driven feed insights.

---

## 🎨 Design Philosophy & Aesthetic

* **Cosmic Slate Theme:** Built exclusively on a high-contrast dark palette with glowing accents, deep carbon surfaces (`#050505`), and vibrant brand colors to prevent eye strain.
* **Atmospheric Visuals:** Employs dynamic backdrop blur effects, animated color transitions, and subtle noise overlays.
* **Fluid Reading Canvas:** Custom typography (Inter and Outfit) engineered specifically for long-form readability, beautiful blockquotes, and optimized vertical rhythm.

---

## 🚀 Core Features

### 1. Robust RSS Fetch & Multi-Stage Proxy Engine
* **Bypasses CORS restrictions:** Out-of-the-box support for reading remote RSS feeds securely from the client.
* **Smart Proxy Fallbacks:** Backed by an Express API gateway that gracefully cycles through three layers of fetch mechanisms:
  1. Direct, high-fidelity fetch using custom browser User-Agent headers.
  2. Failover to `corsproxy.io` for Cloudflare-protected feeds.
  3. Failover to `api.codetabs.com` proxy as a secondary resilient route.

### 2. Gemini-Powered AI Feed Analysis
* **Intelligent Synthesis:** Leverages Google's `gemini-3.5-flash` model server-side to automatically evaluate feed tone, content summaries, and target audiences based on description data and recent posts.
* **Strict Type Constraints:** Utilizes the modern `@google/genai` SDK with strict JSON schemas to guarantee bulletproof parser responses and structured metadata display.

### 3. Rich Fluid Reader
* **Embedded Media Support:** Auto-detects and beautifully embeds interactive YouTube players and Apple Podcast episodes within the distraction-free reading overlay.
* **Pre-Render Loading Overlay:** Displays an aesthetic backdrop and spinner during network requests to keep operations smooth and non-blocking.

### 4. Local Database Persistence
* **Offline-First Library:** Automatically caches subscribed feeds locally. Users can save, search, and manage a custom feed list that persists securely across browser restarts.

---

## 🛠️ Technical Stack

* **Frontend Framework:** React 19, Vite, and TypeScript.
* **Styling Engine:** Tailwind CSS with responsive design controls (`sm:`, `md:`, `lg:`, `xl:`).
* **Animations:** Framer Motion-inspired animations for entering cards and slide-in overlays.
* **Backend Runtime:** Node.js + Express.js full-stack proxy.
* **AI Engine:** Google Gen AI SDK (`@google/genai` utilizing `gemini-3.5-flash`).
* **Icons:** Lucide React icons.

---

## ⚙️ Setup & Installation

### 1. Prerequisites
Ensure you have **Node.js** (v18+) and **npm** installed on your system.

### 2. Install Dependencies
Run the following command to download and install all necessary npm modules:
```bash
npm install
```

### 3. Environment Variables
Create a `.env` file in the root directory (using `.env.example` as a template):
```env
PORT=3000
GEMINI_API_KEY=your_gemini_api_key_here
NODE_ENV=development
```

---

## 💻 Running the Application

### Development Mode
Boot the full-stack development environment utilizing live hot-reloading for both the frontend client and the Express backend:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production Build & Deployment
To bundle and optimize the application for a fast production deployment:

1. **Build Client and Compile Backend:**
   This compiles the React SPA to the `dist` directory and bundles the Express server using `esbuild` into a self-contained, high-performance CommonJS file (`dist/server.cjs`).
   ```bash
   npm run build
   ```

2. **Start Production Server:**
   Launch the highly optimized production build:
   ```bash
   npm start
   ```

---

## 📂 Project Structure

```text
├── components/          # React UI components (SearchInput, LoadingOverlay, FeedView, etc.)
├── services/            # Client-side services (RSS Fetching, Local DB, Gemini integration)
├── types.ts             # Shared TypeScript type definitions and interfaces
├── App.tsx              # Main React Application entry and view controller
├── index.html           # Root index HTML template with typography configs
├── package.json         # Package configuration, run scripts, and dependencies
├── server.ts            # Full-stack backend Express gateway & proxy server
└── tsconfig.json        # TypeScript configuration rules
```

---

## 🛡️ License
Distributed under the MIT License. Built for speed, high readability, and analytical accuracy.
