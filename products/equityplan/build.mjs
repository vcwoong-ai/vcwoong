// 실행: node products/equityplan/build.mjs
// dist/site/   → 공개 배포용 (랜딩 + 체험판)
// dist/release/ → 판매용 정식판 단일 파일 (공개 배포 금지, 결제 플랫폼에만 업로드)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const read = (p) => readFileSync(join(root, p), 'utf8');
const config = JSON.parse(read('config.json'));
const Engine = require('./src/engine.js');
const example = require('./src/example.js');

const engineJs = read('src/engine.js');
const exampleJs = read('src/example.js');
const appJs = read('src/app.js');
const appCss = read('src/app.css');
const appHtml = read('src/app.html');

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}
// 정규식 치환 문자열의 $ 해석을 피하려고 함수 치환을 쓴다
function fill(tpl, map) {
  return tpl.replace(/\{\{([A-Z_]+)\}\}/g, (m, k) => (k in map ? map[k] : m));
}

function buildApp(edition) {
  const publicConfig = { name: config.name, price: config.price, buyUrl: config.buyUrl };
  return fill(appHtml, {
    NAME: esc(config.name),
    EDITION: edition,
    CONFIG: JSON.stringify(publicConfig).replace(/</g, '\\u003c')
  })
    .replace('/*__STYLE__*/', () => appCss)
    .replace('/*__ENGINE__*/', () => engineJs + '\n' + exampleJs)
    .replace('/*__APP__*/', () => appJs);
}

function won(n) {
  if (n >= 1e8) return (Math.round(n / 1e7) / 10).toString().replace(/\.0$/, '') + '억 원';
  return Math.round(n / 1e4).toLocaleString('ko-KR') + '만 원';
}

function heroNumbers() {
  const sc = example();
  const founders = sc.holders.filter((h) => h.kind === 'common').map((h) => h.name);
  const sim = Engine.simulate(sc);
  const pctOf = (stage) => stage.holders.filter((h) => founders.includes(h.holder)).reduce((s, h) => s + h.pct, 0);
  const rows = sim.stages
    .filter((s) => !s.round || s.round.type === 'priced')
    .map((s) => {
      const p = pctOf(s);
      const label = s.round ? `${s.name} <small class="num">· 주당 ${s.round.price.toLocaleString('ko-KR')}원</small>` : '설립';
      return `          <tr><td>${label}<span class="bar"><i style="width:${(p * 100).toFixed(1)}%"></i></span></td><td class="num">${(p * 100).toFixed(1)}%</td></tr>`;
    })
    .join('\n');
  const last = sim.stages[sim.stages.length - 1];
  const w = Engine.waterfall(last, sc.exitValue, sc.seniority);
  const payout = w.holders.filter((h) => founders.includes(h.holder)).reduce((s, h) => s + h.payout, 0);
  return {
    LEDGER_ROWS: rows,
    FOUNDER_PCT: (pctOf(last) * 100).toFixed(1) + '%',
    EXIT: won(sc.exitValue),
    FOUNDER_PAYOUT: won(payout),
    FOUNDER_PAYOUT_PCT: ((payout / sc.exitValue) * 100).toFixed(1) + '%'
  };
}

const b = config.business || {};
const landing = fill(read('src/landing.html'), {
  NAME: esc(config.name),
  PRICE: esc(config.price),
  TEAM_PRICE: esc(config.teamPrice),
  BUY_URL: esc(config.buyUrl),
  TEAM_BUY_URL: esc(config.teamBuyUrl || config.buyUrl),
  SUPPORT: esc(config.supportEmail),
  SITE_URL: esc(config.siteUrl),
  MAKER_LINE: config.makerLine ? ' ' + esc(config.makerLine) : '',
  BIZ_COMPANY: esc(b.company || ''),
  BIZ_CEO: esc(b.ceo || ''),
  BIZ_NO: esc(b.bizNo || ''),
  BIZ_MAIL_ORDER: esc(b.mailOrderNo || ''),
  BIZ_ADDRESS: esc(b.address || ''),
  ...heroNumbers()
});

mkdirSync(join(root, 'dist/site'), { recursive: true });
mkdirSync(join(root, 'dist/release'), { recursive: true });
writeFileSync(join(root, 'dist/site/index.html'), landing);
writeFileSync(join(root, 'dist/site/demo.html'), buildApp('demo'));
writeFileSync(join(root, 'dist/site/robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${config.siteUrl}/sitemap.xml\n`);
writeFileSync(
  join(root, 'dist/site/sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${config.siteUrl}/</loc></url>\n  <url><loc>${config.siteUrl}/demo.html</loc></url>\n</urlset>\n`
);
writeFileSync(join(root, 'dist/release/EquityPlan.html'), buildApp('pro'));

const left = [landing, buildApp('demo')].join('').match(/\{\{[A-Z_]+\}\}/g);
if (left) throw new Error('치환되지 않은 자리표시자: ' + [...new Set(left)].join(', '));
console.log('built: dist/site/index.html, dist/site/demo.html, dist/release/EquityPlan.html');
