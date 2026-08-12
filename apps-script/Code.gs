/**
 * Toastmasters Agenda/Vote/Feedback backend.
 *
 * Setup:
 *   1. Paste this whole file into Extensions > Apps Script on your club's
 *      Google Sheet.
 *   2. Run setupSheets_ once (Run menu > setupSheets_) to create the tabs.
 *   3. (Optional) Project Settings > Script Properties > add EDIT_PIN.
 *   4. Deploy > New deployment > Web app, execute as "Me", access "Anyone".
 *   5. Copy the /exec URL into js/config.js as WEB_APP_URL.
 */

var AGENDA_HEADERS = ['order', 'role', 'name', 'title', 'time', 'awardCategory', 'collectFeedback'];
var VOTES_HEADERS = ['timestamp', 'meetingId', 'category', 'nominee'];
var FEEDBACK_HEADERS = ['timestamp', 'meetingId', 'speaker', 'speechTitle', 'feedback'];
var META_KEYS = ['meetingId', 'meetingTitle', 'meetingDate', 'publishedAt'];

var VOTE_CATEGORIES = ['BestSpeaker', 'BestTableTopics', 'BestEvaluator'];
var MAX_NOMINEE_LENGTH = 100;
var MAX_FEEDBACK_LENGTH = 2000;

function setupSheets_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var meta = getOrCreateSheet_(ss, 'Meta');
  meta.clear();
  meta.appendRow(['key', 'value']);
  META_KEYS.forEach(function (key) {
    meta.appendRow([key, '']);
  });

  var agenda = getOrCreateSheet_(ss, 'Agenda');
  agenda.clear();
  agenda.appendRow(AGENDA_HEADERS);

  var votes = getOrCreateSheet_(ss, 'Votes');
  votes.clear();
  votes.appendRow(VOTES_HEADERS);

  var feedback = getOrCreateSheet_(ss, 'Feedback');
  feedback.clear();
  feedback.appendRow(FEEDBACK_HEADERS);
}

function getOrCreateSheet_(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function doGet(e) {
  return routeAction_(e.parameter.action, e.parameter);
}

function doPost(e) {
  var payload = {};
  try {
    payload = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonResponse_({ ok: false, error: 'invalid_json' });
  }
  return routeAction_(payload.action, payload);
}

function routeAction_(action, params) {
  try {
    switch (action) {
      case 'getAgenda':
        return jsonResponse_(getAgenda_());
      case 'publishAgenda':
        return jsonResponse_(publishAgenda_(params));
      case 'vote':
        return jsonResponse_(castVote_(params));
      case 'submitFeedback':
        return jsonResponse_(submitFeedback_(params));
      default:
        return jsonResponse_({ ok: false, error: 'unknown_action' });
    }
  } catch (err) {
    return jsonResponse_({ ok: false, error: 'server_error', message: String(err) });
  }
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function readMeta_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Meta');
  var rows = sheet.getDataRange().getValues();
  var meta = {};
  for (var i = 1; i < rows.length; i++) {
    meta[rows[i][0]] = rows[i][1];
  }
  return meta;
}

function writeMeta_(updates) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Meta');
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    var key = rows[i][0];
    if (updates.hasOwnProperty(key)) {
      sheet.getRange(i + 1, 2).setValue(updates[key]);
    }
  }
}

function readAgendaRows_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Agenda');
  var values = sheet.getDataRange().getValues();
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var r = values[i];
    if (r.join('') === '') continue;
    rows.push({
      order: r[0],
      role: r[1],
      name: r[2],
      title: r[3],
      time: r[4],
      awardCategory: r[5],
      collectFeedback: r[6]
    });
  }
  rows.sort(function (a, b) { return Number(a.order) - Number(b.order); });
  return rows;
}

function getAgenda_() {
  var meta = readMeta_();
  return {
    ok: true,
    meetingId: meta.meetingId || '',
    meetingTitle: meta.meetingTitle || '',
    meetingDate: meta.meetingDate || '',
    publishedAt: meta.publishedAt || '',
    agenda: readAgendaRows_()
  };
}

function publishAgenda_(params) {
  var meta = readMeta_();
  var configuredPin = PropertiesService.getScriptProperties().getProperty('EDIT_PIN');
  if (configuredPin && configuredPin !== '' && params.pin !== configuredPin) {
    return { ok: false, error: 'invalid_pin' };
  }

  var agenda = params.agenda || [];
  if (!Array.isArray(agenda)) {
    return { ok: false, error: 'invalid_agenda' };
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Agenda');
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, AGENDA_HEADERS.length).clearContent();
  }

  var sorted = agenda.slice().sort(function (a, b) { return Number(a.order) - Number(b.order); });
  var out = sorted.map(function (row) {
    return [
      row.order || 0,
      row.role || '',
      row.name || '',
      row.title || '',
      row.time || '',
      row.awardCategory || '',
      row.collectFeedback || ''
    ];
  });
  if (out.length > 0) {
    sheet.getRange(2, 1, out.length, AGENDA_HEADERS.length).setValues(out);
  }

  var newMeetingId = Utilities.getUuid();
  var publishedAt = new Date().toISOString();
  writeMeta_({
    meetingId: newMeetingId,
    meetingTitle: params.meetingTitle || '',
    meetingDate: params.meetingDate || '',
    publishedAt: publishedAt
  });

  return { ok: true, meetingId: newMeetingId, publishedAt: publishedAt };
}

function castVote_(params) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var meta = readMeta_();
    if (!params.meetingId || params.meetingId !== meta.meetingId) {
      return { ok: false, error: 'stale_meeting', meetingId: meta.meetingId || '' };
    }

    var category = params.category;
    if (VOTE_CATEGORIES.indexOf(category) === -1) {
      return { ok: false, error: 'invalid_category' };
    }

    var nominee = String(params.nominee || '').trim().slice(0, MAX_NOMINEE_LENGTH);
    if (!nominee) {
      return { ok: false, error: 'invalid_nominee' };
    }

    if (category === 'BestSpeaker' || category === 'BestEvaluator') {
      var eligible = readAgendaRows_().some(function (row) {
        return row.awardCategory === category && row.name === nominee;
      });
      if (!eligible) {
        return { ok: false, error: 'nominee_not_eligible' };
      }
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    ss.getSheetByName('Votes').appendRow([new Date().toISOString(), meta.meetingId, category, nominee]);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

function submitFeedback_(params) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var meta = readMeta_();
    if (!params.meetingId || params.meetingId !== meta.meetingId) {
      return { ok: false, error: 'stale_meeting', meetingId: meta.meetingId || '' };
    }

    var speaker = String(params.speaker || '').trim().slice(0, MAX_NOMINEE_LENGTH);
    var speechTitle = String(params.speechTitle || '').trim().slice(0, MAX_NOMINEE_LENGTH);
    var feedback = String(params.feedback || '').trim().slice(0, MAX_FEEDBACK_LENGTH);
    if (!speaker || !feedback) {
      return { ok: false, error: 'invalid_feedback' };
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    ss.getSheetByName('Feedback').appendRow([new Date().toISOString(), meta.meetingId, speaker, speechTitle, feedback]);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}
