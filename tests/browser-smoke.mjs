import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';

const root=resolve(import.meta.dirname,'..'), build=join(root,'build');
const server=createServer(async(req,res)=>{
  try{const name=new URL(req.url,'http://localhost').pathname.slice(1),path=resolve(build,name);
    if(!path.startsWith(build+'/'))throw new Error('invalid path');
    res.setHeader('Content-Type',path.endsWith('.html')?'text/html; charset=utf-8':'application/json');res.end(await readFile(path));
  }catch{res.writeHead(404);res.end('Not found');}
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const base=`http://127.0.0.1:${server.address().port}`;
let browser;
const passed=[],errors=[];
try{
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
  const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
  const load=async(name)=>{await page.goto(base+'/'+name+'.html');await page.evaluate(()=>localStorage.clear());await page.reload();};
  const practice=()=>page.getByRole('button',{name:'Practice steps',exact:true}).click();
  const next=()=>page.getByRole('button',{name:'Continue',exact:true}).click();
  const answer0=()=>page.getByRole('button',{name:'Sales fell by 12% in that month.',exact:true}).click();
  for(const policy of ['full','failed-step','checkpoint','after-n-errors']){
    await load('evidence-and-inference');await practice();await page.locator('#policy').selectOption(policy);
    await answer0();await next();await page.getByRole('button',{name:"Repeat the manager's explanation.",exact:true}).click();
    await page.getByRole('button',{name:'Try again',exact:true}).click();
    let expected=policy==='full'?'1':'2';assert.match(await page.locator('#stepCounter').innerText(),new RegExp('Step '+expected+' /','i'));
    if(policy==='after-n-errors'){
      await page.getByRole('button',{name:"Repeat the manager's explanation.",exact:true}).click();await page.getByRole('button',{name:'Try again',exact:true}).click();
      assert.match(await page.locator('#stepCounter').innerText(),/Step 1 \/ 2/i);
    }
    passed.push('restart mode: '+policy);
  }
  await load('evidence-and-inference');
  await page.getByRole('button',{name:'Next',exact:true}).click();assert.equal(await page.locator('#slideTitle').innerText(),'Compare explanations');
  await practice();await page.getByRole('button',{name:'Hint',exact:true}).click();assert.match(await page.locator('#feedback').innerText(),/measurement/);
  await answer0();await next();await page.getByRole('button',{name:'Compare sales by hour and similar periods, and check other changes.',exact:true}).click();await next();
  assert.equal(await page.locator('#prompt').innerText(),'Practice complete');
  await page.reload();await practice();assert.equal(await page.locator('#prompt').innerText(),'Practice complete');passed.push('slides, hints, completion and reload persistence');
  const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Export progress',exact:true}).click();
  const download=await downloadPromise,stream=await download.createReadStream();let buffer='';for await(const chunk of stream)buffer+=chunk;
  const progress=JSON.parse(buffer);assert.equal(progress.finished,true);
  await page.locator('#import').setInputFiles({name:'progress.json',mimeType:'application/json',buffer:Buffer.from(buffer)});
  assert.equal(await page.locator('#feedback').innerText(),'Progress imported.');
  progress.digest='another-lesson';await page.locator('#import').setInputFiles({name:'wrong.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(progress))});
  assert.match(await page.locator('#feedback').innerText(),/different lesson version/);passed.push('progress export/import and wrong-version rejection');
  await load('mean-confidence-interval');await practice();await page.locator('#numeric').fill('abc');await page.getByRole('button',{name:'Check answer',exact:true}).click();
  assert.match(await page.locator('#feedback').innerText(),/finite number/);await page.locator('#numeric').fill('2,0');await page.getByRole('button',{name:'Check answer',exact:true}).click();await next();
  assert.match(await page.locator('#stepCounter').innerText(),/Step 2 \/ 3/i);await page.locator('#numeric').fill('3.92');await page.getByRole('button',{name:'Check answer',exact:true}).click();await next();
  await page.locator('#numeric').fill('96.08');await page.getByRole('button',{name:'Check answer',exact:true}).click();await next();assert.equal(await page.locator('#prompt').innerText(),'Practice complete');passed.push('numeric validation, decimal comma and point, STEM completion');
  await load('evidence-and-inference');await page.setViewportSize({width:390,height:844});await practice();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);passed.push('390px viewport without horizontal overflow');
  await mkdir(join(build,'qa'),{recursive:true});await page.screenshot({path:join(build,'qa/mobile-practice.png'),fullPage:true});
  await page.setViewportSize({width:1365,height:900});await page.getByRole('button',{name:'Study slides',exact:true}).click();await page.screenshot({path:join(build,'qa/desktop-slides.png'),fullPage:true});
  assert.deepEqual(errors,[]);passed.push('no browser JavaScript errors');
  const report={checked_at:new Date().toISOString(),browser:await browser.version(),passed,limitations:['No complete accessibility audit','No final PDF visual QA','No educational efficacy evaluation']};
  await writeFile(join(build,'qa/browser-smoke.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{if(browser)await browser.close();await new Promise(ok=>server.close(ok));}
