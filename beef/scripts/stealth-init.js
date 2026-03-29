// Stealth patches for Playwright browser automation.
// Loaded via context.addInitScript() before any page scripts execute.
// All hardware values form a consistent device profile:
//   Intel UHD 630 (Mesa, Linux) + 8GB RAM + 4 cores
// This matches a common Ubuntu workstation — plausible for residential proxy use.

// 1. Hide automation indicator
Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

// 2. Remove Playwright-specific globals
delete window.__playwright__binding__;
delete window.__pwInitScripts;
delete window.__playwright_target__;
delete window.__playwright_builtins__;

// 3. Consistent language fingerprint
Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });

// 4. Browser plugins (empty array = instant bot flag)
try {
  const plugins = [
    { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
    { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
    { name: 'Native Client', filename: 'internal-nacl-plugin' },
  ];
  if (typeof PluginArray !== 'undefined') {
    plugins.__proto__ = PluginArray.prototype;
  }
  Object.defineProperty(navigator, 'plugins', { get: () => plugins });
} catch (_) {
  // PluginArray may not be available in all contexts (workers, service workers)
}

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

// 8. Device memory — consistent with Intel UHD 630 desktop profile
Object.defineProperty(navigator, 'deviceMemory', {
  get: () => 8,
  configurable: true,
});

// 9. Hardware concurrency — consistent with quad-core Intel (UHD 630 = desktop i5/i7)
Object.defineProperty(navigator, 'hardwareConcurrency', {
  get: () => 4,
  configurable: true,
});

// 10. WebGL renderer — consistent Intel UHD 630 on Ubuntu with Mesa drivers.
// Covers both WebGLRenderingContext and WebGL2RenderingContext.
// UNMASKED_VENDOR_WEBGL = 0x9245, UNMASKED_RENDERER_WEBGL = 0x9246
const WEBGL_VENDOR = 'Google Inc. (Intel)';
const WEBGL_RENDERER = 'ANGLE (Intel, Mesa Intel(R) UHD Graphics 630, OpenGL 4.6)';

function patchWebGLGetParameter(proto) {
  if (!proto) return;
  const original = proto.getParameter;
  proto.getParameter = function (parameter) {
    if (parameter === 0x9245) return WEBGL_VENDOR;
    if (parameter === 0x9246) return WEBGL_RENDERER;
    return original.call(this, parameter);
  };
}

patchWebGLGetParameter(
  typeof WebGLRenderingContext !== 'undefined' ? WebGLRenderingContext.prototype : null,
);
patchWebGLGetParameter(
  typeof WebGL2RenderingContext !== 'undefined' ? WebGL2RenderingContext.prototype : null,
);
