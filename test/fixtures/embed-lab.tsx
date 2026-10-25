// Test-only lab: no extension API, user bookmarks, credentials or production imports.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { WebEmbed } from '../../src/excalidraw/WebEmbed';
import { getUiLanguage } from '../../src/i18n';
import { initializeLanguagePreference, setLanguagePreference } from '../../src/i18n/languagePreference';
import '../../entrypoints/newtab/style.css';

function Lab() {
  const [tick, setTick] = useState(0);
  const [active, setActive] = useState<string | null>(null);
  const [uiLanguage, setUiLanguage] = useState<'en' | 'zh-CN'>(getUiLanguage());
  const [special, setSpecial] = useState(false);
  const [result, setResult] = useState('Not measured');
  const [count, setCount] = useState(16);
  const media = useRef<Record<string, { boot: string; time: number }>>({});
  const exit = useCallback(() => setActive(null), []);

  useEffect(() => {
    const report = (event: MessageEvent) => {
      if (event.origin !== 'http://127.0.0.1:5199' || event.data?.type !== 'embed-lab') return;
      media.current[String(event.data.id)] = { boot: String(event.data.boot), time: Number(event.data.time) };
      document.querySelector('#media-times')!.textContent = JSON.stringify(media.current);
    };
    window.addEventListener('message', report);
    return () => window.removeEventListener('message', report);
  }, []);

  const benchmark = () => {
    const frames = [...document.querySelectorAll('iframe')];
    const sources = frames.map((frame) => frame.src);
    const beforeMedia = structuredClone(media.current);
    const NativeURL = globalThis.URL;
    let urlParses = 0;
    class CountedURL extends NativeURL {
      constructor(input: string | URL, base?: string | URL) {
        super(input, base);
        if (String(input).startsWith('http://127.0.0.1:5199/')) urlParses += 1;
      }
    }
    const start = performance.now();
    globalThis.URL = CountedURL;
    try {
      for (let index = 0; index < 30; index += 1) flushSync(() => setTick((value) => value + 1));
    } finally { globalThis.URL = NativeURL; }
    const elapsedMs = performance.now() - start;
    const after = [...document.querySelectorAll('iframe')];
    setResult(JSON.stringify({ count: frames.length, parentCommits: 30, urlParses, elapsedMs,
      sameFrames: frames.length === after.length && frames.every((frame, index) => frame === after[index]),
      sameSources: sources.every((src, index) => src === after[index]?.src), beforeMedia, afterMedia: media.current }, null, 2));
  };

  const items = Array.from({ length: count }, (_, index) => ({
    id: `lab-${index}`, url: `http://127.0.0.1:5199/${index < 2 ? 'video' : 'page'}?id=${index}`,
  }));
  if (special) items.push({ id: 'slow', url: 'http://127.0.0.1:5199/slow?id=slow' }, { id: 'denied', url: 'http://127.0.0.1:5199/denied?id=denied' });

  return <main style={{ padding: 16, background: '#f8f8fb' }}>
    <h1 style={{ fontSize: 22 }}>Controlled local embed lab — not a production page</h1>
    <p>Only local synthetic pages/video. No real browser bookmarks or model service.</p>
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBlock: 12 }}>
      <button onClick={benchmark}>Run 30 parent updates</button>
      <button onClick={() => setCount(32)}>Use 32 frames</button>
      <button onClick={() => setSpecial(true)}>Add slow and denied pages</button>
      <button onClick={() => { void setLanguagePreference(uiLanguage === 'en' ? 'zh-CN' : 'en').then(() => setUiLanguage(uiLanguage === 'en' ? 'zh-CN' : 'en')); }}>Switch language</button>
      <button onClick={exit}>Exit interaction</button>
    </div>
    <pre id="benchmark-result" style={{ whiteSpace: 'pre-wrap', fontSize: 12, maxHeight: 200, overflow: 'auto' }}>{result}</pre>
    <output id="media-times" style={{ display: 'block', fontSize: 12 }}>Waiting for synthetic video</output>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(270px,1fr))', gap: 16, transform: `translateX(${tick % 2}px)` }}>
      {items.map(({ id, url }) => <section key={id} style={{ height: 250, border: '1px solid #bbb', borderRadius: 8 }}>
        <button onClick={() => setActive(id)}>Interact {id}</button>
        <div style={{ height: 220 }}><WebEmbed elementId={id} url={url} active={active === id} onExitInteraction={exit} {...{ uiLanguage }} /></div>
      </section>)}
    </div>
  </main>;
}

void initializeLanguagePreference().then(() => createRoot(document.getElementById('root')!).render(<Lab />));
