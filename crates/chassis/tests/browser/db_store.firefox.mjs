// The one browser test of the local database's IndexedDB store (db-store.js),
// on Firefox only. Not part of `node --test tests/js`: it needs Playwright and
// a Firefox build, so it runs at a release, on request:
//
//   PLAYWRIGHT_DIR=<a node_modules dir that has playwright> \
//     node crates/chassis/tests/browser/db_store.firefox.mjs
//
// It serves static/chassis/ and db_store_page.mjs from a throwaway local
// server (127.0.0.1, a random port) and runs the page module in Firefox.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const chassisDir = join(here, '../../static/chassis');
const TYPES = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html' };

function loadPlaywright() {
    const dir = process.env.PLAYWRIGHT_DIR;
    if (!dir) throw new Error('PLAYWRIGHT_DIR is not set. Point it at a node_modules directory that contains playwright (the repo installs none).');
    return createRequire(join(dir, 'x.js'))('playwright');
}

/** Map a request path to a file under static/chassis or this folder; null for anything else. */
function fileFor(path) {
    if (path === '/') return { file: join(here, 'db_store.html'), type: 'text/html' };
    if (path === '/page.mjs') return { file: join(here, 'db_store_page.mjs'), type: TYPES['.mjs'] };
    const prefix = '/static/chassis/';
    if (!path.startsWith(prefix)) return null;
    const file = normalize(join(chassisDir, path.slice(prefix.length)));
    return file.startsWith(chassisDir + '/') ? { file, type: TYPES[extname(file)] ?? 'application/octet-stream' } : null;
}

const server = createServer(async (req, res) => {
    const hit = fileFor(new URL(req.url, 'http://x').pathname);
    try {
        if (!hit) throw Object.assign(new Error('not served'), { code: 'ENOENT' });
        res.writeHead(200, { 'content-type': hit.type }).end(await readFile(hit.file));
    } catch (err) {
        res.writeHead(err.code === 'ENOENT' ? 404 : 500).end(String(err.message));
    }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

let browser;
let failed = false;
try {
    const { firefox } = loadPlaywright();
    browser = await firefox.launch();
    const page = await browser.newPage();
    page.on('pageerror', (err) => console.error('page error:', err.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const steps = await page.evaluate(async () => (await import('/page.mjs')).run());
    for (const step of steps) console.log(`ok  ${step}`);
} catch (err) {
    failed = true;
    console.error('FAILED:', err.message);
} finally {
    await browser?.close();
    server.close();
}
process.exit(failed ? 1 : 0);
