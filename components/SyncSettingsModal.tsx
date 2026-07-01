import React, { useState } from 'react';
import { Settings, Copy, Check, Info, ArrowRight, RotateCw, Trash2, HelpCircle } from 'lucide-react';

interface SyncSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (url: string) => void;
}

export const SyncSettingsModal: React.FC<SyncSettingsModalProps> = ({ isOpen, onClose, onSave }) => {
  const [customUrl, setCustomUrl] = useState(() => {
    return localStorage.getItem('stackreader_apps_script_url') || '';
  });
  const [copied, setCopied] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const APPS_SCRIPT_CODE = `function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var result = { status: "success", data: [] };
  
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
      result.data = getFeeds(sheet);
    }
  } catch (err) {
    result.status = "error";
    result.message = err.toString();
  }
  
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function ensureHeaders(sheet) {
  var lastRow = sheet.getLastRow();
  var headers = ["Title", "Description", "FeedUrl", "OriginalUrl", "LogoUrl", "LastUpdated"];
  
  if (lastRow === 0) {
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
  } else {
    var firstRowRange = sheet.getRange(1, 1, 1, 6);
    var firstRowValues = firstRowRange.getValues()[0];
    if (firstRowValues[0] !== "Title" || firstRowValues[2] !== "FeedUrl") {
      sheet.insertRowBefore(1);
      sheet.getRange(1, 1, 1, 6).setValues([headers]);
      sheet.setFrozenRows(1);
    }
  }
}

function getFeeds(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  
  var values = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
  var feeds = [];
  
  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    if (row[3]) {
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

function addFeed(sheet, feed) {
  ensureHeaders(sheet);
  
  var lastRow = sheet.getLastRow();
  var values = lastRow > 1 ? sheet.getRange(2, 4, lastRow - 1, 1).getValues() : [];
  var exists = false;
  var feedUrlLower = (feed.originalUrl || "").trim().toLowerCase();
  
  for (var i = 0; i < values.length; i++) {
    if (values[i][0] && values[i][0].toString().trim().toLowerCase() === feedUrlLower) {
      exists = true;
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

function removeFeed(sheet, urlToRemove) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  
  var values = sheet.getRange(2, 4, lastRow - 1, 1).getValues();
  var urlLower = urlToRemove.trim().toLowerCase();
  
  for (var i = values.length - 1; i >= 0; i--) {
    if (values[i][0] && values[i][0].toString().trim().toLowerCase() === urlLower) {
      sheet.deleteRow(i + 2);
    }
  }
}

function deduplicate(sheet) {
  ensureHeaders(sheet);
  
  var lastRow = sheet.getLastRow();
  if (lastRow < 3) return;
  
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
  
  for (var j = rowsToDelete.length - 1; j >= 0; j--) {
    sheet.deleteRow(rowsToDelete[j]);
  }
}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(APPS_SCRIPT_CODE);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUrl = customUrl.trim();
    if (cleanUrl) {
      localStorage.setItem('stackreader_apps_script_url', cleanUrl);
    } else {
      localStorage.removeItem('stackreader_apps_script_url');
    }
    onSave(cleanUrl);
    setSaveSuccess(true);
    setTimeout(() => {
      setSaveSuccess(false);
      onClose();
    }, 1500);
  };

  const handleReset = () => {
    localStorage.removeItem('stackreader_apps_script_url');
    setCustomUrl('');
    onSave('');
    setSaveSuccess(true);
    setTimeout(() => {
      setSaveSuccess(false);
      onClose();
    }, 1500);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-[#020202]/85 backdrop-blur-md transition-opacity"
        onClick={onClose}
      />

      {/* Modal Container */}
      <div className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-[24px] bg-[#0E0F12] border border-white/5 shadow-2xl p-6 md:p-8 animate-in fade-in zoom-in-95 duration-200 text-left scrollbar-thin">
        
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-brand-end/10 border border-brand-end/20 flex items-center justify-center">
            <Settings className="text-brand-end" size={20} />
          </div>
          <div>
            <h3 className="text-xl font-bold text-white font-outfit tracking-tight">Google Sheets Sync Configuration</h3>
            <p className="text-xs text-textSecondary mt-0.5">Customize or fix your remote spreadsheet integration.</p>
          </div>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSave} className="space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-bold text-white uppercase tracking-wider block">
              Google Apps Script Web App URL
            </label>
            <div className="relative">
              <input 
                type="url"
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                placeholder="https://script.google.com/macros/s/.../exec (Default active)"
                className="w-full bg-black/40 border border-white/5 focus:border-brand-end/50 rounded-xl px-4 py-3 text-sm text-white placeholder-textMuted outline-none transition-all font-mono"
              />
            </div>
            <p className="text-[11px] text-textMuted leading-normal">
              If you deployed a custom version of the Apps Script, paste the Web App URL here. Leave empty to use the robust pre-configured system URL.
            </p>
          </div>

          {/* Apps Script Guide & Fix */}
          <div className="p-5 rounded-xl bg-[#050505] border border-white/5 space-y-4">
            <div className="flex items-start gap-3">
              <Info className="text-brand-end shrink-0 mt-0.5" size={16} />
              <div className="space-y-1">
                <h4 className="text-xs font-bold text-white uppercase tracking-wide">How to resolve Google Sheet sync errors:</h4>
                <p className="text-xs text-textSecondary leading-relaxed">
                  We identified that older versions of the Google Apps Script project contain a faulty <code className="text-white font-mono bg-white/5 px-1 py-0.5 rounded">.setHeaders()</code> call which crashes on Google's servers with a <code className="text-amber-400 font-mono">TypeError</code>. 
                  Because our application's proxy server bypasses CORS completely, you do not need any CORS headers. Updating your Apps Script to the fixed code below will restore syncing instantly!
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-brand-end font-bold uppercase tracking-wider">Fixed Google Apps Script Template:</span>
                <button 
                  type="button"
                  onClick={handleCopy}
                  className="text-xs font-bold px-3 py-1.5 rounded-lg bg-brand-end/10 hover:bg-brand-end/20 border border-brand-end/30 text-brand-end active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                  {copied ? "Copied!" : "Copy Clean Script"}
                </button>
              </div>

              <div className="relative">
                <pre className="p-4 rounded-lg bg-[#0E0F12] border border-white/5 text-textSecondary font-mono text-[10px] max-h-48 overflow-y-auto leading-relaxed whitespace-pre scrollbar-thin">
                  {APPS_SCRIPT_CODE}
                </pre>
              </div>
            </div>

            <div className="pt-1 text-[11px] text-textSecondary font-medium">
              <ol className="list-decimal list-inside space-y-1.5">
                <li>Open your Google Sheet, choose <span className="text-white font-semibold">Extensions → Apps Script</span>.</li>
                <li>Select all code in <code className="text-white">Code.gs</code>, delete it, and paste the code above.</li>
                <li>Click <span className="text-white font-semibold">Save (floppy disk icon)</span>.</li>
                <li>Deploy by clicking <span className="text-white font-semibold">Deploy → Manage Deploys → Edit (pencil icon) → New Version → Deploy</span>.</li>
              </ol>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row sm:justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={handleReset}
              className="px-5 py-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 font-bold text-sm transition-all border border-red-500/20 active:scale-95 cursor-pointer text-center"
            >
              Reset to System URL
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white font-bold text-sm transition-all border border-white/5 active:scale-95 cursor-pointer text-center"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saveSuccess}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-brand-start to-brand-end hover:opacity-90 text-black font-bold text-sm transition-all active:scale-95 disabled:opacity-50 cursor-pointer text-center"
            >
              {saveSuccess ? "Saved Successfully!" : "Save & Resync"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
