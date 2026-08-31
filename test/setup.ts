import '@testing-library/jest-dom/vitest';

const memory = new Map<string, string>();
const localStorageMock: Storage = {
  get length() { return memory.size; },
  clear: () => memory.clear(),
  getItem: (key) => memory.get(key) ?? null,
  key: (index) => Array.from(memory.keys())[index] ?? null,
  removeItem: (key) => { memory.delete(key); },
  setItem: (key, value) => { memory.set(key, String(value)); },
};

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, configurable: true });

class ResizeObserverMock implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

Object.defineProperty(globalThis, 'ResizeObserver', { value: ResizeObserverMock, configurable: true });

Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  value: () => ({}),
  configurable: true,
});
