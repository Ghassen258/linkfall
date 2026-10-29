import test from 'node:test';
import assert from 'node:assert/strict';
import { createNetwork, shortestPath, activeNeighbors } from '../src/topology.js';

test('shortest path follows expected low-cost backbone', () => {
  const result = shortestPath(createNetwork(), 'client', 'db');
  assert.deepEqual(result.nodes, ['client', 'edge', 'core-a', 'east', 'db']);
  assert.equal(result.cost, 60);
});

test('failed link triggers a different valid route', () => {
  const network = createNetwork();
  network.links.find(l => l.id === 'l4').up = false;
  const path = shortestPath(network, 'client', 'db');
  assert.ok(path);
  assert.ok(!path.links.includes('l4'));
  assert.equal(path.nodes.at(-1), 'db');
});

test('unreachable endpoint is reported without looping', () => {
  const network = createNetwork();
  network.links.find(l => l.id === 'l1').up = false;
  assert.equal(shortestPath(network, 'client', 'db'), null);
});

test('congestion penalty influences route selection', () => {
  const network = createNetwork();
  const routed = shortestPath(network, 'client', 'db', l => l.id === 'l4' ? 100 : 0);
  assert.ok(!routed.links.includes('l4'));
});

test('same endpoint has zero cost and no links', () => {
  assert.deepEqual(shortestPath(createNetwork(), 'cache', 'cache'), { nodes: ['cache'], links: [], cost: 0 });
});

test('neighbors exclude failed links', () => {
  const network = createNetwork();
  network.links.find(l => l.id === 'l1').up = false;
  assert.ok(!activeNeighbors(network, 'client').length);
});
