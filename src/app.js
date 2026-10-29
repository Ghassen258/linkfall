import { NetworkSimulator } from './engine.js';
import { position } from './render.js';
import { renderNetwork, renderHistory } from './render.js';

const $ = id => document.getElementById(id);
const simulator = new NetworkSimulator();
const graphCanvas = $('network-canvas');
const chartCanvas = $('history-canvas');
let paused = false;
let hoverLink = null;
let hoverNode = null;
let selectedLink = null;
let dragging = null;
let lastFrame = performance.now();
let lastUI = -Infinity;
let lastSamples = -1;
let lastEvents = '';

function sizeCanvas(canvas) {
  const { width, height } = canvas.getBoundingClientRect();
  if (!width || !height) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.round(width * dpr), h = Math.round(height * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  canvas.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
}

function setStatus(message) {
  $('engine-label').textContent = message;
}

const names = Object.fromEntries(simulator.network.nodes.map(n => [n.id, n.label]));
for (const select of [$('source'), $('target')]) {
  for (const node of simulator.network.nodes) {
    const option = document.createElement('option');
    option.value = node.id;
    option.textContent = node.label;
    select.appendChild(option);
  }
}
$('source').value = simulator.source;
$('target').value = simulator.target;

function updateEndpoints(event) {
  if (simulator.setEndpoints($('source').value, $('target').value)) {
    selectedLink = null;
    updateUI(true);
  } else {
    // Keep a valid distinct source and destination.
    if (event.target === $('source')) $('target').value = simulator.source;
    else $('source').value = simulator.target;
    const a = $('source').value, b = $('target').value;
    const alternative = simulator.network.nodes.find(n => n.id !== (event.target === $('source') ? a : b)).id;
    if (event.target === $('source')) $('target').value = alternative;
    else $('source').value = alternative;
    simulator.setEndpoints($('source').value, $('target').value);
  }
  updateUI(true);
}
$('source').addEventListener('change', updateEndpoints);
$('target').addEventListener('change', updateEndpoints);
$('rate').addEventListener('input', event => {
  simulator.rate = Number(event.target.value);
  $('rate-value').textContent = `${simulator.rate} pkt/s`;
});
$('speed').addEventListener('input', event => {
  simulator.speed = Number(event.target.value);
  $('speed-value').textContent = `${simulator.speed.toFixed(1)}×`;
});

function pause() {
  paused = !paused;
  $('pause').textContent = paused ? '▶ Resume' : 'Ⅱ Pause';
  $('pause').setAttribute('aria-pressed', String(paused));
  setStatus(paused ? 'ENGINE PAUSED' : 'ENGINE ONLINE');
  lastFrame = performance.now();
}
$('pause').addEventListener('click', pause);
$('fail').addEventListener('click', () => {
  const id = simulator.failRouteLink();
  if (!id) simulator.log('No active route to break', 'danger');
  else selectedLink = id;
  updateUI(true);
});
$('restore').addEventListener('click', () => { simulator.restoreAll(); updateUI(true); });
$('reset').addEventListener('click', () => { simulator.reset(); updateUI(true); });
$('toggle-link').addEventListener('click', () => {
  const link = simulator.network.links.find(l => l.id === selectedLink);
  if (link) simulator.setLink(link.id, !link.up);
  updateUI(true);
});
document.addEventListener('keydown', event => {
  if (event.target?.matches('input, select, button, textarea') || event.ctrlKey || event.metaKey || event.altKey) return;
  const key = event.key.toLowerCase();
  if (key === ' ') { event.preventDefault(); pause(); }
  if (key === 'f') $('fail').click();
  if (key === 'h') $('restore').click();
});

function pointToSegment(px, py, a, b) {
  const vx = b.x - a.x, vy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((px-a.x)*vx+(py-a.y)*vy) / (vx*vx+vy*vy)));
  return Math.hypot(px-(a.x+t*vx),py-(a.y+t*vy));
}
function locate(event) {
  const bounds = graphCanvas.getBoundingClientRect();
  const x = event.clientX - bounds.left, y = event.clientY - bounds.top;
  const nodes = simulator.network.nodes;
  const points = Object.fromEntries(nodes.map(node => [node.id, position(node, bounds.width, bounds.height)]));
  const nearestNode = nodes.find(node => Math.hypot(points[node.id].x-x, points[node.id].y-y) < 21);
  if (nearestNode) return { node: nearestNode, link: null, x, y };
  const nearest = simulator.network.links
    .map(link => ({ link, distance: pointToSegment(x, y, points[link.a], points[link.b]) }))
    .sort((a,b) => a.distance-b.distance)[0];
  return { node: null, link: nearest?.distance < 13 ? nearest.link : null, x, y };
}
graphCanvas.addEventListener('pointermove', event => {
  const point = locate(event);
  if (dragging) {
    const bounds = graphCanvas.getBoundingClientRect();
    const padx = Math.min(64, Math.max(30, bounds.width * .055));
    const pady = Math.min(52, Math.max(28, bounds.height * .105));
    dragging.x = Math.min(.97, Math.max(.03, (point.x-padx)/(bounds.width-2*padx)));
    dragging.y = Math.min(.96, Math.max(.06, (point.y-pady)/(bounds.height-2*pady)));
  }
  hoverNode = point.node?.id ?? null;
  hoverLink = point.link?.id ?? null;
  graphCanvas.style.cursor = dragging ? 'grabbing' : hoverNode ? 'grab' : hoverLink ? 'pointer' : 'crosshair';
});
graphCanvas.addEventListener('pointerdown', event => {
  const point = locate(event);
  if (point.node) {
    dragging = point.node;
    graphCanvas.setPointerCapture(event.pointerId);
    graphCanvas.style.cursor = 'grabbing';
  } else if (point.link) {
    selectedLink = point.link.id;
    updateUI(true);
  }
});
graphCanvas.addEventListener('pointerup', () => { dragging = null; });
graphCanvas.addEventListener('pointercancel', () => { dragging = null; });
graphCanvas.addEventListener('pointerleave', () => { hoverNode = null; hoverLink = null; });

function updateUI(force = false) {
  const s = simulator.snapshot();
  $('metric-delivered').textContent = s.delivered.toLocaleString();
  $('metric-dropped').textContent = s.dropped.toLocaleString();
  $('metric-latency').textContent = s.delivered ? Math.round(s.avgTransit).toLocaleString() : '—';
  $('metric-cost').textContent = s.route ? Math.round(s.route.cost) : '∞';
  $('delivery-rate').textContent = `${Math.round(s.deliveryRate)}% DELIVERY EFFICIENCY`;
  const down = simulator.network.links.filter(l => !l.up).length;
  $('link-health').textContent = `${13-down}/13 HEALTHY`;
  $('route-status').textContent = s.route ? 'CONNECTED' : 'OFFLINE';
  $('route-status').classList.toggle('offline', !s.route);
  const route = $('route-nodes');
  const labels = s.route?.nodes ?? [];
  const key = labels.join(',');
  if (route.dataset.path !== key) {
    route.replaceChildren();
    if (!labels.length) route.textContent = 'NO VIABLE ROUTE';
    else labels.forEach((node, index) => {
      if (index) { const arrow = document.createElement('span'); arrow.className='route-arrow';arrow.textContent='›';route.append(arrow); }
      const span = document.createElement('span');span.className='route-node';span.textContent=names[node];route.append(span);
    });
    route.dataset.path = key;
  }
  const chosen = simulator.network.links.find(l => l.id === selectedLink);
  $('toggle-link').disabled = !chosen;
  if (chosen) {
    $('inspect-title').textContent = `${names[chosen.a]} ↔ ${names[chosen.b]}`;
    $('inspect-description').textContent = `Routing cost: ${chosen.cost} · Capacity: ${chosen.capacity} packets/s · ${chosen.up ? 'ONLINE' : 'FAILED'}`;
    $('toggle-link').textContent = chosen.up ? '✕ Disable selected link' : '✓ Restore selected link';
  } else {
    $('inspect-title').textContent='Select a connection';
    $('inspect-description').textContent='Click any line in the network to inspect cost, capacity, and status.';
    $('toggle-link').textContent='Toggle selected link';
  }
  const latestSample = simulator.samples.at(-1)?.time ?? -1;
  if (force || latestSample !== lastSamples) {
    lastSamples = latestSample;
    renderHistory(chartCanvas, simulator.samples);
  }
  const eventKey = simulator.events.map(e => e.time + ':' + e.message).join('|');
  if (force || lastEvents !== eventKey) {
    lastEvents = eventKey;
    const list = $('event-list');list.replaceChildren();
    for (const item of simulator.events.slice(0, 7)) {
      const li = document.createElement('li');
      const clock = document.createElement('span');clock.className='event-time';clock.textContent=`T+${(item.time/1000).toFixed(1)}s`;
      const msg = document.createElement('span');msg.className='event-text '+item.kind;msg.textContent=item.message;
      li.append(clock,msg);list.append(li);
    }
  }
}

function frame(timestamp) {
  const delta = timestamp - lastFrame;
  lastFrame = timestamp;
  if (!paused) simulator.step(delta);
  renderNetwork(graphCanvas, simulator, { hoverLink, selectedLink, hoverNode, time: timestamp, paused });
  $('timecode').textContent = `T+${(simulator.now/1000).toFixed(1).padStart(5, '0')}s`;
  if (timestamp-lastUI > 200) { updateUI(); lastUI = timestamp; }
  requestAnimationFrame(frame);
}
const observer = new ResizeObserver(() => {
  sizeCanvas(graphCanvas);sizeCanvas(chartCanvas);
  renderNetwork(graphCanvas, simulator);
  renderHistory(chartCanvas, simulator.samples);
});
observer.observe(graphCanvas);observer.observe(chartCanvas);
document.addEventListener('visibilitychange', () => { lastFrame = performance.now(); });
sizeCanvas(graphCanvas);sizeCanvas(chartCanvas);
updateUI(true);
requestAnimationFrame(frame);
