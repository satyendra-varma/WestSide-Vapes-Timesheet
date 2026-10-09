// Local mock backend: serves the real apps-script/Code.gs (running on fake Google services) over HTTP so
// the app can be tested end to end without touching the real Sheet.
//   npm run mock            -> http://localhost:8787/exec
//   VITE_APPS_SCRIPT_URL=http://localhost:8787/exec npm run dev
// All data is in memory, uses FAKE names, and disappears when the process stops. PINs are random per
// run and printed below; nothing is hardcoded.
import http from 'node:http';
import { createBackend } from './loadBackend';
import { formatDate } from './fakeGoogle';
import { login, randomPin, seedSheets, setupManager } from './seed';

const PORT = Number(process.env.MOCK_PORT ?? 8787);
const TIME_ZONE = 'America/Vancouver';

const backend = createBackend({ timeZone: TIME_ZONE, liveClock: true });
const manager = 'Morgan Demo';
const staff = ['Alex Demo', 'Sam Demo', 'Jordan Demo'];
seedSheets(backend, [{ name: manager }, ...staff.map((name) => ({ name }))]);

const pins: Record<string, string> = {};
pins[manager] = randomPin(backend);
setupManager(backend, manager, pins[manager]);
const token = login(backend, manager, pins[manager]);
for (const name of staff) {
  pins[name] = randomPin(backend);
  backend.post({ action: 'setPin', token, name, pin: pins[name] });
}

// A roster and a few days of shifts this month (some ending at odd minutes, one needing review).
backend.post({
  action: 'updateTimetable',
  token,
  timetable: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((dayName, i) => ({
    dayName,
    morning: staff[i % staff.length],
    evening: staff[(i + 1) % staff.length],
  })),
});
const today = formatDate(new Date(), TIME_ZONE, 'yyyy-MM-dd');
const outTimes = ['15:20', '15:40', '16:05', '15:50'];
for (let day = 1; day < Number(today.slice(8, 10)); day++) {
  const date = `${today.slice(0, 8)}${String(day).padStart(2, '0')}`;
  backend.post({ action: 'saveShift', token, date, shift: 'Morning', name: staff[day % staff.length], inTime: '09:00', outTime: outTimes[day % outTimes.length] });
  backend.post({ action: 'saveShift', token, date, shift: 'Evening', name: staff[(day + 1) % staff.length], inTime: '16:00', outTime: '23:00' });
}

const server = http.createServer((req, res) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };
  if (req.method === 'OPTIONS') {
    // Apps Script can't answer preflights; the app must never need one. Make that visible.
    console.warn('Unexpected CORS preflight: the app should send simple text/plain POSTs only.');
    res.writeHead(405, headers);
    res.end();
    return;
  }
  if (req.method === 'GET') {
    res.writeHead(200, headers);
    res.end(JSON.stringify(backend.get()));
    return;
  }
  if (req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      res.writeHead(200, headers);
      res.end(JSON.stringify(backend.postRaw(body)));
    });
    return;
  }
  res.writeHead(405, headers);
  res.end();
});

server.listen(PORT, () => {
  console.log(`Mock WestSide backend on http://localhost:${PORT}/exec (fake data, in memory)`);
  console.log('Demo logins for this run only:');
  for (const [name, pin] of Object.entries(pins)) console.log(`  ${name.padEnd(12)} ${pin}${name === manager ? '  (manager)' : ''}`);
});
