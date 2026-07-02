import React, { useState } from 'react';
import { Settings, Copy, Check, Info } from 'lucide-react';

interface SyncSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
}

export const SyncSettingsModal: React.FC<SyncSettingsModalProps> = ({ isOpen, onClose, onSave }) => {
  const [customUrl, setCustomUrl] = useState(() => {
    return localStorage.getItem('stackreader_apps_script_url') || '';
  });
  const [copied, setCopied] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const APPS_SCRIPT_CODE = `var LOCK_TIMEOUT_MS = 10000;
var HEADERS = ["title", "originalUrl", "description", "image", "sourceType", "updatedAt"];

function withLock_(callback) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(LOCK_TIMEOUT_MS);
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    return callback(sheet);
  } catch (e) {
    throw new Error("Could not acquire lock: " + e.toString());
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  try {
    var resultData = withLock_(getFeeds);
    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      data: resultData
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    var postData;
    
    if (e.postData && e.postData.contents) {
      try {
        postData = JSON.parse(e.postData.contents);
      } catch (parseErr) {
        return ContentService.createTextOutput(JSON.stringify({
          status: 'error',
          message: 'Invalid JSON payload'
        })).setMimeType(ContentService.MimeType.JSON);
      }
    } else {
      return ContentService.createTextOutput(JSON.stringify({
        status: 'error',
        message: 'No POST data'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    var action = postData.action;
    
    withLock_(function(sheet) {
      if (action === 'setup') {
        ensureHeaders(sheet);
        return;
      }
      
      if (action === 'add') {
        var feed = postData.feed || {};
        addFeed(sheet, feed);
        return;
      }
      
      if (action === 'remove') {
        var urlToRemove = postData.originalUrl || postData.url || postData.feedUrl || '';
        if (postData.feed && !urlToRemove) {
          urlToRemove = postData.feed.originalUrl || postData.feed.url || postData.feed.feedUrl || '';
        }
        if (!urlToRemove) {
          throw new Error('No URL provided');
        }
        removeFeed(sheet, urlToRemove);
        return;
      }
      
      if (action === 'deduplicate') {
        deduplicate(sheet);
        return;
      }
      
      throw new Error('Unknown action');
    });
    
    return ContentService.createTextOutput(JSON.stringify({status: 'success'})).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: error.toString(),
      stack: error.stack
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function ensureHeaders(sheet) {
  var lastRow = sheet.getLastRow();
  var lastColumn = sheet.getLastColumn();
  
  if (lastRow === 0 || lastColumn === 0) {
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight("bold");
    sheet.setFrozenRows(1);
    return;
  }
  
  var firstRowRange = sheet.getRange(1, 1, 1, lastColumn);
  var firstRow = firstRowRange.getValues()[0].map(function(v) { return String(v).trim().toLowerCase(); });
  
  var hasHeaders = firstRow.indexOf("originalurl") !== -1 || 
                   firstRow.indexOf("url") !== -1 || 
                   firstRow.indexOf("feedurl") !== -1 || 
                   firstRow.indexOf("title") !== -1;
                   
  if (!hasHeaders) {
    var dataRow = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
    var headers = [];
    var urlIndex = -1;
    var descIndex = -1;
    var titleIndex = -1;
    
    for (var j = 0; j < dataRow.length; j++) {
      var val = String(dataRow[j]).trim();
      if (val.indexOf("http://") === 0 || val.indexOf("https://") === 0) {
        urlIndex = j;
      } else if (val.length > 40) {
        descIndex = j;
      } else if (val.length > 0 && titleIndex === -1) {
        titleIndex = j;
      }
    }
    
    for (var j = 0; j < Math.max(dataRow.length, HEADERS.length); j++) {
      if (j === urlIndex) {
        headers.push("originalUrl");
      } else if (j === descIndex) {
        headers.push("description");
      } else if (j === titleIndex) {
        headers.push("title");
      } else if (j < HEADERS.length && !headers.includes(HEADERS[j])) {
        headers.push(HEADERS[j]);
      } else {
        headers.push("column_" + (j + 1));
      }
    }
    
    sheet.insertRowBefore(1);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
}

function getFeeds(sheet) {
  ensureHeaders(sheet);
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  
  var headers = data[0].map(function(h) { return String(h).trim().toLowerCase(); });
  var titleIdx = headers.indexOf("title");
  var urlIdx = headers.indexOf("originalurl");
  if (urlIdx === -1) urlIdx = headers.indexOf("url");
  var descIdx = headers.indexOf("description");
  var imgIdx = headers.indexOf("image");
  if (imgIdx === -1) imgIdx = headers.indexOf("logourl");
  var sourceIdx = headers.indexOf("sourcetype");
  var updatedIdx = headers.indexOf("updatedat");
  
  var feeds = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var url = urlIdx !== -1 ? String(row[urlIdx]).trim() : "";
    if (!url) continue;
    
    feeds.push({
      title: titleIdx !== -1 ? String(row[titleIdx]).trim() : "Untitled Publication",
      originalUrl: url,
      description: descIdx !== -1 ? String(row[descIdx]).trim() : "",
      image: imgIdx !== -1 ? String(row[imgIdx]).trim() : "",
      sourceType: sourceIdx !== -1 ? String(row[sourceIdx]).trim() : "SUBSTACK",
      updatedAt: updatedIdx !== -1 ? String(row[updatedIdx]).trim() : ""
    });
  }
  return feeds;
}

function addFeed(sheet, feed) {
  ensureHeaders(sheet);
  var data = sheet.getDataRange().getValues();
  var headers = data[0].map(function(h) { return String(h).trim().toLowerCase(); });
  var now = new Date().toISOString();
  
  var titleIdx = headers.indexOf("title");
  var urlIdx = headers.indexOf("originalurl");
  if (urlIdx === -1) urlIdx = headers.indexOf("url");
  var descIdx = headers.indexOf("description");
  var imgIdx = headers.indexOf("image");
  if (imgIdx === -1) imgIdx = headers.indexOf("logourl");
  var sourceIdx = headers.indexOf("sourcetype");
  var updatedIdx = headers.indexOf("updatedat");
  
  var targetUrl = (feed.originalUrl || feed.url || "").trim().toLowerCase();
  var exists = false;
  
  if (urlIdx !== -1) {
    for (var i = 1; i < data.length; i++) {
      var rowUrl = String(data[i][urlIdx]).trim().toLowerCase();
      if (rowUrl === targetUrl) {
        exists = true;
        if (titleIdx !== -1) sheet.getRange(i + 1, titleIdx + 1).setValue(feed.title || "");
        if (descIdx !== -1) sheet.getRange(i + 1, descIdx + 1).setValue(feed.description || "");
        if (imgIdx !== -1) sheet.getRange(i + 1, imgIdx + 1).setValue(feed.image || "");
        if (sourceIdx !== -1) sheet.getRange(i + 1, sourceIdx + 1).setValue(feed.sourceType || "SUBSTACK");
        if (updatedIdx !== -1) sheet.getRange(i + 1, updatedIdx + 1).setValue(now);
        break;
      }
    }
  }
  
  if (!exists) {
    var newRow = [];
    for (var j = 0; j < headers.length; j++) {
      var header = headers[j];
      if (header === "title") {
        newRow.push(feed.title || "");
      } else if (header === "originalurl" || header === "url") {
        newRow.push(feed.originalUrl || feed.url || "");
      } else if (header === "description") {
        newRow.push(feed.description || "");
      } else if (header === "image" || header === "logourl") {
        newRow.push(feed.image || "");
      } else if (header === "sourcetype") {
        newRow.push(feed.sourceType || "SUBSTACK");
      } else if (header === "updatedat") {
        newRow.push(now);
      } else {
        newRow.push("");
      }
    }
    sheet.appendRow(newRow);
  }
}

function removeFeed(sheet, urlToRemove) {
  ensureHeaders(sheet);
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return;
  
  var headers = data[0].map(function(h) { return String(h).trim().toLowerCase(); });
  var urlIdx = headers.indexOf("originalurl");
  if (urlIdx === -1) urlIdx = headers.indexOf("url");
  if (urlIdx === -1) return;
  
  var targetUrl = urlToRemove.trim().toLowerCase();
  
  for (var i = data.length - 1; i >= 1; i--) {
    var rowUrl = String(data[i][urlIdx]).trim().toLowerCase();
    if (rowUrl === targetUrl) {
      sheet.deleteRow(i + 1);
    }
  }
}

function deduplicate(sheet) {
  ensureHeaders(sheet);
  var data = sheet.getDataRange().getValues();
  if (data.length <= 2) return;
  
  var headers = data[0].map(function(h) { return String(h).trim().toLowerCase(); });
  var urlIdx = headers.indexOf("originalurl");
  if (urlIdx === -1) urlIdx = headers.indexOf("url");
  if (urlIdx === -1) return;
  
  var seen = {};
  var rowsToDelete = [];
  
  for (var i = 1; i < data.length; i++) {
    var url = String(data[i][urlIdx]).trim().toLowerCase();
    if (!url) continue;
    if (seen[url]) {
      rowsToDelete.push(i + 1);
    } else {
      seen[url] = true;
    }
  }
  
  for (var j = rowsToDelete.length - 1; j >= 0; j--) {
    sheet.deleteRow(rowsToDelete[j]);
  }
}`;

  const handleCopy = () => {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(APPS_SCRIPT_CODE).catch(() => {
        fallbackCopy(APPS_SCRIPT_CODE);
      });
    } else {
      fallbackCopy(APPS_SCRIPT_CODE);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const fallbackCopy = (text: string) => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUrl = customUrl.trim();
    if (cleanUrl) {
      localStorage.setItem('stackreader_apps_script_url', cleanUrl);
    } else {
      localStorage.removeItem('stackreader_apps_script_url');
    }
    onSave();
    setSaveSuccess(true);
    setTimeout(() => {
      setSaveSuccess(false);
      onClose();
    }, 1500);
  };

  const handleReset = () => {
    localStorage.removeItem('stackreader_apps_script_url');
    setCustomUrl('');
    onSave();
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
      <div className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-[24px] bg-[#0E0F12] border border-white/5 shadow-2xl p-6 md:p-8 animate-in fade-in zoom-in-95 duration-200 text-left modal-scroll">
        
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
