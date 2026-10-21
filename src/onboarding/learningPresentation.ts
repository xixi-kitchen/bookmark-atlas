/** Hold a browser-wide lock while a guide/invitation is visible, never while idle. */
let localOwner = false;

export async function acquireLearningPresentation(): Promise<(() => void) | null> {
  if (typeof globalThis.navigator?.locks?.request === 'function') {
    return new Promise((resolve) => {
      void navigator.locks.request('bookmark-atlas:learning-presentation', { ifAvailable: true }, async (lock) => {
        if (!lock) { resolve(null); return; }
        let release!: () => void;
        const held = new Promise<void>((done) => { release = done; });
        resolve(release);
        await held;
      }).catch(() => resolve(null));
    });
  }
  // Preview/test runtimes may not expose Web Locks. Chrome extension pages do.
  if (localOwner) return null;
  localOwner = true;
  let released = false;
  return () => { if (!released) { released = true; localOwner = false; } };
}
