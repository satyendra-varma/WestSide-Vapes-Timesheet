// One-time functions the owner runs by hand from the Apps Script editor (select the function in the
// toolbar, then Run). See docs/MORNING_CHECKLIST.md. Nothing here is reachable over HTTP.

/**
 * Sets the first manager's PIN without ever putting it in code:
 *   1. Project Settings > Script properties: add SETUP_MANAGER_NAME (exactly as in the Employees tab)
 *      and SETUP_MANAGER_PIN (6 digits).
 *   2. Run setManagerPin. It stores only a salted hash, marks that employee as manager and active,
 *      then deletes both SETUP_ properties.
 */
function setManagerPin() {
  var props = scriptProps();
  var name = props.getProperty(PROP_KEYS.SETUP_MANAGER_NAME);
  var pin = props.getProperty(PROP_KEYS.SETUP_MANAGER_PIN);
  try {
    if (!name || !pin) {
      throw new Error('Add the script properties ' + PROP_KEYS.SETUP_MANAGER_NAME + ' and ' + PROP_KEYS.SETUP_MANAGER_PIN + ' first.');
    }
    return withScriptLock(function () {
      var employee = findEmployee(name);
      if (!employee) throw new Error('"' + cleanName(name) + '" is not in the Employees tab (column A).');
      validateNewPin(pin);
      setEmployeeCell(employee, 'Role', ROLES.MANAGER);
      setEmployeeCell(employee, 'Active', 'TRUE');
      setEmployeePin(employee, pin);
      getOrCreateSecret(PROP_KEYS.TOKEN_SECRET);
      audit('(setup)', 'setup.managerPin', employee.name, 'manager PIN set from the script editor');
      Logger.log('Manager PIN set for ' + employee.name + '. The SETUP_ properties have been deleted.');
      return employee.name;
    });
  } catch (err) {
    var message = err instanceof ApiFail ? err.message : (err && err.message) || String(err);
    Logger.log('setManagerPin failed: ' + message);
    throw new Error(message);
  } finally {
    props.deleteProperty(PROP_KEYS.SETUP_MANAGER_PIN);
    props.deleteProperty(PROP_KEYS.SETUP_MANAGER_NAME);
  }
}
