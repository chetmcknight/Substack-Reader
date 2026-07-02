function doGet(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var data = sheet.getDataRange().getValues();
    
    // Convert array of arrays to array of objects if headers exist
    var resultData = [];
    if (data.length > 0) {
      var headers = data[0];
      for (var i = 1; i < data.length; i++) {
        var row = data[i];
        var obj = {};
        for (var j = 0; j < headers.length; j++) {
          obj[headers[j]] = row[j];
        }
        resultData.push(obj);
      }
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      data: resultData.length > 0 ? resultData : data
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
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
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
    
    if (action === 'setup') {
      var headers = ["title", "description", "originalUrl", "image", "sourceType"];
      if (sheet.getLastRow() === 0 || sheet.getLastColumn() === 0) {
         sheet.appendRow(headers);
         // add some formatting
         sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
      } else {
         var currentHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
         if (currentHeaders.indexOf("originalUrl") === -1 && currentHeaders.indexOf("url") === -1) {
            sheet.insertRowBefore(1);
            sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
            sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
         }
      }
      return ContentService.createTextOutput(JSON.stringify({status: 'success', message: 'Setup complete'})).setMimeType(ContentService.MimeType.JSON);
    }
    
    if (action === 'add') {
      var feed = postData.feed || {};
      var row = [
        feed.title || '',
        feed.description || '',
        feed.originalUrl || feed.url || feed.feedUrl || '',
        feed.image || '',
        feed.sourceType || 'SUBSTACK'
      ];
      sheet.appendRow(row);
      return ContentService.createTextOutput(JSON.stringify({status: 'success'})).setMimeType(ContentService.MimeType.JSON);
    }
    
    if (action === 'remove') {
      var urlToRemove = postData.originalUrl || postData.url || postData.feedUrl || '';
      if (postData.feed && !urlToRemove) {
        urlToRemove = postData.feed.originalUrl || postData.feed.url || postData.feed.feedUrl || '';
      }
      
      if (!urlToRemove) {
        return ContentService.createTextOutput(JSON.stringify({status: 'error', message: 'No URL provided'})).setMimeType(ContentService.MimeType.JSON);
      }
      
      var data = sheet.getDataRange().getValues();
      var headers = data[0] || [];
      var urlIndex = headers.indexOf('originalUrl');
      if (urlIndex === -1) urlIndex = headers.indexOf('url');
      if (urlIndex === -1) urlIndex = 2; // fallback to 3rd column
      
      var rowsDeleted = 0;
      // loop backwards to delete rows safely
      for (var i = data.length - 1; i >= 1; i--) {
        if (String(data[i][urlIndex]).trim().toLowerCase() === urlToRemove.trim().toLowerCase()) {
          sheet.deleteRow(i + 1);
          rowsDeleted++;
        }
      }
      
      return ContentService.createTextOutput(JSON.stringify({status: 'success', deleted: rowsDeleted})).setMimeType(ContentService.MimeType.JSON);
    }
    
    if (action === 'deduplicate') {
      var data = sheet.getDataRange().getValues();
      if (data.length <= 1) {
        return ContentService.createTextOutput(JSON.stringify({status: 'success', message: 'Nothing to deduplicate'})).setMimeType(ContentService.MimeType.JSON);
      }
      
      var headers = data[0];
      var urlIndex = headers.indexOf('originalUrl');
      if (urlIndex === -1) urlIndex = headers.indexOf('url');
      if (urlIndex === -1) urlIndex = 2; // fallback
      
      var seen = {};
      var rowsToDelete = [];
      
      for (var i = 1; i < data.length; i++) {
        var url = String(data[i][urlIndex]).trim().toLowerCase();
        if (!url || url === 'originalurl' || url === 'url') {
           // Skip empty URLs or header-like rows
           continue;
        }
        if (seen[url]) {
          rowsToDelete.push(i + 1);
        } else {
          seen[url] = true;
        }
      }
      
      // Delete from bottom to top
      for (var i = rowsToDelete.length - 1; i >= 0; i--) {
        sheet.deleteRow(rowsToDelete[i]);
      }
      
      return ContentService.createTextOutput(JSON.stringify({status: 'success', removed: rowsToDelete.length})).setMimeType(ContentService.MimeType.JSON);
    }
    
    return ContentService.createTextOutput(JSON.stringify({status: 'error', message: 'Unknown action'})).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: error.toString(),
      stack: error.stack
    })).setMimeType(ContentService.MimeType.JSON);
  }
}
