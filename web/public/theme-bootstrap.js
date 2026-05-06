/* Cycle 61 first-paint theme bootstrap.
 *
 * Reads the saved theme id from localStorage synchronously so
 * light-theme users don't see a dark flash before main.tsx + Carbon
 * CSS load. Only built-in Carbon shells (g100/g90/g10/white/blueprint)
 * are recognized here — custom themes fall through to the static
 * #161616 first frame and are upgraded after `applyTheme` runs
 * (~50ms in). The matching map below mirrors the
 * THEME_STORAGE_KEY = 'theme' read in app/theme/useTheme.ts.
 *
 * Loaded as an external script (CSP `script-src 'self'` blocks inline
 * <script> tags). Must execute synchronously before <body> mounts so
 * the very first paint already sees the right --cds-background.
 */
(function () {
  try {
    var saved = window.localStorage.getItem('theme');
    if (!saved) return;
    var carbonClass = null;
    var bg = null;
    if (saved === 'g100' || saved === 'blueprint') {
      carbonClass = 'cds--g100';
      bg = '#161616';
    } else if (saved === 'g90') {
      carbonClass = 'cds--g90';
      bg = '#262626';
    } else if (saved === 'g10' || saved === 'gray-10') {
      carbonClass = 'cds--g10';
      bg = '#f4f4f4';
    } else if (saved === 'white') {
      carbonClass = 'cds--white';
      bg = '#ffffff';
    }
    /* MAIN-DEFAULT and other custom-theme ids resolve to a carbonTheme
     * via the in-app registry; we can't read it here pre-React. Fall
     * through to the static #161616 first frame; applyTheme upgrades
     * once the React tree mounts. */
    if (!carbonClass) return;
    document.documentElement.classList.add(carbonClass);
    document.documentElement.setAttribute('data-carbon-theme', carbonClass.replace('cds--', ''));
    document.documentElement.style.setProperty('--cds-background', bg);
    document.documentElement.style.background = bg;
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', bg);
  } catch (_e) {
    /* localStorage may be unavailable; static defaults already correct. */
  }
})();
