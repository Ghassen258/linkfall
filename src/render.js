/** Canvas visualization: crisp at any devicePixelRatio, no canvas framework. */
const MONO = '11px ui-monospace, SFMono-Regular, Consolas, monospace';
const FONT = '600 12px system-ui, -apple-system, Segoe UI, sans-serif';
export function position(node, width, height) {
  const padx = Math.min(64, Math.max(30, width * .055));
  const pady = Math.min(52, Math.max(28, height * .105));
  return { x: padx + node.x * (width - padx * 2), y: pady + node.y * (height - pady * 2) };
}
function roundedRect(ctx, x, y, w, h, r = 8) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
function dot(ctx, x, y, radius, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill(); }
function line(ctx, a, b) { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
function mid(a,b){return {x:(a.x+b.x)/2,y:(a.y+b.y)/2};}

export function renderNetwork(canvas, sim, { hoverLink = null, selectedLink = null, hoverNode = null, time = 0, paused = false } = {}) {
  const { width: w, height: h } = canvas.getBoundingClientRect();
  if (!w || !h) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  const gradient = ctx.createRadialGradient(w * .55, h * .46, 15, w*.55,h*.46, w*.8);
  gradient.addColorStop(0, '#132844'); gradient.addColorStop(.64, '#0d192d'); gradient.addColorStop(1, '#0b1426');
  ctx.fillStyle = gradient; ctx.fillRect(0,0,w,h);

  // Engineering grid and precision crosshairs.
  ctx.strokeStyle = 'rgba(67, 117, 164, .085)';ctx.lineWidth=1;
  for(let x=16;x<w;x+=31){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}
  for(let y=16;y<h;y+=31){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
  ctx.fillStyle='#57718e';ctx.font=MONO;
  ctx.fillText('SIMULATED BACKBONE / 8 NODES',20,24);
  ctx.textAlign='right';ctx.fillText('TOPOLOGY / LIVE',w-20,24);ctx.textAlign='left';

  const nodes = Object.fromEntries(sim.network.nodes.map(n=>[n.id,position(n,w,h)]));
  const activeRoute = sim.route();
  const highlighted = new Set(activeRoute?.links ?? []);

  for(const link of sim.network.links){
    const a=nodes[link.a],b=nodes[link.b];
    const focused=link.id===selectedLink, hovering=link.id===hoverLink;
    const active=link.up && highlighted.has(link.id);
    ctx.save();
    ctx.lineCap='round';ctx.lineWidth=link.up?(focused?5:active?3.5:1.8):2.3;
    ctx.strokeStyle=link.up?(focused?'#edfaac':active?'#3ff2cb':'#385776'):'#e57b8e';
    if(!link.up)ctx.setLineDash([5,8]);
    if(active||focused){ctx.shadowColor=focused?'#d3fd8c':'#3ff2cb';ctx.shadowBlur=14;}
    line(ctx,a,b);ctx.shadowBlur=0;ctx.setLineDash([]);
    // Traveling current pulses on active links.
    if(active && !paused){const ratio=(time*.00019+link.id.charCodeAt(1)*.073)%1;
      dot(ctx,a.x+(b.x-a.x)*ratio,a.y+(b.y-a.y)*ratio,2.1,'#aefff0');}
    if(!link.up){const p=mid(a,b);ctx.font='bold 16px system-ui';ctx.fillStyle='#ff8897';ctx.textAlign='center';ctx.fillText('×',p.x,p.y-5);ctx.textAlign='left';}
    if(focused||hovering){const p=mid(a,b),label=link.up?`${link.cost} cost · ${link.capacity} pkt/s`:'LINK OFFLINE';
      ctx.font=MONO;const tw=ctx.measureText(label).width+20;
      roundedRect(ctx,p.x-tw/2,p.y-26,tw,23,6);ctx.fillStyle='#1e3551';ctx.fill();ctx.strokeStyle=link.up?'#55879c':'#cf778d';ctx.lineWidth=1;ctx.stroke();
      ctx.fillStyle='#e5f5ff';ctx.textAlign='center';ctx.fillText(label,p.x,p.y-11);ctx.textAlign='left';}
    ctx.restore();
  }

  // Actual simulated packets, interpolated along each link.
  for(const packet of sim.packets){
    if(!packet.edge)continue;
    const a=nodes[packet.from],b=nodes[packet.to];if(!a||!b)continue;
    const t=Math.min(1,Math.max(0,(sim.now-packet.startedAt)/packet.travelTime));
    const x=a.x+(b.x-a.x)*t, y=a.y+(b.y-a.y)*t;
    ctx.save();ctx.shadowBlur=16;ctx.shadowColor='#78ebff';dot(ctx,x,y,3.5,'#e1ffff');ctx.shadowBlur=0;
    dot(ctx,x,y,1.8,'#fff');ctx.restore();
  }

  const waitCounts=new Map();for(const p of sim.packets)if(p.node)waitCounts.set(p.node,(waitCounts.get(p.node)||0)+1);
  for(const node of sim.network.nodes){const p=nodes[node.id],source=node.id===sim.source,target=node.id===sim.target,hovering=node.id===hoverNode;
    const halo=source?'#59f7d3':target?'#f4ca79':'#72a3d2';
    ctx.save();
    if(source||target){ctx.strokeStyle=source?'#6cf7d6':'#f4d084';ctx.lineWidth=1.4;ctx.globalAlpha=.47;ctx.beginPath();ctx.arc(p.x,p.y,23+(Math.sin(time*.0027)+1)*3,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;}
    ctx.shadowColor=halo;ctx.shadowBlur=hovering?24:source||target?17:6;
    dot(ctx,p.x,p.y,hovering?15:12,'#102d43');ctx.shadowBlur=0;
    ctx.strokeStyle=halo;ctx.lineWidth=hovering?3:2;ctx.beginPath();ctx.arc(p.x,p.y,hovering?15:12,0,Math.PI*2);ctx.stroke();
    dot(ctx,p.x,p.y,4.1,halo);
    ctx.font=FONT;ctx.textAlign='center';ctx.fillStyle='#effaff';ctx.fillText(node.label,p.x,p.y-25);
    ctx.font=MONO;ctx.fillStyle=source?'#60fbd3':target?'#f1c778':'#7e9cb5';
    ctx.fillText(source?'SOURCE':target?'TARGET':node.role.toUpperCase(),p.x,p.y+31);
    const queued=waitCounts.get(node.id)??0;
    if(queued>0){dot(ctx,p.x+15,p.y-12,9,'#eea955');ctx.font='bold 10px ui-monospace,monospace';ctx.fillStyle='#12223d';ctx.fillText(queued>99?'99+':String(queued),p.x+15,p.y-8);}
    ctx.restore();
  }
  ctx.textAlign='left';ctx.font=MONO;ctx.fillStyle='#6f91ab';
  ctx.fillText(paused?'▣ SIMULATION PAUSED':'▸ DISCRETE EVENT SIMULATION',20,h-18);
  ctx.textAlign='right';ctx.fillText('CLICK LINK: INSPECT · DRAG NODE: MOVE',w-20,h-18);ctx.textAlign='left';
}

export function renderHistory(canvas, samples) {
  const box=canvas.getBoundingClientRect(),w=box.width,h=box.height;if(!w||!h)return;
  const ctx=canvas.getContext('2d');ctx.clearRect(0,0,w,h);
  ctx.strokeStyle='rgba(99,150,177,.18)';ctx.lineWidth=1;
  for(let i=1;i<=3;i++){const y=i*h/4;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
  const max=Math.max(4,...samples.map(x=>Math.max(x.delivered,x.dropped)))*1.3;
  for(const [series,color] of [['delivered','#4df1c4'],['dropped','#ee8299']]) {
    ctx.beginPath();ctx.strokeStyle=color;ctx.lineWidth=2.5;ctx.lineJoin='round';ctx.shadowColor=color;ctx.shadowBlur=8;
    const shown=samples.slice(-42);
    shown.forEach((sample,i)=>{const x=(i/41)*w,y=h-9-(sample[series]/max)*(h-22);if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);});
    ctx.stroke();ctx.shadowBlur=0;
    if(shown.length){const last=shown.at(-1),x=(shown.length-1)/41*w,y=h-9-(last[series]/max)*(h-22);dot(ctx,x,y,3.5,color);}
  }
}
