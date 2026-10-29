import test from 'node:test';
import assert from 'node:assert/strict';
import { NetworkSimulator } from '../src/engine.js';

test('packets traverse the graph and are delivered', () => {
  const sim = new NetworkSimulator({ rate: 3 });
  for (let i = 0; i < 220; i++) sim.step(50);
  assert.ok(sim.delivered > 0);
  assert.equal(sim.dropped, 0);
  assert.ok(sim.snapshot().avgTransit > 0);
});

test('link outage drops in-flight packets and reroutes new packets', () => {
  const sim = new NetworkSimulator({ rate: 4 });
  for (let i = 0; i < 40; i++) sim.step(50);
  assert.ok(sim.setLink('l4', false));
  assert.ok(!sim.route('client', 'db', false).links.includes('l4'));
  const before = sim.delivered;
  for (let i = 0; i < 250; i++) sim.step(50);
  assert.ok(sim.delivered > before);
  assert.ok(sim.dropped > 0);
});

test('disconnecting the source reports no route and losses', () => {
  const sim = new NetworkSimulator({ rate: 7 });
  sim.setLink('l1', false);
  for (let i = 0; i < 40; i++) sim.step(50);
  assert.equal(sim.delivered, 0);
  assert.ok(sim.dropReasons['no route'] > 0);
});

test('restoring all links repairs topology', () => {
  const sim = new NetworkSimulator();
  sim.setLink('l1', false);
  sim.setLink('l4', false);
  assert.equal(sim.restoreAll(), 2);
  assert.ok(sim.route('client', 'db', false));
});

test('reset clears metrics and packet state', () => {
  const sim = new NetworkSimulator({ rate: 4 });
  for (let i = 0; i < 50; i++) sim.step(50);
  assert.ok(sim.sent > 0);
  sim.reset();
  assert.equal(sim.sent, 0);
  assert.equal(sim.packets.length, 0);
  assert.equal(sim.now, 0);
});

test('endpoint validation preserves state on invalid flow', () => {
  const sim = new NetworkSimulator();
  assert.equal(sim.setEndpoints('db', 'db'), false);
  assert.equal(sim.source, 'client');
  assert.equal(sim.setEndpoints('edge', 'cache'), true);
  assert.equal(sim.source, 'edge');
  assert.equal(sim.target, 'cache');
});

test('packet buffer stays bounded under extreme traffic', () => {
  const sim = new NetworkSimulator({ rate: 300, maxPackets: 6 });
  for (let i = 0; i < 100; i++) sim.step(100);
  assert.ok(sim.packets.length <= 6);
  assert.ok(sim.dropped > 0);
});
