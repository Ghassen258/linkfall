import { createNetwork, shortestPath } from './topology.js';

/** Deterministic fixed-time-step packet simulator (network costs are synthetic). */
export class NetworkSimulator {
  constructor({ network = createNetwork(), rate = 5, speed = 1, maxPackets = 180 } = {}) {
    this.network = network;
    this.source = 'client';
    this.target = 'db';
    this.rate = rate;
    this.speed = speed;
    this.maxPackets = maxPackets;
    this.reset();
  }

  reset() {
    this.now = 0;
    this.emitAccum = 0;
    this.packetSequence = 0;
    this.packets = [];
    this.sent = 0;
    this.delivered = 0;
    this.dropped = 0;
    this.deliverTimes = [];
    this.dropReasons = {};
    this.events = [];
    this.counters = { delivered: 0, dropped: 0 };
    this.samples = [];
    this.sampleAccum = 0;
    this.network.links.forEach(link => { link.nextAvailableAt = 0; });
    this.log('Engine initialized · routes online', 'info');
  }

  log(message, kind = 'info') {
    this.events.unshift({ time: this.now, message, kind });
    this.events.length = Math.min(this.events.length, 26);
  }

  setEndpoints(source, target) {
    if (source === target) return false;
    if (!this.network.nodes.some(n => n.id === source) || !this.network.nodes.some(n => n.id === target)) return false;
    this.source = source;
    this.target = target;
    this.reset();
    this.log(`Flow changed · ${source.toUpperCase()} → ${target.toUpperCase()}`, 'info');
    return true;
  }

  /** Weighted shortest path; optional congestion response for live routing. */
  route(from = this.source, to = this.target, congestionAware = true) {
    return shortestPath(this.network, from, to, link => {
      if (!congestionAware) return 0;
      const waiting = this.packets.filter(p => !p.edge && p.node && (link.a === p.node || link.b === p.node)).length;
      const inflight = this.packets.filter(p => p.edge === link.id).length;
      return (inflight * 4 + waiting * 1.1) / Math.max(0.2, link.capacity / 10);
    });
  }

  setLink(id, up) {
    const link = this.network.links.find(l => l.id === id);
    if (!link || link.up === up) return false;
    link.up = up;
    if (up) link.nextAvailableAt = this.now;
    this.log(`${link.a.toUpperCase()} ↔ ${link.b.toUpperCase()} · ${up ? 'LINK RESTORED' : 'LINK DOWN'}`, up ? 'success' : 'danger');
    // Packets currently using the damaged physical link cannot be salvaged.
    if (!up) {
      for (const packet of [...this.packets]) {
        if (packet.edge === id) this.drop(packet, 'link failure');
      }
    }
    return true;
  }

  failRouteLink() {
    const route = this.route(this.source, this.target, false);
    const candidate = route?.links.find(id => {
      const link = this.network.links.find(l => l.id === id);
      return link.a !== this.source && link.b !== this.target;
    }) ?? route?.links[Math.floor((route.links.length - 1) / 2)];
    return candidate && this.setLink(candidate, false) ? candidate : null;
  }

  restoreAll() {
    let count = 0;
    for (const link of this.network.links) if (this.setLink(link.id, true)) count++;
    return count;
  }

  spawn() {
    this.sent++;
    if (this.packets.length >= this.maxPackets) {
      this.dropped++;
      this.counters.dropped++;
      this.dropReasons['buffer overflow'] = (this.dropReasons['buffer overflow'] ?? 0) + 1;
      return null;
    }
    const packet = {
      id: ++this.packetSequence, node: this.source, edge: null, from: null, to: null,
      startedAt: 0, travelTime: 0, createdAt: this.now, hops: 0, waitingAt: this.now,
    };
    this.packets.push(packet);
    return packet;
  }

  drop(packet, reason) {
    const index = this.packets.indexOf(packet);
    if (index === -1) return;
    this.packets.splice(index, 1);
    this.dropped++;
    this.counters.dropped++;
    this.dropReasons[reason] = (this.dropReasons[reason] ?? 0) + 1;
    if (reason === 'link failure' || reason === 'no route') this.log(`Packet #${packet.id} dropped · ${reason}`, 'danger');
  }

  deliver(packet) {
    const index = this.packets.indexOf(packet);
    if (index === -1) return;
    this.packets.splice(index, 1);
    this.delivered++;
    this.counters.delivered++;
    this.deliverTimes.push(this.now - packet.createdAt);
    if (this.deliverTimes.length > 180) this.deliverTimes.shift();
  }

  /** Advance simulation by dt milliseconds; clamp runaway background tab jumps. */
  step(dt) {
    const elapsed = Math.min(120, Math.max(0, dt)) * this.speed;
    this.now += elapsed;
    this.emitAccum += elapsed * this.rate / 1000;
    let spawnCount = Math.min(15, Math.floor(this.emitAccum));
    this.emitAccum -= spawnCount;
    while (spawnCount--) this.spawn();

    for (const packet of [...this.packets]) {
      if (packet.edge) {
        const link = this.network.links.find(l => l.id === packet.edge);
        if (!link?.up) { this.drop(packet, 'link failure'); continue; }
        if (this.now - packet.startedAt < packet.travelTime) continue;
        packet.node = packet.to;
        packet.edge = null;
        packet.from = null;
        packet.to = null;
        packet.waitingAt = this.now;
        if (packet.node === this.target) { this.deliver(packet); continue; }
      }
      if (this.now - packet.createdAt > 9500) { this.drop(packet, 'queue timeout'); continue; }
      if (packet.node === this.target) { this.deliver(packet); continue; }
      const path = this.route(packet.node, this.target, true);
      if (!path?.links.length) { this.drop(packet, 'no route'); continue; }
      const link = this.network.links.find(l => l.id === path.links[0]);
      if (this.now < link.nextAvailableAt) continue;
      // Each link's capacity is an admission rate (packets / simulated second).
      link.nextAvailableAt = this.now + 1000 / link.capacity;
      packet.edge = link.id;
      packet.from = packet.node;
      packet.to = link.a === packet.node ? link.b : link.a;
      packet.node = null;
      packet.startedAt = this.now;
      packet.travelTime = 185 + link.cost * 9; // Stretch visual time for legibility.
      packet.hops++;
    }

    this.sampleAccum += elapsed;
    if (this.sampleAccum >= 1000) {
      this.samples.push({ delivered: this.counters.delivered, dropped: this.counters.dropped, time: this.now });
      if (this.samples.length > 48) this.samples.shift();
      this.sampleAccum %= 1000;
      this.counters = { delivered: 0, dropped: 0 };
    }
  }

  snapshot() {
    const duration = this.deliverTimes.length ? this.deliverTimes.reduce((a, b) => a + b, 0) / this.deliverTimes.length : 0;
    return {
      sent: this.sent, delivered: this.delivered, dropped: this.dropped,
      avgTransit: duration, deliveryRate: (this.delivered + this.dropped) ? this.delivered / (this.delivered + this.dropped) * 100 : 100,
      inflight: this.packets.filter(p => p.edge).length,
      queued: this.packets.filter(p => p.node).length,
      route: this.route(),
    };
  }
}
