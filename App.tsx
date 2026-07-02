
// Force re-scan
import React, { useState, useEffect, useCallback } from 'react';
import { SearchInput } from './components/SearchInput.tsx';
import { FeedView } from './components/FeedView.tsx';
import { LibraryList } from './components/LibraryList.tsx';
import { ArticleModal } from './components/ArticleModal.tsx';
import { LoadingOverlay } from './components/LoadingOverlay.tsx';
import { SyncSettingsModal } from './components/SyncSettingsModal.tsx';
import { normalizeInputToFeedUrl, fetchAndParseFeed } from './services/rssService.ts';
import { dbService } from './services/dbService.ts';
import { FeedData, LoadingState, LibraryFeed, FeedItem } from './types.ts';
import { AlertCircle, RefreshCcw, Settings } from 'lucide-react';

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
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [hasSyncError, setHasSyncError] = useState(false);
  
  // Enforce Dark Mode
  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  // Sync state with localStorage diagnostic
  useEffect(() => {
    const checkError = () => {
      setHasSyncError(localStorage.getItem("sheet_error_diagnostic") === "true");
    };
    checkError();
    window.addEventListener('storage', checkError);
    return () => window.removeEventListener('storage', checkError);
  }, []);

  // Load library on mount and perform automated Sync & Clean-up
  useEffect(() => {
    const autoSyncAndClean = async () => {
      try {
        setIsSyncingSheet(true);
        // 1. Fetch latest fully synchronized and deduplicated library FIRST to render UI instantly
        const freshLibrary = await dbService.getLibrary();
        setLibrary(freshLibrary);

        // 2. Run initialization and deduplication sequentially in the background without blocking the mount
        const runBackgroundSetup = async () => {
          try {
            await dbService.initializeSheet();
            await dbService.deduplicateSheet();
          } catch (e) {
            console.error("Background sheet initialization/deduplication failed:", e);
          }
        };
        runBackgroundSetup();
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
      
      setLibrary(prev => {
          const inLibrary = prev.some(l => l.originalUrl === url);
          if (inLibrary) {
              const libEntry: LibraryFeed = {
                  title: data.title,
                  originalUrl: data.originalUrl,
                  image: data.image,
                  description: data.description,
                  sourceType: data.sourceType
              };
              const filtered = prev.filter(l => l.originalUrl !== url);
              return [libEntry, ...filtered];
          }
          return prev;
      });

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
  }, [activeFeeds]);

  const handleSearch = useCallback((input: string) => {
    if (!input.trim()) return;
    const url = normalizeInputToFeedUrl(input);
    addFeedToView(url);
  }, [addFeedToView]);

  const toggleLibrarySave = useCallback(async (feed: FeedData) => {
    let exists = false;
    let oldLibrary: LibraryFeed[] = [];
    
    setLibrary(prev => {
      oldLibrary = prev;
      exists = prev.some(item => item.originalUrl === feed.originalUrl);
      
      if (exists) {
        return prev.filter(item => item.originalUrl !== feed.originalUrl);
      } else {
        const newFeed: LibraryFeed = {
          title: feed.title,
          originalUrl: feed.originalUrl,
          image: feed.image,
          description: feed.description,
          sourceType: feed.sourceType
        };
        return [newFeed, ...prev];
      }
    });

    try {
      if (exists) {
        await dbService.removeFromLibrary(feed.originalUrl);
      } else {
        const newFeed: LibraryFeed = {
          title: feed.title,
          originalUrl: feed.originalUrl,
          image: feed.image,
          description: feed.description,
          sourceType: feed.sourceType
        };
        await dbService.addToLibrary(newFeed);
      }
    } catch (e) {
      console.error("Failed to update library", e);
      setLibrary(oldLibrary);
    }
  }, []);

  const removeFromLibrary = useCallback(async (e: React.MouseEvent, url: string) => {
    e.stopPropagation();
    
    let oldLibrary: LibraryFeed[] = [];
    setLibrary(prev => {
      oldLibrary = prev;
      return prev.filter(item => item.originalUrl !== url);
    });
    
    try {
      await dbService.removeFromLibrary(url);
    } catch (err) {
      console.error("Failed to remove from library", err);
      setLibrary(oldLibrary);
    }
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

  const handleSaveSyncSettings = useCallback(async () => {
    setIsSyncingSheet(true);
    try {
      const freshLibrary = await dbService.getLibrary();
      setLibrary(freshLibrary);
    } catch (e) {
      console.error("Error refreshing library after settings change:", e);
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

      <SyncSettingsModal 
        isOpen={showSyncModal}
        onClose={() => setShowSyncModal(false)}
        onSave={handleSaveSyncSettings}
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

        {/* Google Sheets Sync Error Banner */}
        {hasSyncError && (
          <div className="w-full max-w-4xl mx-auto mb-12 p-6 md:p-8 rounded-[24px] bg-[#0E0F12] border border-amber-500/20 shadow-[0_20px_40px_rgba(245,158,11,0.05)] text-left animate-in fade-in duration-500 relative z-20">
            <div className="flex flex-col md:flex-row items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                <AlertCircle className="text-amber-500" size={24} />
              </div>
              <div className="space-y-3 flex-1">
                <h3 className="text-lg font-bold text-white font-outfit tracking-tight">Google Sheets Sync Conflict Detected</h3>
                <p className="text-sm text-textSecondary leading-relaxed">
                  The Google Apps Script deployed in your Google Sheet is throwing a <code className="text-amber-400 font-mono bg-white/5 px-1 py-0.5 rounded">TypeError: setHeaders is not a function</code> on Google's servers. 
                  Because our proxy handles CORS automatically, you don't need any custom headers in your script.
                </p>
                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <button
                    onClick={() => setShowSyncModal(true)}
                    className="px-4 py-2 bg-amber-500 text-black font-bold text-xs rounded-xl hover:bg-amber-400 transition-colors active:scale-95 cursor-pointer flex items-center gap-1.5"
                  >
                    <Settings size={13} />
                    View & Copy Fixed Code
                  </button>
                  <button
                    onClick={() => {
                      localStorage.removeItem("sheet_error_diagnostic");
                      setHasSyncError(false);
                    }}
                    className="px-4 py-2 bg-white/5 text-textSecondary hover:text-white font-bold text-xs rounded-xl hover:bg-white/10 transition-colors active:scale-95 cursor-pointer"
                  >
                    Dismiss Warning
                  </button>
                </div>
              </div>
            </div>
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
      </div>

      <div className="text-center mt-20 text-textMuted text-sm pb-8 font-medium flex flex-col items-center gap-3">
        <p>© 2026 StackReader Pro • Built for Speed</p>
        <button 
          onClick={() => setShowSyncModal(true)}
          className="text-textSecondary hover:text-brand-end transition-colors text-xs flex items-center gap-1.5 bg-white/5 hover:bg-white/10 px-3.5 py-2 rounded-full border border-white/5 hover:border-brand-end/20 cursor-pointer active:scale-95 transition-all font-semibold shadow-sm"
        >
          <Settings size={13} />
          Google Sheets Sync Settings
        </button>
      </div>
    </div>
  );
};

export default App;
