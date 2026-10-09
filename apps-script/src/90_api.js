// HTTP entry points. Every action is a POST with a JSON body sent as text/plain (no CORS preflight):
//   { action, token, ...params }  ->  {status: "success", data} | {status: "error", code, message} |
//                                     {status: "conflict", code: "conflict", previousData}
// The only action that works without a token is "login". doGet returns no data at all; the app uses
// it only to check that the URL points at this version of the backend.

var ACTIONS = {
  login: { auth: false, write: true, handler: actionLogin },
  getEmployees: { auth: true, handler: actionGetEmployees },
  getTimesheet: { auth: true, handler: actionGetTimesheet },
  saveShift: { auth: true, write: true, handler: actionSaveShift },
  deleteShift: { auth: true, write: true, manager: true, handler: actionDeleteShift },
  getTimetable: { auth: true, handler: actionGetTimetable },
  updateTimetable: { auth: true, write: true, manager: true, handler: actionUpdateTimetable },
  setPin: { auth: true, write: true, manager: true, handler: actionSetPin },
  unlockEmployee: { auth: true, write: true, manager: true, handler: actionUnlockEmployee },
  setEmployeeActive: { auth: true, write: true, manager: true, handler: actionSetEmployeeActive },
  getAudit: { auth: true, manager: true, handler: actionGetAudit },
  getStock: { auth: true, handler: actionGetStock },
  addStock: { auth: true, write: true, handler: actionAddStock },
  setStockResolved: { auth: true, write: true, handler: actionSetStockResolved },
  getRequests: { auth: true, handler: actionGetRequests },
  addRequest: { auth: true, write: true, handler: actionAddRequest },
  updateRequestStatus: { auth: true, write: true, handler: actionUpdateRequestStatus },
  deleteRequest: { auth: true, write: true, manager: true, handler: actionDeleteRequest },
  getRequestSettings: { auth: true, manager: true, handler: actionGetRequestSettings },
  setRequestSettings: { auth: true, write: true, manager: true, handler: actionSetRequestSettings },
  getCashToday: { auth: true, handler: actionGetCashToday },
  saveCashCount: { auth: true, write: true, handler: actionSaveCashCount },
  getCashHistory: { auth: true, manager: true, handler: actionGetCashHistory },
  setCashSettings: { auth: true, write: true, manager: true, handler: actionSetCashSettings },
  getReminderSettings: { auth: true, manager: true, handler: actionGetReminderSettings },
  setReminderSettings: { auth: true, write: true, manager: true, handler: actionSetReminderSettings }
};

function jsonOutput(body) {
  body.apiVersion = API_VERSION;
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return jsonOutput({ status: 'error', code: 'use_post', message: 'This backend only accepts POST requests.' });
}

function doPost(e) {
  return jsonOutput(handleRequest(e && e.postData ? e.postData.contents : ''));
}

/** Pure request handling, separate from ContentService so tests can call it directly. */
function handleRequest(rawBody) {
  var req;
  try {
    req = JSON.parse(rawBody || '');
  } catch (err) {
    return { status: 'error', code: 'invalid', message: 'Request body must be JSON.' };
  }
  if (!req || typeof req !== 'object') return { status: 'error', code: 'invalid', message: 'Request body must be JSON.' };

  var def = Object.prototype.hasOwnProperty.call(ACTIONS, req.action) ? ACTIONS[req.action] : null;
  if (!def) return { status: 'error', code: 'invalid', message: 'Unknown action.' };

  try {
    var run = function () {
      var session = null;
      if (def.auth) {
        session = authenticate(req.token);
        if (def.manager && session.role !== ROLES.MANAGER) throw fail('forbidden', 'Only a manager can do that.');
      }
      return def.handler(req, session);
    };
    var result = def.write ? withScriptLock(run) : run();
    if (result && result.conflict === true) {
      return {
        status: 'conflict',
        code: 'conflict',
        message: 'That shift is already logged with different details.',
        previousData: result.previousData
      };
    }
    return { status: 'success', data: result === undefined ? null : result };
  } catch (err) {
    if (err instanceof ApiFail) {
      var body = { status: 'error', code: err.code, message: err.message };
      if (err.extra) {
        for (var k in err.extra) {
          if (Object.prototype.hasOwnProperty.call(err.extra, k)) body[k] = err.extra[k];
        }
      }
      return body;
    }
    // Unexpected failure: log the error only (never the request body, which may hold a PIN or token).
    console.error('Unhandled error in action ' + req.action + ': ' + (err && err.message ? err.message : err));
    return { status: 'error', code: 'server_error', message: 'Something went wrong on the server. Please try again.' };
  }
}
