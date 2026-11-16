// Takes the screenshots in shots.json with the local chrome-headless-shell:
//   node shots.mjs [--port 8080]
// Serves game/ from this repo, loads each ?shot= URL at 1280x720, waits for
// window.__shotReady, saves a JPEG into screenshots/. Prints console errors.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const port = Number(process.argv.find((a, i, arr) => arr[i - 1] === '--port') ?? 8901);
const shots = JSON.parse(readFileSync(join(here, 'shots.json'), 'utf8'));
const SHELL = '/home/hatch/workspace/make-fun/chrome-headless-shell-linux64/chrome-headless-shell';

const server = spawn(process.execPath, ['serve.ts', '--port', String(port)], { cwd: here, stdio: 'pipe' });
await new Promise((resolve) => setTimeout(resolve, 1500));

const browser = await chromium.launch({
  executablePath: SHELL,
  args: ['--no-sandbox', '--no-proxy-server', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--disable-dev-shm-usage'],
});
try {
  for (const shot of shots) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('console', (msg) => {
      if (msg.type() === 'error') console.log(`[${shot.name}] console error:`, msg.text().slice(0, 300));
    });
    page.on('pageerror', (err) => console.log(`[${shot.name}] page error:`, String(err).slice(0, 300)));
    await page.goto(`http://127.0.0.1:${port}/index.html${shot.query}`, { waitUntil: 'load', timeout: 30000 });
    try {
      await page.waitForFunction(() => window.__shotReady === true, { timeout: 30000 });
    } catch {
      console.log(`[${shot.name}] WARNING: __shotReady never fired`);
    }
    await page.waitForTimeout(300);
    const out = join(here, 'screenshots', shot.name);
    await page.screenshot({ path: out, type: 'jpeg', quality: 82 });
    console.log(`[${shot.name}] saved`);
    await page.close();
  }
} finally {
  await browser.close();
  server.kill();
}
console.log('done');
