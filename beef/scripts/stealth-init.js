// Stealth patches for Playwright browser automation.
// Loaded via page.addInitScript() before any page scripts execute.
// 10 patches covering navigator, window, permissions, and WebGL vectors.

// 1. Hide automation indicator
Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

// 2. Remove Playwright-specific globals
delete window.__playwright__binding__;
delete window.__pwInitScripts;
delete window.__playwright_target__;

// 3. Consistent language fingerprint
Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });

// 4. Browser plugins (empty array = instant bot flag)
Object.defineProperty(navigator, 'plugins', {
  get: () => {
    const plugins = [
      { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
      { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
      { name: 'Native Client', filename: 'internal-nacl-plugin' },
    ];
    plugins.__proto__ = PluginArray.prototype;
    return plugins;
  },
});

// 5. window.chrome object (Twitter checks chrome.runtime)
if (!window.chrome) {
  window.chrome = {
    app: { isInstalled: false, getDetails: () => null, getIsInstalled: () => false },
    runtime: {
      PlatformOs: { MAC: 'mac', WIN: 'win', ANDROID: 'android', CROS: 'cros', LINUX: 'linux' },
      PlatformArch: { ARM: 'arm', X86_32: 'x86-32', X86_64: 'x86-64' },
      connect: () => {},
      sendMessage: () => {},
    },
  };
}

// 6. Permissions API — fix notifications query behavior
const originalQuery = window.navigator.permissions.query.bind(window.navigator.permissions);
window.navigator.permissions.query = (parameters) =>
  parameters.name === 'notifications'
    ? Promise.resolve({ state: Notification.permission })
    : originalQuery(parameters);

// 7. outerWidth/Height (0 in headless — safety for Xvfb headful)
if (window.outerWidth === 0) {
  Object.defineProperty(window, 'outerWidth', { get: () => window.innerWidth });
  Object.defineProperty(window, 'outerHeight', { get: () => window.innerHeight });
}

// 8. Device memory (undefined in automation contexts)
if (!navigator.deviceMemory) {
  Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
}

// 9. Hardware concurrency
if (!navigator.hardwareConcurrency || navigator.hardwareConcurrency < 2) {
  Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 4 });
}

// 10. WebGL renderer — hide SwiftShader/software rendering
const getParameter = WebGLRenderingContext.prototype.getParameter;
WebGLRenderingContext.prototype.getParameter = function (parameter) {
  if (parameter === 37445) return 'Intel Inc.';
  if (parameter === 37446) return 'Intel Iris OpenGL Engine';
  return getParameter.call(this, parameter);
};
