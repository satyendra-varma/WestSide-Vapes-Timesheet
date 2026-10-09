// Time-driven triggers. Claude can't install them; the owner runs installTriggers() once from the
// Apps Script editor (see docs/MORNING_CHECKLIST.md). Re-running replaces our triggers, never
// duplicates them, and leaves any other triggers alone.

var TRIGGERS = [
  { handler: 'purgeFulfilledRequests', every: 'days', n: 1, atHour: 3 }
];

function installTriggers() {
  var ours = TRIGGERS.map(function (t) { return t.handler; });
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (ours.indexOf(trigger.getHandlerFunction()) !== -1) ScriptApp.deleteTrigger(trigger);
  });
  TRIGGERS.forEach(function (t) {
    var builder = ScriptApp.newTrigger(t.handler).timeBased();
    if (t.every === 'days') builder = builder.everyDays(t.n).atHour(t.atHour);
    else builder = builder.everyHours(t.n);
    builder.create();
  });
  Logger.log('Installed triggers: ' + ours.join(', '));
  return ours;
}
