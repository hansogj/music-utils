// Basic localStorage polyfill for Node.js environments
Object.defineProperty(global, 'localStorage', {
  value: {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
    key: () => null,
    length: 0,
  },
  writable: true,
});
