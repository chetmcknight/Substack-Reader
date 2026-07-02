var LOCK_TIMEOUT_MS = 10000;
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
}
