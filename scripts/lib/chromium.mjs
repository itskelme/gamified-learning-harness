// The Chromium used to print study PDFs and to run the browser suites: CHROMIUM_EXECUTABLE first, then system
// installs, then the newest Playwright download in ~/.cache/ms-playwright (README "Chromium").
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export function findChromium() {
  const candidates = [process.env.CHROMIUM_EXECUTABLE, '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  // Playwright's download folder: ~/.cache/ms-playwright on Linux, %LOCALAPPDATA%/ms-playwright on Windows.
  const caches = [[join(process.env.HOME || '', '.cache/ms-playwright'), 'chrome-linux64/chrome']];
  if (process.env.LOCALAPPDATA) caches.push([join(process.env.LOCALAPPDATA, 'ms-playwright'), 'chrome-win64/chrome.exe']);
  for (const [cache, exe] of caches) {
    if (existsSync(cache)) for (const d of readdirSync(cache).filter(d => /^chromium-\d+$/.test(d)).sort().reverse()) candidates.push(join(cache, d, exe));
  }
  return candidates.find(c => c && existsSync(c)) || null;
}

export const PDF_OPTIONS = {
  format: 'A4', printBackground: true, margin: { top: '16mm', bottom: '16mm', left: '14mm', right: '14mm' }, displayHeaderFooter: true,
  headerTemplate: '<span></span>', footerTemplate: '<div style="font-size:8pt;width:100%;text-align:center"><span class="pageNumber"></span> / <span class="totalPages"></span></div>'
};
