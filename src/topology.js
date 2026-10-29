/** Topology and pathfinding. All routing calculations are pure. */
export const INITIAL_NODES = [
  { id: 'client', label: 'CLIENT', role: 'origin', x: 0.10, y: 0.54 },
  { id: 'edge', label: 'EDGE-01', role: 'edge', x: 0.285, y: 0.54 },
  { id: 'core-a', label: 'CORE-A', role: 'router', x: 0.47, y: 0.26 },
  { id: 'core-b', label: 'CORE-B', role: 'router', x: 0.47, y: 0.79 },
  { id: 'east', label: 'POP-EAST', role: 'router', x: 0.69, y: 0.23 },
  { id: 'west', label: 'POP-WEST', role: 'router', x: 0.69, y: 0.81 },
  { id: 'cache', label: 'CACHE', role: 'cache', x: 0.73, y: 0.53 },
  { id: 'db', label: 'DB-01', role: 'destination', x: 0.91, y: 0.53 },
];

export const INITIAL_LINKS = [
  { id: 'l1', a: 'client', b: 'edge', cost: 12, capacity: 28 },
  { id: 'l2', a: 'edge', b: 'core-a', cost: 18, capacity: 18 },
  { id: 'l3', a: 'edge', b: 'core-b', cost: 23, capacity: 15 },
  { id: 'l4', a: 'core-a', b: 'east', cost: 13, capacity: 14 },
  { id: 'l5', a: 'core-b', b: 'west', cost: 14, capacity: 14 },
  { id: 'l6', a: 'east', b: 'db', cost: 17, capacity: 17 },
  { id: 'l7', a: 'west', b: 'db', cost: 21, capacity: 13 },
  { id: 'l8', a: 'core-a', b: 'core-b', cost: 31, capacity: 10 },
  { id: 'l9', a: 'east', b: 'cache', cost: 10, capacity: 10 },
  { id: 'l10', a: 'west', b: 'cache', cost: 12, capacity: 12 },
  { id: 'l11', a: 'cache', b: 'db', cost: 12, capacity: 12 },
  { id: 'l12', a: 'core-a', b: 'cache', cost: 28, capacity: 12 },
  { id: 'l13', a: 'core-b', b: 'cache', cost: 26, capacity: 12 },
];

export function createNetwork() {
  return {
    nodes: INITIAL_NODES.map(n => ({ ...n })),
    links: INITIAL_LINKS.map(l => ({ ...l, up: true, nextAvailableAt: 0 })),
  };
}

/** Returns the optimal active route using Dijkstra and a stable tie-break. */
export function shortestPath(network, from, to, getPenalty = () => 0) {
  const nodes = new Set(network.nodes.map(n => n.id));
  if (!nodes.has(from) || !nodes.has(to)) return null;
  if (from === to) return { nodes: [from], links: [], cost: 0 };
  const distances = new Map([[from, 0]]);
  const previous = new Map();
  const visited = new Set();
  while (true) {
    const current = [...nodes].filter(n => !visited.has(n) && distances.has(n))
      .sort((a, b) => distances.get(a) - distances.get(b) || a.localeCompare(b))[0];
    if (!current) return null;
    if (current === to) break;
    visited.add(current);
    for (const link of network.links) {
      if (!link.up || (link.a !== current && link.b !== current)) continue;
      const neighbor = link.a === current ? link.b : link.a;
      if (visited.has(neighbor)) continue;
      const penalty = Math.max(0, Number(getPenalty(link)) || 0);
      const alternate = distances.get(current) + link.cost + penalty;
      if (alternate < (distances.get(neighbor) ?? Infinity)) {
        distances.set(neighbor, alternate);
        previous.set(neighbor, { node: current, link: link.id });
      }
    }
  }
  const pathNodes = [to], pathLinks = [];
  let at = to;
  while (at !== from) {
    const step = previous.get(at);
    if (!step) return null;
    pathLinks.unshift(step.link);
    at = step.node;
    pathNodes.unshift(at);
  }
  return { nodes: pathNodes, links: pathLinks, cost: distances.get(to) };
}

export function activeNeighbors(network, id) {
  return network.links.filter(l => l.up && (l.a === id || l.b === id))
    .map(l => l.a === id ? l.b : l.a);
}
