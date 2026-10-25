// Start manually with `node test/fixtures/embed-lab-server.mjs`.
// Controlled localhost-only test responses, not an extension or production server.
import { createServer } from 'node:http';
const counts = new Map();
const server = createServer((request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1:5199');
  if (url.pathname === '/metrics') {
    response.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    response.end(JSON.stringify(Object.fromEntries(counts))); return;
  }
  const id = (url.searchParams.get('id') || 'sample').replace(/[^a-z0-9-]/gi, '').slice(0, 30);
  const key = `${url.pathname}?id=${id}`;
  counts.set(key, (counts.get(key) || 0) + 1);
  const reply = () => {
    const denied = url.pathname === '/denied';
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
      ...(denied ? { 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "frame-ancestors 'none'" } : {}) });
    response.end(`<!doctype html><html lang="en"><head><title>Local embed ${id}</title></head><body style="margin:8px;background:#fafafa;font:14px sans-serif"><h2 style="font-size:16px">Local ${url.pathname === '/video' ? 'synthetic muted video' : 'webpage'} ${id}</h2><p>No external requests or private data.</p>${url.pathname === '/video' ? '<video id="video" muted autoplay playsinline controls style="width:200px;height:110px"></video><canvas id="source" width="200" height="110" hidden></canvas>' : '<p>Webpage content stays mounted during canvas changes.</p>'}<script>
      const id=${JSON.stringify(id)},boot=crypto.randomUUID(),video=document.getElementById('video');
      if(video){const canvas=document.getElementById('source'),context=canvas.getContext('2d');let n=0;setInterval(()=>{context.fillStyle=n++%2?'#7269da':'#b1a9ef';context.fillRect(0,0,200,110);context.fillStyle='#fff';context.font='16px sans-serif';context.fillText('Local video '+n,18,60);},200);video.srcObject=canvas.captureStream(5);video.muted=true;void video.play().catch(()=>{});}
      setInterval(()=>parent.postMessage({type:'embed-lab',id,boot,time:video?.currentTime||0},'http://127.0.0.1:5197'),500);
      </script></body></html>`);
  };
  if (url.pathname === '/slow') {
    const timer = setTimeout(reply, 25_000); response.on('close', () => clearTimeout(timer));
  } else reply();
});
server.listen(5199, '127.0.0.1', () => console.log('Controlled embed responses: http://127.0.0.1:5199'));
