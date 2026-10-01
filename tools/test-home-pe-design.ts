/** Offline development fixture and responsive design verification. Never uses production data. */
import { PrismaClient } from '@prisma/client';
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const db = new PrismaClient();
const phase = process.argv[2] ?? 'after';
const id = 'codex-pe-design-review';
const dir = 'screenshots/home-pe-design';
async function main() {
  assert.equal(process.env.DATABASE_URL, 'file:./dev.db');
  assert(['before','after','seed'].includes(phase));
  mkdirSync(dir, {recursive:true});
  if (!await db.mADeal.findUnique({where:{id}})) {
    const user = await db.user.findUniqueOrThrow({where:{email:'demo@dealmind.kr'}});
    await db.mADeal.create({data:{id,name:'Project Precision · 예시 인수 검토',companyName:'한빛정밀 (예시 데이터)',dealType:'BUYOUT',userId:user.id,teamId:user.teamId}});
    const period = await db.mAFinancialPeriod.create({data:{maDealId:id,fiscalYear:2024,periodType:'ANNUAL',startDate:new Date('2024-01-01'),endDate:new Date('2024-12-31'),currency:'KRW'}});
    await db.mAFinancialLineItem.createMany({data:[
      {financialPeriodId:period.id,statementType:'INCOME_STATEMENT',lineItem:'REVENUE',value:100_000_000_000,currency:'KRW',source:'MANUAL',sourceName:'경영진 제공 자료 (예시)'},
      {financialPeriodId:period.id,statementType:'INCOME_STATEMENT',lineItem:'REVENUE',value:95_000_000_000,currency:'KRW',source:'DART',sourceName:'사업보고서 (예시)'},
    ]});
    await db.pEDDCase.create({data:{maDealId:id}});
  }
  if (phase === 'seed') { console.log(`Fixture ready: /ma-deals/${id}`); return; }
  const input = await db.mADeal.findUnique({where:{id},include:{financialPeriods:{include:{lineItems:true}}}});
  const hash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
  if (phase === 'before') writeFileSync(`${dir}/input.sha256`,hash);
  else assert.equal(hash,readFileSync(`${dir}/input.sha256`,'utf8'),'PE snapshot unchanged');
  const browser = await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH});
  const page = await browser.newPage();
  for (const width of [1440,390]) {
    await page.setViewportSize({width,height:1000});
    await page.goto('http://localhost:3000/',{waitUntil:'networkidle'});
    if (phase === 'after') {
      await page.getByRole('tab',{name:'VC · 투자 판단',exact:true}).focus();
      await page.keyboard.press('ArrowRight');
      assert.equal(await page.getByRole('tab',{name:'PE/M&A · 검토 상황',exact:true}).getAttribute('aria-selected'),'true');
      await page.keyboard.press('Home');
    }
    await page.screenshot({path:`${dir}/${phase}-landing-${width}.png`,fullPage:true});
    await page.screenshot({path:`${dir}/${phase}-landing-${width}-first.png`});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Landing overflow');
  }
  await page.goto('http://localhost:3000/login',{waitUntil:'networkidle'});
  await page.getByRole('button',{name:'demo@dealmind.kr / Demo1234! 로 로그인'}).click();
  await page.waitForURL('**/dashboard');
  for (const width of [1440,390]) {
    await page.setViewportSize({width,height:1000});
    for (const [label,route] of [['dashboard','/dashboard'],['pe',`/ma-deals/${id}`]]) {
      await page.goto(`http://localhost:3000${route}`,{waitUntil:'networkidle'});
      await page.screenshot({path:`${dir}/${phase}-${label}-${width}.png`,fullPage:true});
      await page.screenshot({path:`${dir}/${phase}-${label}-${width}-first.png`});
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${label} overflow ${width}`);
    }
    await page.getByTestId('pe-status-next-open').click();
    await page.getByRole('tab',{name:'재무 · QoE',exact:true}).waitFor();
    assert(await page.getByRole('tab',{name:'재무 · QoE',exact:true}).getAttribute('data-state')==='active');
    assert((await page.locator('body').innerText()).includes('경영진 제공 자료'),'Financial source preserved');
  }
  await browser.close();
  console.log(`${phase}: 6 captures, responsive overflow, PE next-action and source verification PASS; input ${hash}`);
}
main().finally(()=>db.$disconnect()).catch(e=>{console.error(e);process.exit(1)});
