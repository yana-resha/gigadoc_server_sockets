const assert = require('node:assert/strict');
const { before, after, test } = require('node:test');
const { spawn } = require('node:child_process');
const { createServer } = require('node:net');
const path = require('node:path');
const { WebSocket } = require('ws');
const { buildVoiceStateMessage } = require('../lib/protocol');

let server, port;
before(async () => {
  const reservation = createServer();
  await new Promise((resolve, reject) => {
    reservation.once('error', reject);
    reservation.listen(0, '127.0.0.1', resolve);
  });
  port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  server = spawn(process.execPath, ['index.js'], {
    cwd: path.resolve(__dirname, '..'), env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('stub startup timed out')), 5000);
    server.stdout.on('data', data => {
      if (data.toString().includes('VSP WebSocket stub:')) { clearTimeout(timeout); resolve(); }
    });
    server.once('exit', code => { clearTimeout(timeout); reject(new Error(`stub exited: ${code}`)); });
    server.once('error', reject);
  });
});
after(async () => {
  if (server && server.exitCode === null) {
    await new Promise(resolve => { server.once('exit', resolve); server.kill(); });
  }
});

async function connect(t) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws/frontend/v1`);
  const messages = [];
  const waiters = new Set();
  socket.on('message', raw => { messages.push(JSON.parse(raw)); for (const check of waiters) check(); });
  const until = predicate => new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { waiters.delete(check); reject(new Error('messages timed out')); }, 5000);
    const check = () => {
      if (!predicate(messages)) return;
      clearTimeout(timeout); waiters.delete(check); resolve();
    };
    waiters.add(check); check();
  });
  t.after(() => new Promise(resolve => { socket.once('close', resolve); socket.close(); }));
  await until(items => items.length > 0);
  return { messages, until, intent: (intent, unrestricted = false) => socket.send(JSON.stringify({
    type: 'mock_user_intent', payload: { intent, unrestricted },
  })) };
}

test('first frame is the canonical waiting snapshot with no session and no tech telemetry', async t => {
  const h = await connect(t);
  assert.deepEqual(h.messages, [buildVoiceStateMessage('waiting')]);
  assert.deepEqual(Object.keys(h.messages[0]).sort(), ['state', 'status', 'type']);
});

test('first phrase sends listening/thinking before start and waiting after the screen command', async t => {
  const h = await connect(t);
  h.intent('begin_measurements');
  await h.until(items => items.some(item => item.type === 'scan_selection_ready') && items.at(-1).state === 'waiting');
  assert.deepEqual(h.messages.filter(item => item.type === 'voice_state_changed').map(item => item.state),
    ['waiting', 'listening', 'thinking', 'waiting']);
  const index = type => h.messages.findIndex(item => item.type === type);
  assert.ok(h.messages.findIndex(item => item.state === 'thinking') < index('session_start'));
  assert.ok(index('session_start') < index('measurement_snapshot'));
  assert.ok(index('measurement_snapshot') < index('scan_selection_ready'));
  assert.equal(h.messages.some(item => item.type === 'tech'), false);
});

test('panel phrases use new statuses and a newer click cancels the earlier delayed screen', async t => {
  const h = await connect(t);
  h.intent('start_session', true);
  await h.until(items => items.some(item => item.type === 'session_start'));
  h.intent('open_checkup_skin', true);
  await h.until(items => items.at(-1).state === 'listening');
  h.intent('open_checkup_heart', true);
  await h.until(items => items.some(item => item.type === 'checkup_heart_ready') && items.at(-1).state === 'waiting');
  assert.equal(h.messages.some(item => item.type === 'checkup_skin_ready'), false);
  assert.ok(h.messages.some(item => item.state === 'thinking'));
  assert.equal(h.messages.filter(item => item.type === 'session_start').length, 1);
});

test('reset cancels the pending phrase, sends end then waiting, and the next session can start', async t => {
  const h = await connect(t);
  h.intent('start_session', true);
  await h.until(items => items.some(item => item.type === 'session_start'));
  h.intent('open_checkup_vision', true);
  await h.until(items => items.at(-1).state === 'thinking');
  await fetch(`http://127.0.0.1:${port}/reset`, { method: 'POST' });
  await h.until(items => items.some(item => item.type === 'session_end'));
  const end = h.messages.findIndex(item => item.type === 'session_end');
  assert.deepEqual(h.messages[end + 1], buildVoiceStateMessage('waiting'));
  h.intent('open_checkup_general', true);
  await h.until(items => items.some(item => item.type === 'checkup_general_ready') && items.at(-1).state === 'waiting');
  assert.equal(h.messages.some(item => item.type === 'checkup_vision_ready'), false);
  assert.equal(h.messages.filter(item => item.type === 'session_start').length, 2);
});


test('a replacement click before the first delayed start still announces exactly one session', async t => {
  const h = await connect(t);
  h.intent('open_checkup_skin', true);
  await h.until(items => items.at(-1).state === 'listening');
  h.intent('open_checkup_heart', true);
  await h.until(items => items.some(item => item.type === 'checkup_heart_ready') && items.at(-1).state === 'waiting');
  assert.equal(h.messages.some(item => item.type === 'checkup_skin_ready'), false);
  assert.equal(h.messages.filter(item => item.type === 'session_start').length, 1);
  assert.ok(h.messages.findIndex(item => item.type === 'session_start') < h.messages.findIndex(item => item.type === 'measurement_snapshot'));
});
