// Node.js polyfills for browser - loaded FIRST


(function() {
  // Save original descriptors
  const originalObject = Object;
  
  // Ensure globalThis exists
  if (typeof globalThis === 'undefined') {
    (window as any).globalThis = window;
  }
  
  // Make process unconfigurable and non-writable
  const processDescriptor = {
    value: {
      env: {},
      version: '',
      versions: { node: '' },
      release: { name: 'browser' },
      platform: 'browser',
      browser: true,
      stdout: undefined,
      stderr: undefined,
      stdin: undefined,
      get isTTY() { return undefined; },
      cwd: () => '/',
      nextTick: (fn: Function) => setTimeout(fn, 0),
      hrtime: () => [0, 0],
      hrtimeBigInt: () => BigInt(0),
      memoryUsage: () => ({ rss: 0, heapTotal: 0, heapUsed: 0, external: 0 }),
      uptime: () => 0,
      pid: 1,
      ppid: 1,
      argv: [],
      execPath: '/',
      title: 'browser',
    },
    writable: true,
    configurable: false,
    enumerable: true,
  };
  
  try {
    Object.defineProperty(window, 'process', processDescriptor);
  } catch (e) {
    console.log('Could not define process:', e);
  }
  
  // Also set on global
  try {
    (window as any).global = window.globalThis;
  } catch (e) {}
  
  // Polyfill Buffer if needed
  if (typeof window.Buffer === 'undefined') {
    (window as any).Buffer = {
      isBuffer: () => false,
      isEncoding: () => false,
      concat: () => '',
      byteLength: () => 0,
      from: () => ({}),
      alloc: () => ({}),
      allocUnsafe: () => ({}),
      allocUnsafeSlow: () => ({}),
    };
  }
  
  
})();
