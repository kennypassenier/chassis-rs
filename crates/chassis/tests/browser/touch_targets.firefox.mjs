// Touch-target audit of the kit chrome on Firefox only (a release check, not
// part of the cargo suite). Under a coarse pointer every interactive element
// the kit owns must be at least 44 x 44 px; at 1280 px nothing may move.
//
//   PLAYWRIGHT_DIR=<node_modules with playwright> INBOX_BIN=<path to the inbox example binary> \
//     [OUT=<json file for before/after comparison>] node crates/chassis/tests/browser/touch_targets.firefox.mjs
//
// Coarse pointer: Playwright's `hasTouch: true` makes Firefox report
// (pointer: coarse), (any-pointer: coarse) and (hover: none); the script
// asserts that before measuring. The phone case also checks the tab bar: no
// label may overflow its tab (a word is never broken).
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const MIN = 44;
const PAGES = [['login', '/login'], ['status', '/'], ['storage', '/storage'], ['clients', '/clients']];
// kp-themes' own parts: their size is the package's (a hit area drawn by a
// pseudo-element for the uptime cell and the switch, which a rectangle cannot
// see; the sort headers, which have none yet). Reported, never failed here;
// they are listed for kp-themes.
const KP_OWNED = '.kp-uptime__cell, .kp-switch__input, .kp-stackbar__seg, th';
const INTERACTIVE = 'a[href], button, [role=button], [role=tab], [role=menuitem], input:not([type=hidden]), select, textarea, th[aria-sort], th[data-kp-sortable], summary';

function loadPlaywright() {
    const dir = process.env.PLAYWRIGHT_DIR;
    if (!dir) throw new Error('PLAYWRIGHT_DIR is not set (a node_modules directory that has playwright).');
    return createRequire(join(dir, 'x.js'))('playwright');
}

async function startInbox(bin) {
    const state = mkdtempSync(join(process.env.TOUCH_SCRATCH ?? tmpdir(), 'touch-state-'));
    const env = { PATH: process.env.PATH, INBOX_TOKEN: 'a-login-token-that-is-long-enough', INBOX_SECRET_KEY: 'ab'.repeat(32), INBOX_PUBLIC_URL: 'https://inbox.example.lan', INBOX_STATE_DIR: state };
    const child = spawn(bin, ['--listen', '127.0.0.1:0'], { env, stdio: ['ignore', 'ignore', 'pipe'] });
    const addr = await new Promise((res, rej) => {
        let buf = '';
        child.stderr.on('data', (d) => { buf += d; const m = buf.match(/listening[^\n]*?(127\.0\.0\.1:\d+)/); if (m) res(m[1]); });
        setTimeout(() => rej(new Error('no address: ' + buf)), 15000);
    });
    return { child, base: 'http://' + addr };
}

// Runs in the page: one row per visible interactive element.
function measure(selector) {
    const name = (el) => el.tagName.toLowerCase() + [...el.classList].filter((c) => c.startsWith('kp-') || c.startsWith('chassis-') || c.startsWith('storage')).map((c) => '.' + c).join('');
    return [...document.querySelectorAll(selector)].map((el) => {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height || getComputedStyle(el).visibility === 'hidden') return null;
        return { sel: name(el), text: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 24), w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, x: Math.round(r.x), y: Math.round(r.y + scrollY) };
    }).filter(Boolean);
}

function tabbarOverflow() {
    return [...document.querySelectorAll('.chassis-tabbar .kp-tabbar__label')]
        .filter((l) => l.scrollWidth > l.clientWidth + 1 || l.scrollHeight > l.clientHeight + 1)
        .map((l) => l.textContent.trim());
}

// The phone bar of an app with five pages and More (Almanac: Status, Calendars,
// Deliveries, History, Try a source): the labels must wrap between words only
// and step down until no word is cut. Returns what overflows and any size.
async function stressTabbar(page) {
    await page.evaluate(() => {
        const bar = document.querySelector('.chassis-tabbar');
        const tabs = [...bar.querySelectorAll('a.kp-tabbar__tab')];
        const more = bar.querySelector('.kp-tabbar__tab--more');
        ['Calendars', 'Deliveries', 'History', 'Try a source'].forEach((word, i) => {
            const tab = (tabs[i + 1] ?? tabs[0]).cloneNode(true);
            tab.removeAttribute('aria-current');
            tab.querySelector('.kp-tabbar__label').textContent = word;
            bar.insertBefore(tab, more);
        });
    });
    await page.setViewportSize({ width: 391, height: 900 });
    await page.setViewportSize({ width: 390, height: 900 });
    await page.waitForTimeout(500);
    return page.evaluate(() => [...document.querySelectorAll('.chassis-tabbar .kp-tabbar__label')].map((l) => ({
        text: l.textContent.trim(), fit: l.dataset.fit ?? '', px: getComputedStyle(l).fontSize, clipped: l.scrollWidth > l.clientWidth + 1 || l.scrollHeight > l.clientHeight + 1,
    })));
}

const { firefox } = loadPlaywright();
const { child, base } = await startInbox(process.env.INBOX_BIN);
const browser = await firefox.launch();
const out = {};
let failures = 0;
try {
    for (const [label, width, touch] of [['desktop-1280', 1280, false], ['phone-390-touch', 390, true]]) {
        const ctx = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: touch });
        const page = await ctx.newPage();
        await page.goto(base + '/login');
        const coarse = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
        if (coarse !== touch) throw new Error(`${label}: (pointer: coarse) is ${coarse}, expected ${touch}`);
        out[label] = {};
        for (const [name, path] of PAGES) {
            if (name !== 'login' && !out[label].login?.loggedIn) {
                await page.goto(base + '/login');
                await page.fill('input[name=token]', 'a-login-token-that-is-long-enough');
                await Promise.all([page.waitForNavigation(), page.click('button[type=submit]')]);
                out[label].login.loggedIn = true;
            }
            await page.goto(base + path);
            await page.waitForTimeout(2500);
            const rows = await page.evaluate(measure, INTERACTIVE);
            const under = rows.filter((r) => r.w < MIN - 0.5 || r.h < MIN - 0.5);
            const kpOwned = await page.evaluate((sel) => [...document.querySelectorAll(sel)].length, KP_OWNED);
            const small = under.filter((r) => !/^th\b|kp-uptime__cell|kp-switch__input|kp-stackbar__seg/.test(r.sel));
            out[label][name] = { kpOwnedUnder: under.length - small.length, kpOwnedPresent: kpOwned };
            const overflow = touch ? await page.evaluate(tabbarOverflow) : [];
            out[label][name] = { ...out[label][name], rows, small, overflow };
            if (touch) failures += small.length + overflow.length;
        }
        if (touch) {
            await page.goto(base + '/');
            await page.waitForTimeout(1500);
            out[label].tabbarStress = await stressTabbar(page);
            for (const t of out[label].tabbarStress) {
                console.log(`tab bar of six: "${t.text}" fit=${t.fit || '-'} ${t.px}${t.clipped ? ' CLIPPED' : ''}`);
                if (t.clipped) failures += 1;
            }
        }
        await ctx.close();
    }
} finally {
    await browser.close();
    child.kill('SIGTERM');
}
if (process.env.OUT) writeFileSync(process.env.OUT, JSON.stringify(out, null, 1));
for (const [name] of PAGES) {
    for (const r of out['phone-390-touch'][name].small) console.log(`${name}: ${r.sel} "${r.text}" ${r.w}x${r.h}`);
    for (const t of out['phone-390-touch'][name].overflow) console.log(`${name}: tab label overflows: ${t}`);
}
console.log(failures ? `FAIL: ${failures} under ${MIN} px or overflowing` : 'OK: every interactive element is at least 44 x 44 on touch');
process.exit(failures ? 1 : 0);
