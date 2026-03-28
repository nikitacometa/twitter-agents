// Stealth patches for Playwright browser automation.
// Loaded via page.addInitScript() before any page scripts execute.

// Hide automation indicator
Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

// Consistent language fingerprint
Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });

// Remove Playwright-specific globals
delete window.__playwright__binding__;
delete window.__pwInitScripts;
