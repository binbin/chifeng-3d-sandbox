import { chromium, devices } from 'playwright';
import fs from 'fs';
import path from 'path';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8765';
const OUT = path.resolve('scripts/out');
fs.mkdirSync(OUT, { recursive: true });

const results = [];
function ok(name, pass, detail) {
  results.push({ name, pass, detail: detail || '' });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
}

async function run(label, contextOptions) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push('console: ' + msg.text());
  });

  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, `${label}-01-intro.png`), fullPage: true });

  // WebGL canvas exists
  const hasCanvas = await page.locator('#canvas-wrap canvas').count();
  ok(`${label}: WebGL canvas`, hasCanvas > 0);

  // Enter
  await page.click('#enter-btn');
  await page.waitForTimeout(2200);
  await page.screenshot({ path: path.join(OUT, `${label}-02-overview.png`) });

  // Level bar shows 全市
  const levelText = await page.locator('#level-bar').innerText();
  ok(`${label}: level bar city`, levelText.includes('赤峰市'), levelText.replace(/\n/g, ' '));

  // Open list (may already be open on mobile enter)
  let sidebarVisible = await page.locator('#sidebar').evaluate((el) => {
    const st = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return st.opacity !== '0' && r.height > 40 && r.top < window.innerHeight && r.bottom > 0;
  });
  if (!sidebarVisible) {
    await page.click('#tb-list', { force: true });
    await page.waitForTimeout(500);
    sidebarVisible = await page.locator('#sidebar').evaluate((el) => {
      const st = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return st.opacity !== '0' && r.height > 40 && r.top < window.innerHeight && r.bottom > 0;
    });
  }
  ok(`${label}: sidebar/list opens`, sidebarVisible);

  // Districts tab count
  const districtCount = await page.locator('#tab-districts .item').count();
  ok(`${label}: 12 districts listed`, districtCount === 12, `count=${districtCount}`);

  // Click a district (克什克腾)
  const distItem = page.locator('#tab-districts .item', { hasText: '克什克腾旗' }).first();
  await distItem.scrollIntoViewIfNeeded();
  await distItem.click({ force: true });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: path.join(OUT, `${label}-03-district.png`) });
  const cardName = await page.locator('#card-name').innerText();
  ok(`${label}: district card`, cardName.includes('克什克腾'), cardName);
  const level2 = await page.locator('#level-bar').innerText();
  ok(`${label}: breadcrumb district`, level2.includes('克什克腾'), level2.replace(/\n/g, ' '));

  // Spots tab
  await page.locator('#tab-switch button[data-tab="spots"]').click({ force: true });
  await page.waitForTimeout(300);
  const spotCount = await page.locator('#tab-spots .item').count();
  ok(`${label}: spots in district`, spotCount > 0, `count=${spotCount}`);

  // Click first spot
  await page.locator('#tab-spots .item').first().click();
  await page.waitForTimeout(1800);
  await page.screenshot({ path: path.join(OUT, `${label}-04-spot.png`) });
  const spotName = await page.locator('#card-name').innerText();
  ok(`${label}: spot card`, spotName.length > 0, spotName);
  const desc = await page.locator('#card-desc').innerText();
  ok(`${label}: spot desc`, desc.length > 20, `${desc.length} chars`);

  // Close-in
  await page.click('#card-closein');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(OUT, `${label}-05-closein.png`) });

  // Theme night
  await page.click('#theme-night');
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, `${label}-06-night.png`) });
  const nightActive = await page.locator('#theme-night').evaluate((el) => el.classList.contains('active'));
  ok(`${label}: night theme`, nightActive);

  // Back to city
  await page.click('#tb-overview');
  await page.waitForTimeout(1600);
  await page.screenshot({ path: path.join(OUT, `${label}-07-back-city.png`) });
  const level3 = await page.locator('#level-bar').innerText();
  ok(`${label}: back to city`, level3.includes('赤峰市'), level3.replace(/\n/g, ' '));

  // Top view
  await page.click('#tb-top');
  await page.waitForTimeout(1400);
  await page.screenshot({ path: path.join(OUT, `${label}-08-top.png`) });

  // Photo export：点击工具栏拍照（会先 render 再 toDataURL）
  const downloadPromise = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
  await page.click('#tb-photo');
  const download = await downloadPromise;
  const photoOk = !!download;
  ok(`${label}: photo export`, photoOk, download ? download.suggestedFilename() : 'no download');

  // Click on 3D canvas center to pick (may or may not hit)
  await page.mouse.click(contextOptions.viewport.width / 2, contextOptions.viewport.height / 2);
  await page.waitForTimeout(800);

  // Filter chips
  await page.locator('#tab-switch button[data-tab="spots"]').click();
  await page.locator('#tab-spots .chip', { hasText: '地质奇观' }).click();
  await page.waitForTimeout(300);
  const geoCount = await page.locator('#tab-spots .item').count();
  ok(`${label}: category filter`, geoCount >= 1 && geoCount < 22, `geo=${geoCount}`);

  ok(`${label}: no page errors`, errors.length === 0, errors.slice(0, 5).join(' | '));

  await browser.close();
  return errors;
}

const desktop = {
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1
};
const mobile = {
  ...devices['iPhone 13']
};

await run('desktop', desktop);
await run('mobile', mobile);

const failed = results.filter((r) => !r.pass);
console.log('\n==== SUMMARY ====');
console.log(`total=${results.length} pass=${results.length - failed.length} fail=${failed.length}`);
if (failed.length) {
  failed.forEach((f) => console.log('FAIL:', f.name, f.detail));
  process.exit(1);
}
console.log('ALL FEATURES VERIFIED');
