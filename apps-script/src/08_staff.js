// Employee list and manager-only staff management (PINs, lockout, active flag).

/** Staff see active names only; the manager also sees role, active, PIN and lock status. */
function actionGetEmployees(req, session) {
  var list = readEmployees();
  if (session.role !== ROLES.MANAGER) {
    return list.filter(function (e) { return e.active; }).map(function (e) { return { name: e.name, role: e.role, active: true }; });
  }
  var now = Date.now();
  return list.map(function (e) {
    var rec = getAuthRecord(e.key);
    return {
      name: e.name,
      role: e.role,
      active: e.active,
      hasPin: !!rec.hash,
      lockedUntil: rec.lockedUntil > now ? rec.lockedUntil : 0
    };
  });
}

function requireEmployee(name) {
  var employee = findEmployee(name);
  if (!employee) throw fail('not_found', 'No employee with that name in the Employees tab.', { field: 'name' });
  return employee;
}

/** req: { name, pin }. Sets or resets a PIN; logs that employee out everywhere. */
function actionSetPin(req, session) {
  var employee = requireEmployee(req.name);
  var pin = String(req.pin === null || req.pin === undefined ? '' : req.pin);
  validateNewPin(pin);
  setEmployeePin(employee, pin);
  audit(session.name, 'pin.set', employee.name, 'PIN set or reset; existing sessions ended');
  return { name: employee.name };
}

function actionUnlockEmployee(req, session) {
  var employee = requireEmployee(req.name);
  var rec = getAuthRecord(employee.key);
  rec.failed = 0;
  rec.lockedUntil = 0;
  saveAuthRecord(employee.key, rec);
  audit(session.name, 'employee.unlock', employee.name, '');
  return { name: employee.name };
}

/** req: { name, active: boolean }. Deactivation ends the employee's sessions immediately. */
function actionSetEmployeeActive(req, session) {
  var employee = requireEmployee(req.name);
  if (typeof req.active !== 'boolean') throw fail('invalid', 'active must be true or false.', { field: 'active' });
  if (!req.active && employee.key === session.key) throw fail('invalid', "You can't deactivate yourself.");
  setEmployeeCell(employee, 'Active', req.active ? 'TRUE' : 'FALSE');
  if (!req.active) {
    var rec = getAuthRecord(employee.key);
    rec.tv += 1;
    saveAuthRecord(employee.key, rec);
  }
  audit(session.name, req.active ? 'employee.activate' : 'employee.deactivate', employee.name, '');
  return { name: employee.name, active: req.active };
}
