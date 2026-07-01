
import React, { memo } from 'react';
import { LibraryFeed } from '../types.ts';
import { GlassCard } from './GlassCard.tsx';
import { Trash2, ArrowRight, Rss, RotateCw, RefreshCw } from 'lucide-react';

interface LibraryListProps {
  feeds: LibraryFeed[];
  onSelect: (url: string) => void;
  onRemove: (e: React.MouseEvent, url: string) => void;
  onRefresh: (url: string) => void;
  onSyncSheet?: () => Promise<void>;
  isSyncingSheet?: boolean;
}

const LibraryItem = memo(({ 
  feed, 
  onSelect, 
  onRemove,
  onRefresh
}: { 
  feed: LibraryFeed; 
  onSelect: (url: string) => void; 
  onRemove: (e: React.MouseEvent, url: string) => void;
  onRefresh: (url: string) => void;
}) => {
  
  return (
    <GlassCard 
      onClick={() => onSelect(feed.originalUrl)}
      className="group cursor-pointer hover:bg-[#1A1D24] active:scale-[0.98] transition-all duration-300 relative overflow-hidden h-full flex flex-col justify-between border-white/5 hover:border-brand-start/30 hover:shadow-glow-subtle hover:scale-[1.01] origin-center"
    >
      <div>
        {/* Icon Container */}
        <div className="w-12 h-12 rounded-xl bg-[#0B0D10] flex items-center justify-center mb-5 relative border border-white/5 group-hover:border-brand-start/20 transition-colors">
            {feed.image ? (
                <img src={feed.image} alt="" className="w-full h-full object-cover rounded-xl" />
            ) : (
                <Rss className="text-brand-end" size={20} />
            )}
        </div>

        <h3 className="text-lg font-bold text-white mb-2 leading-tight group-hover:text-brand-end transition-colors">
          {feed.title}
        </h3>
        <p className="text-sm text-textSecondary leading-relaxed line-clamp-2 mb-4 font-medium">
          {feed.description || "Substack publication feed."}
        </p>
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-white/5 mt-auto">
         <div className="flex gap-1">
            <button 
                onClick={(e) => onRemove(e, feed.originalUrl)}
                className="text-textMuted hover:text-red-500 transition-colors p-1.5 rounded-md hover:bg-white/5"
                title="Remove"
            >
                <Trash2 size={14} />
            </button>
            <button 
                onClick={(e) => { e.stopPropagation(); onRefresh(feed.originalUrl); }}
                className="text-textMuted hover:text-white transition-colors p-1.5 rounded-md hover:bg-white/5"
                title="Refresh"
            >
                <RotateCw size={14} />
            </button>
         </div>
         <span className="text-brand-end text-xs font-bold uppercase tracking-wider flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity transform translate-x-0 md:translate-x-2 md:group-hover:translate-x-0">
             Read <ArrowRight size={14} strokeWidth={2.5} />
         </span>
      </div>
    </GlassCard>
  );
});

export const LibraryList: React.FC<LibraryListProps> = ({ 
  feeds, 
  onSelect, 
  onRemove, 
  onRefresh,
  onSyncSheet,
  isSyncingSheet
}) => {
  const hasScriptError = localStorage.getItem("sheet_error_diagnostic") === "true";
  const [copied, setCopied] = React.useState(false);

  const APPS_SCRIPT_CODE = `function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var result = { status: "success", data: [] };
  
  // Ensure headers exist and remain on Row 1
  ensureHeaders(sheet);
  
  try {
    var params = {};
    if (e && e.postData && e.postData.contents) {
      params = JSON.parse(e.postData.contents);
    } else if (e && e.parameter) {
      params = e.parameter;
    }
    
    var action = params.action || "";
    
    if (action === "setup") {
      ensureHeaders(sheet);
      result.message = "Sheet headers verified on Row 1.";
    } else if (action === "add") {
      var feed = params.feed;
      if (feed && feed.originalUrl) {
        addFeed(sheet, feed);
        result.message = "Feed added successfully.";
      } else {
        result.status = "error";
        result.message = "No feed or originalUrl provided.";
      }
    } else if (action === "remove") {
      var urlToRemove = params.url || params.originalUrl || (params.feed && params.feed.originalUrl);
      if (urlToRemove) {
        removeFeed(sheet, urlToRemove);
        result.message = "Feed removed successfully.";
      } else {
        result.status = "error";
        result.message = "No URL provided for removal.";
      }
    } else if (action === "deduplicate") {
      deduplicate(sheet);
      result.message = "Deduplication completed while preserving Row 1.";
    } else {
      // Default action: read data from sheet
      result.data = getFeeds(sheet);
    }
  } catch (err) {
    result.status = "error";
    result.message = err.toString();
  }
  
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// 1. Ensure headers exist and remain on Row 1
function ensureHeaders(sheet) {
  var lastRow = sheet.getLastRow();
  var headers = ["Title", "Description", "FeedUrl", "OriginalUrl", "LogoUrl", "LastUpdated"];
  
  if (lastRow === 0) {
    sheet.appendRow(headers);
    sheet.setFrozenRows(1); // Freeze row 1 to prevent accidental sorting
  } else {
    var firstRowRange = sheet.getRange(1, 1, 1, 6);
    var firstRowValues = firstRowRange.getValues()[0];
    // If Row 1 does not contain our headers, insert a row at the top and set them
    if (firstRowValues[0] !== "Title" || firstRowValues[2] !== "FeedUrl") {
      sheet.insertRowBefore(1);
      sheet.getRange(1, 1, 1, 6).setValues([headers]);
      sheet.setFrozenRows(1);
    }
  }
}

// 2. Read feeds, strictly starting from Row 2 to protect row 1 headers
function getFeeds(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  
  var values = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
  var feeds = [];
  
  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    if (row[3]) { // originalUrl must exist
      feeds.push({
        title: row[0] || "",
        description: row[1] || "",
        feedUrl: row[2] || "",
        originalUrl: row[3] || "",
        logoUrl: row[4] || "",
        lastUpdated: row[5] || ""
      });
    }
  }
  return feeds;
}

// 3. Add a feed ensuring Row 1 headers remain untouched
function addFeed(sheet, feed) {
  ensureHeaders(sheet);
  
  var lastRow = sheet.getLastRow();
  var values = lastRow > 1 ? sheet.getRange(2, 4, lastRow - 1, 1).getValues() : [];
  var exists = false;
  var feedUrlLower = (feed.originalUrl || "").trim().toLowerCase();
  
  for (var i = 0; i < values.length; i++) {
    if (values[i][0] && values[i][0].toString().trim().toLowerCase() === feedUrlLower) {
      exists = true;
      // Update existing record (starts at index 2 to bypass row 1 headers)
      var rowNum = i + 2; 
      sheet.getRange(rowNum, 1, 1, 6).setValues([[
        feed.title || "",
        feed.description || "",
        feed.feedUrl || "",
        feed.originalUrl || "",
        feed.logoUrl || "",
        feed.lastUpdated || new Date().toISOString()
      ]]);
      break;
    }
  }
  
  if (!exists) {
    sheet.appendRow([
      feed.title || "",
      feed.description || "",
      feed.feedUrl || "",
      feed.originalUrl || "",
      feed.logoUrl || "",
      feed.lastUpdated || new Date().toISOString()
    ]);
  }
}

// 4. Remove feed strictly starting below Row 1
function removeFeed(sheet, urlToRemove) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  
  var values = sheet.getRange(2, 4, lastRow - 1, 1).getValues();
  var urlLower = urlToRemove.trim().toLowerCase();
  
  // Iterate backwards to delete rows without changing index shifts
  for (var i = values.length - 1; i >= 0; i--) {
    if (values[i][0] && values[i][0].toString().trim().toLowerCase() === urlLower) {
      sheet.deleteRow(i + 2); // Offsets index by 2 because range starts at Row 2
    }
  }
}

// 5. Deduplicate strictly starting from Row 2, keeping Row 1 headers safe
function deduplicate(sheet) {
  ensureHeaders(sheet);
  
  var lastRow = sheet.getLastRow();
  if (lastRow < 3) return; // Need at least 2 data rows to have duplicates
  
  var values = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
  var seen = {};
  var rowsToDelete = [];
  
  for (var i = 0; i < values.length; i++) {
    var originalUrl = values[i][3];
    if (originalUrl) {
      var urlKey = originalUrl.toString().trim().toLowerCase();
      if (seen[urlKey]) {
        rowsToDelete.push(i + 2);
      } else {
        seen[urlKey] = true;
      }
    }
  }
  
  // Delete from bottom up to maintain correct row offsets
  for (var j = rowsToDelete.length - 1; j >= 0; j--) {
    sheet.deleteRow(rowsToDelete[j]);
  }
}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(APPS_SCRIPT_CODE);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  if (feeds.length === 0 && !hasScriptError) return null;

  return (
    <div className="w-full max-w-5xl mx-auto pb-20 px-4 md:px-0">
      {hasScriptError && (
        <div id="gas-error-alert" className="max-w-4xl mx-auto mb-12 p-6 md:p-8 rounded-[24px] bg-[#0E0F12] border border-amber-500/20 shadow-[0_20px_40px_rgba(245,158,11,0.05)] text-left animate-in fade-in duration-500">
          <div className="flex flex-col md:flex-row items-start gap-5">
            <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
              <span className="text-amber-500 text-xl font-bold">⚠️</span>
            </div>
            <div className="space-y-4 flex-1 w-full">
              <div>
                <h4 className="font-bold text-lg text-white font-outfit tracking-tight flex items-center gap-2">
                  Google Sheets Sync Setup & Row-1 Headers Safe Code
                </h4>
                <p className="text-sm text-textSecondary mt-1 leading-relaxed">
                  We detected a Google Apps Script error in your sheet execution: <code className="text-amber-400 bg-amber-500/5 px-1.5 py-0.5 rounded font-mono text-xs">setHeaders is not a function</code>.
                </p>
              </div>
              
              <div className="bg-[#050505] p-5 rounded-xl border border-white/5 space-y-4">
                <div className="space-y-1">
                  <p className="text-xs text-textSecondary font-semibold uppercase tracking-wider text-amber-500">How to Fix This and Guarantee Row 1 Headers remain safe:</p>
                  <p className="text-xs text-textMuted leading-relaxed">
                    Google Apps Script doesn't support <code className="text-white">setHeaders()</code>. Our new secure backend proxy automatically bypasses CORS for you, so CORS headers are no longer needed. Additionally, we've optimized the Apps Script template to <strong>perfectly protect your Row 1 Column Headers</strong> from being deleted, overwritten, or affected by deduplication or cleanup.
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-textSecondary font-semibold uppercase">Copy and Use This Fixed Google Apps Script:</span>
                    <button 
                      onClick={handleCopy}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-brand-start hover:bg-brand-end text-black active:scale-[0.95] transition-all flex items-center gap-1.5"
                    >
                      <RefreshCw className={`w-3 h-3 ${copied ? 'animate-spin' : ''}`} />
                      {copied ? "Copied!" : "Copy Full Apps Script"}
                    </button>
                  </div>

                  <div className="relative">
                    <pre className="p-4 rounded-lg bg-[#0E0F12] border border-white/5 text-brand-end font-mono text-[11px] max-h-64 overflow-y-auto leading-relaxed whitespace-pre scrollbar-thin">
                      {APPS_SCRIPT_CODE}
                    </pre>
                  </div>
                </div>

                <div className="pt-2 text-xs text-textSecondary font-medium">
                  <ol className="list-decimal list-inside space-y-2">
                    <li>Open your Google Sheet, select <span className="text-white font-semibold">Extensions → Apps Script</span>.</li>
                    <li>Select all code inside <code className="text-white">Code.gs</code>, delete it, and paste the code copied above.</li>
                    <li>Click <span className="text-white font-semibold">Save (floppy disk icon)</span>.</li>
                    <li>Select <span className="text-white font-semibold">Deploy → Manage Deploys → Edit (pencil icon) → New Version → Deploy</span>.</li>
                    <li>Refresh this app page. Your Google Sheets library will sync instantly, keeping your Row 1 column headers intact!</li>
                  </ol>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {feeds.length > 0 && (
        <>
          <div className="mb-10 text-center relative flex flex-col items-center">
             <h2 className="text-2xl font-bold text-white mb-2">Your Library</h2>
             <p className="text-textSecondary mb-4">Access your saved Substack feeds instantly.</p>
             {/* Sync and clean are automated in the background */}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {feeds.map((feed) => (
              <LibraryItem 
                key={feed.originalUrl} 
                feed={feed} 
                onSelect={onSelect} 
                onRemove={onRemove}
                onRefresh={onRefresh}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
};
