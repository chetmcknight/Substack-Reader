
import React, { useState, useEffect, useCallback, memo } from 'react';
import { SearchInput } from './components/SearchInput.tsx';
import { FeedView } from './components/FeedView.tsx';
import { LibraryList } from './components/LibraryList.tsx';
import { ArticleModal } from './components/ArticleModal.tsx';
import { LoadingOverlay } from './components/LoadingOverlay.tsx';
import { normalizeInputToFeedUrl, fetchAndParseFeed } from './services/rssService.ts';
import { dbService } from './services/dbService.ts';
import { FeedData, LoadingState, LibraryFeed, FeedItem } from './types.ts';
import { AlertCircle, RefreshCcw, Check, Copy, ChevronDown, ChevronUp, FileSpreadsheet, Terminal, Database } from 'lucide-react';

const APPS_SCRIPT_CODE = `function doGet(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = [];
  if (sheet.getLastRow() > 0) {
    var rows = sheet.getDataRange().getValues();
    var headers = rows[0];
    for (var i = 1; i < rows.length; i++) {
      var row = rows[i];
      var record = {};
      for (var j = 0; j < headers.length; j++) {
        var key = headers[j] ? headers[j].toString().trim() : "col_" + j;
        record[key] = row[j];
      }
      data.push(record);
    }
  }
  return ContentService.createTextOutput(JSON.stringify({ status: "success", data: data }))
    .setMimeType(ContentService.MimeType.JSON)
    .setHeaders({
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
    });
}

function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  ensureHeaders(sheet);
  var payload;
  try {
    payload = JSON.parse(e.postData.contents);
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Invalid JSON" }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  var action = payload.action;
  
  if (action === "add" && payload.feed) {
    var feed = payload.feed;
    removeFeedByUrl(sheet, feed.originalUrl);
    sheet.appendRow([feed.title, feed.originalUrl, feed.description, feed.sourceType]);
    deduplicateSheet(sheet);
    return ContentService.createTextOutput(JSON.stringify({ status: "success", message: "Added & Cleaned" }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  if (action === "remove" || action === "delete" || action === "unsave" || action === "unsafe") {
    var url = payload.originalUrl || payload.url || payload.feedUrl;
    if (url) removeFeedByUrl(sheet, url);
    return ContentService.createTextOutput(JSON.stringify({ status: "success", message: "Removed" }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  if (action === "deduplicate" || action === "dedup" || action === "remove_duplicates") {
    deduplicateSheet(sheet);
    return ContentService.createTextOutput(JSON.stringify({ status: "success", message: "Deduplicated" }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  if (action === "initialize" || action === "init" || action === "setup") {
    ensureHeaders(sheet);
    return ContentService.createTextOutput(JSON.stringify({ status: "success", message: "Headers Initialized" }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Unsupported Action" }))
    .setMimeType(ContentService.MimeType.JSON);
}

function ensureHeaders(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(["title", "originalUrl", "description", "sourceType"]);
  } else {
    var firstRow = sheet.getRange(1, 1, 1, 4).getValues()[0];
    if (firstRow[0] !== "title" || firstRow[1] !== "originalUrl") {
      sheet.insertRowBefore(1);
      sheet.getRange(1, 1, 1, 4).setValues([["title", "originalUrl", "description", "sourceType"]]);
    }
  }
}

function removeFeedByUrl(sheet, url) {
  if (!url) return;
  url = url.toString().trim().toLowerCase();
  var rows = sheet.getDataRange().getValues();
  for (var i = rows.length - 1; i >= 1; i--) {
    var rowUrl = rows[i][1] ? rows[i][1].toString().trim().toLowerCase() : "";
    if (rowUrl === url) {
      sheet.deleteRow(i + 1);
    }
  }
}

function deduplicateSheet(sheet) {
  var rows = sheet.getDataRange().getValues();
  if (rows.length <= 2) return;
  var seen = {};
  var rowsToDelete = [];
  for (var i = 1; i < rows.length; i++) {
    var url = rows[i][1] ? rows[i][1].toString().trim().toLowerCase() : "";
    if (url) {
      if (seen[url]) {
        rowsToDelete.push(i + 1);
      } else {
        seen[url] = true;
      }
    }
  }
  for (var j = rowsToDelete.length - 1; j >= 0; j--) {
    sheet.deleteRow(rowsToDelete[j]);
  }
}`;

const App: React.FC = () => {
  const [loadingState, setLoadingState] = useState<LoadingState>(LoadingState.IDLE);
  const [activeFeeds, setActiveFeeds] = useState<FeedData[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastAttemptedUrl, setLastAttemptedUrl] = useState<string | null>(null);
  const [library, setLibrary] = useState<LibraryFeed[]>(() => {
    try {
      const stored = localStorage.getItem('stackreader_library');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          return parsed.filter(item => item && typeof item === 'object' && typeof item.originalUrl === 'string');
        }
      }
      return [];
    } catch {
      return [];
    }
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [readingItem, setReadingItem] = useState<FeedItem | null>(null);
  const [isSyncingSheet, setIsSyncingSheet] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [copied, setCopied] = useState(false);
  
  // Enforce Dark Mode
  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  // Load library on mount and perform automated Sync & Clean-up
  useEffect(() => {
    const autoSyncAndClean = async () => {
      try {
        setIsSyncingSheet(true);
        // 1. Initialize sheet headers if they are missing or corrupt
        await dbService.initializeSheet();
        // 2. Clear any pre-existing duplicate rows in the sheet
        await dbService.deduplicateSheet();
        // 3. Fetch latest fully synchronized and deduplicated library
        const freshLibrary = await dbService.getLibrary();
        setLibrary(freshLibrary);
      } catch (e) {
        console.error("Auto Sync & Clean-up failed on mount:", e);
      } finally {
        setIsSyncingSheet(false);
      }
    };

    autoSyncAndClean();

    // Set up a background periodic Sync & Clean-up every 45 seconds to keep sheet perfectly synchronized and clean
    const intervalId = setInterval(async () => {
      try {
        console.log("Running periodic background Sync & Clean-up...");
        await dbService.deduplicateSheet();
        const freshLibrary = await dbService.getLibrary();
        setLibrary(freshLibrary);
      } catch (e) {
        console.error("Background periodic Sync & Clean-up failed:", e);
      }
    }, 45000);

    return () => clearInterval(intervalId);
  }, []);

  const copyScriptToClipboard = () => {
    navigator.clipboard.writeText(APPS_SCRIPT_CODE);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const addFeedToView = useCallback(async (url: string, forceRefresh = false) => {
    const existing = activeFeeds.find(f => f.originalUrl === url);
    if (existing && !forceRefresh) {
       // Smooth scroll to top where the active feeds are displayed
       window.scrollTo({ top: 0, behavior: 'smooth' });
       return;
    }

    setLoadingState(LoadingState.LOADING);
    setErrorMsg(null);
    setLastAttemptedUrl(url);

    try {
      const data = await fetchAndParseFeed(url);
      
      setActiveFeeds(prev => {
        if (prev.some(f => f.originalUrl === data.originalUrl)) {
             return prev.map(f => f.originalUrl === data.originalUrl ? data : f);
        }
        return [data, ...prev]; 
      });
      
      const inLibrary = library.some(l => l.originalUrl === url);
      if (inLibrary) {
          const libEntry: LibraryFeed = {
              title: data.title,
              originalUrl: data.originalUrl,
              image: data.image,
              description: data.description,
              sourceType: data.sourceType
          };
          await dbService.addToLibrary(libEntry);
          setLibrary(prev => {
              const filtered = prev.filter(l => l.originalUrl !== url);
              return [libEntry, ...filtered];
          });
      }

      setLoadingState(LoadingState.SUCCESS);
      setSearchQuery('');
      
      // Smooth scroll to top to see the newly loaded feed
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 100);
    } catch (err) {
      console.error("Feed Load Failed:", err);
      const message = err instanceof Error ? err.message : "An unexpected error occurred.";
      setErrorMsg(message);
      setLoadingState(LoadingState.ERROR);
    }
  }, [activeFeeds, library]);

  const handleSearch = useCallback((input: string) => {
    if (!input.trim()) return;
    const url = normalizeInputToFeedUrl(input);
    addFeedToView(url);
  }, [addFeedToView]);

  const toggleLibrarySave = useCallback(async (feed: FeedData) => {
    try {
      const exists = library.some(item => item.originalUrl === feed.originalUrl);
      
      if (exists) {
        setLibrary(prev => prev.filter(item => item.originalUrl !== feed.originalUrl));
        await dbService.removeFromLibrary(feed.originalUrl);
      } else {
        const newFeed: LibraryFeed = {
          title: feed.title,
          originalUrl: feed.originalUrl,
          image: feed.image,
          description: feed.description,
          sourceType: feed.sourceType
        };
        setLibrary(prev => [newFeed, ...prev]);
        await dbService.addToLibrary(newFeed);
      }
    } catch (e) {
      console.error("Failed to update library", e);
    }
  }, [library]);

  const removeFromLibrary = useCallback(async (e: React.MouseEvent, url: string) => {
    e.stopPropagation();
    
    setLibrary(prev => prev.filter(item => item.originalUrl !== url));
    await dbService.removeFromLibrary(url);
  }, []);

  const handleSyncSheet = useCallback(async () => {
    setIsSyncingSheet(true);
    try {
      await dbService.deduplicateSheet();
      await new Promise(resolve => setTimeout(resolve, 1500));
      const freshLibrary = await dbService.getLibrary();
      setLibrary(freshLibrary);
    } catch (e) {
      console.error("Error synchronizing with Google Sheets:", e);
    } finally {
      setIsSyncingSheet(false);
    }
  }, []);

  const closeFeed = useCallback((url: string) => {
    setActiveFeeds(prev => prev.filter(f => f.originalUrl !== url));
  }, []);

  return (
    <div className="relative min-h-screen selection:bg-[#ff3152]/30 bg-[#050505] overflow-hidden pb-20 px-4 pt-12 md:pt-24 font-sans text-textPrimary">
      
      {/* Immersive Background Effects */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        {/* Top Glow */}
        <div className="absolute top-[-25%] left-[10%] w-[80%] h-[50%] rounded-full bg-[#FF3B5C]/15 blur-[150px] animate-pulse duration-[8000ms]"></div>
        {/* Accent Blobs */}
        <div className="absolute top-[15%] right-[-5%] w-[35%] h-[45%] rounded-full bg-[#FF8A3D]/10 blur-[120px]"></div>
        <div className="absolute bottom-[-15%] left-[-5%] w-[45%] h-[55%] rounded-full bg-indigo-500/10 blur-[130px]"></div>
        {/* Texture Overlay */}
        <div className="absolute inset-0 bg-[url('https://tailwindcss.com/_next/static/media/grain.87162d55.svg')] opacity-[0.06] mix-blend-overlay"></div>
        {/* Radial Dark Mask */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,transparent_0%,#050505_95%)]"></div>
      </div>

      {/* Loading Overlay */}
      {loadingState === LoadingState.LOADING && <LoadingOverlay />}

      <ArticleModal 
        item={readingItem}
        onClose={() => setReadingItem(null)}
      />

      <div className="relative z-10 max-w-7xl mx-auto flex flex-col items-center">
        
        {/* App Title */}
        <div className="text-center mb-16 space-y-4 relative z-10 max-w-4xl px-2">
            <h1 className="text-5xl md:text-8xl font-bold text-white font-outfit leading-none tracking-tighter drop-shadow-2xl animate-in fade-in zoom-in-95 duration-700 pr-6 inline-block">
            StackReader <span className="inline-block text-transparent bg-clip-text bg-gradient-to-r from-brand-start to-brand-end pr-2">Pro</span>
            </h1>
            <p className="text-textSecondary text-lg md:text-2xl font-normal leading-relaxed max-w-2xl mx-auto opacity-80">
            Professional-grade feeds for<br className="hidden md:block" />
            your favorite Substacks, instantly.
            </p>
        </div>

        <SearchInput 
            onSearch={handleSearch} 
            isLoading={loadingState === LoadingState.LOADING} 
            value={searchQuery}
            onChange={setSearchQuery}
            showExamples={activeFeeds.length === 0 && loadingState !== LoadingState.LOADING}
        />
        
        {loadingState === LoadingState.ERROR && (
            <div className="max-w-md w-full mx-auto mb-12 p-8 rounded-[32px] bg-[#050505] border border-red-500/20 shadow-[0_20px_50px_rgba(255,0,0,0.1)] backdrop-blur-xl animate-in fade-in zoom-in-95 duration-300">
                <div className="flex flex-col items-center text-center gap-6">
                    <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                        <AlertCircle className="text-red-500" size={32} />
                    </div>
                    <div className="space-y-2">
                        <h4 className="font-bold text-xl text-white font-outfit tracking-tight">Fetch Encountered an Issue</h4>
                        <p className="text-textSecondary leading-relaxed text-sm max-w-[280px] mx-auto">
                            {errorMsg}
                        </p>
                    </div>
                    <button 
                        onClick={() => lastAttemptedUrl && addFeedToView(lastAttemptedUrl, true)}
                        className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded-2xl text-white text-sm font-bold transition-all active:scale-95 group"
                    >
                        <RefreshCcw size={16} className="group-hover:rotate-180 transition-transform duration-500" />
                        Attempt Reconnection
                    </button>
                </div>
            </div>
        )}

        {/* Active Feeds Section */}
        {activeFeeds.length > 0 && (
            <div className="mb-20 w-full max-w-4xl mx-auto animate-in slide-in-from-bottom-8 duration-700">
            {activeFeeds.map(feed => (
                <FeedView 
                key={feed.originalUrl}
                data={feed}
                isSaved={library.some(lib => lib.originalUrl === feed.originalUrl)}
                onToggleSave={() => toggleLibrarySave(feed)}
                onRefresh={() => addFeedToView(feed.originalUrl, true)}
                onClose={() => closeFeed(feed.originalUrl)}
                onItemSelect={setReadingItem}
                />
            ))}
            </div>
        )}

        {/* Library Section */}
        <LibraryList 
            feeds={library} 
            onSelect={(url) => addFeedToView(url)} 
            onRemove={removeFromLibrary}
            onRefresh={(url) => addFeedToView(url, true)}
            onSyncSheet={handleSyncSheet}
            isSyncingSheet={isSyncingSheet}
        />

        {/* Google Sheet Integration Status & Setup Guide */}
        <div className="w-full max-w-4xl mx-auto mt-12 bg-[#0a0a0a]/60 backdrop-blur-xl border border-white/5 rounded-[32px] p-6 md:p-8 shadow-[0_20px_50px_rgba(0,0,0,0.4)] relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-brand-end/10 rounded-full blur-3xl pointer-events-none"></div>
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 pb-6 mb-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-brand-end/10 border border-brand-end/20 flex items-center justify-center shrink-0">
                <FileSpreadsheet className="text-brand-end" size={24} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-lg text-white font-outfit tracking-tight">Cloud Sheet Synchronization</h3>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-500/10 border border-green-500/20 text-green-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>
                    AUTOMATED ACTIVE
                  </span>
                </div>
                <p className="text-textSecondary text-xs mt-1 leading-relaxed">
                  Your reading library in the browser is fully synced and cleaned in real-time. Background sync completes every 45 seconds.
                </p>
              </div>
            </div>
            
            <button
              onClick={() => setShowSetup(prev => !prev)}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white text-xs font-bold transition-all active:scale-95 cursor-pointer"
            >
              <Database size={14} />
              {showSetup ? "Hide Apps Script Setup" : "Verify Apps Script setup"}
              {showSetup ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs leading-relaxed">
            <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4">
              <span className="font-bold text-white block mb-1">Column Header Safety</span>
              <p className="text-textSecondary">
                Auto-initializes essential header columns (<code className="text-[#ff3152]">title</code>, <code className="text-[#ff3152]">originalUrl</code>, etc.) on start. This ensures rows are correctly read and displayed.
              </p>
            </div>
            <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4">
              <span className="font-bold text-white block mb-1">Zero-Duplicate Guarantee</span>
              <p className="text-textSecondary">
                Detects pre-existing or concurrent duplicate additions inside the sheet and purges duplicate rows automatically while preserving the original feed entry.
              </p>
            </div>
          </div>

          {showSetup && (
            <div className="mt-6 pt-6 border-t border-white/5 space-y-6 animate-in slide-in-from-top-4 duration-300">
              <div className="space-y-2 text-xs text-textSecondary text-left">
                <span className="font-bold text-white text-sm block">How to Install / Update Google Sheet Apps Script:</span>
                <ol className="list-decimal list-inside space-y-2 leading-relaxed">
                  <li>Open your connected <span className="text-white font-medium">Google Spreadsheet</span>.</li>
                  <li>Go to <span className="text-white font-medium">Extensions</span> → <span className="text-white font-medium">Apps Script</span>.</li>
                  <li>Delete any existing code in the editor, and paste the code snippet below.</li>
                  <li>Click <span className="text-white font-medium">Deploy</span> → <span className="text-white font-medium">New Deployment</span> → Select type: <span className="text-white font-medium">Web App</span>.</li>
                  <li>Set Access to: <span className="text-white font-medium">"Anyone"</span> (this is mandatory) and click <span className="text-white font-medium">Deploy</span>.</li>
                </ol>
              </div>

              <div className="space-y-2 text-left">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-white font-semibold flex items-center gap-1.5">
                    <Terminal size={14} className="text-brand-end" /> Code.gs (Recommended Implementation)
                  </span>
                  <button
                    onClick={copyScriptToClipboard}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-end/10 hover:bg-brand-end/20 text-brand-end rounded-lg transition-all active:scale-95 text-xs font-bold cursor-pointer"
                  >
                    {copied ? <Check size={12} /> : <Copy size={12} />}
                    {copied ? "Copied!" : "Copy Code"}
                  </button>
                </div>
                <div className="relative rounded-xl overflow-hidden border border-white/5 bg-[#030303]">
                  <pre className="p-4 overflow-x-auto text-[11px] font-mono text-gray-300 max-h-72 leading-relaxed selection:bg-white/20 select-text">
                    {APPS_SCRIPT_CODE}
                  </pre>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="text-center mt-20 text-textMuted text-sm pb-8 font-medium">
        <p>© 2026 StackReader Pro • Built for Speed</p>
      </div>
    </div>
  );
};

export default App;
