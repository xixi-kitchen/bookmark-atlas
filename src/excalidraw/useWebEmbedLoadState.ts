import { useCallback, useEffect, useState } from 'react';

export const WEB_EMBED_SLOW_MS = 20_000;
type Phase = 'idle' | 'waiting' | 'slow' | 'loaded';
type LoadState = { requestKey: string | null; phase: Phase };

/** A load event is a signal, not proof that a cross-origin page or player works. */
export function useWebEmbedLoadState(requestKey: string | null) {
  const initialPhase = requestKey === null ? 'idle' : 'waiting';
  const [state, setState] = useState<LoadState>({ requestKey, phase: initialPhase });
  const phase = state.requestKey === requestKey ? state.phase : initialPhase;
  // Reset before commit so a cached iframe's early load cannot be erased by an effect.
  if (state.requestKey !== requestKey) setState({ requestKey, phase: initialPhase });

  useEffect(() => {
    if (requestKey === null || phase !== 'waiting') return;
    const timer = window.setTimeout(() => {
      setState((current) => current.requestKey === requestKey && current.phase === 'waiting'
        ? { requestKey, phase: 'slow' } : current);
    }, WEB_EMBED_SLOW_MS);
    return () => window.clearTimeout(timer);
  }, [requestKey, phase]);

  const onLoad = useCallback(() => {
    setState((current) => current.requestKey === requestKey && current.phase !== 'loaded'
      ? { requestKey, phase: 'loaded' } : current);
  }, [requestKey]);

  return { phase, onLoad };
}
