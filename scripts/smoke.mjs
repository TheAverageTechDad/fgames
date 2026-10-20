import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
const base=process.env.FGAMES_URL||'http://127.0.0.1:4174';
await mkdir('test-results',{recursive:true});
const browser=await chromium.launch({headless:true});
const results=[];
try{
 for(const game of ['nuts','escape'])for(const [di,difficulty] of ['easy','medium','hard','extra_hard'].entries()){
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
 page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.__longTasks=[];new PerformanceObserver(list=>window.__longTasks.push(...list.getEntries().map(e=>({duration:e.duration,start:e.startTime})))).observe({entryTypes:['longtask']});});
 await page.goto(base);
 await page.getByRole('button',{name:`Play ${game==='nuts'?'Nuts & Bolts':'Escape'}`,exact:true}).click();
 await page.getByRole('button',{name:['Easy','Medium','Hard','Extra Hard'][di],exact:true}).click();
 await page.getByRole('button',{name:'Play · Level 1',exact:true}).waitFor();
 const start=await page.evaluate(()=>performance.now());
 await page.getByRole('button',{name:'Play · Level 1',exact:true}).click();
 await page.getByRole('heading',{name:'Level 1',exact:true}).waitFor();
 if(game==='nuts')await page.locator('[data-bolt="0"]').waitFor();else await page.locator('[data-vehicle="red"]').waitFor();
 await page.waitForTimeout(300);
 const tasks=await page.evaluate(t=>window.__longTasks.filter(e=>e.start>t),start);
 // Store all tasks, including first-time WebGL setup, as evidence. The strict performance
 // gate is optional for slower CI/GPU emulation hosts: FGAMES_STRICT_PERF=1 pnpm smoke.
 if(game==='escape'||process.env.FGAMES_STRICT_PERF==='1')assert(tasks.every(e=>e.duration<=50),JSON.stringify(tasks));
 const levels=JSON.parse(await readFile(`static/levels/${game}/${difficulty}.json`,'utf8'));
 for(const move of levels[0].solution){
  if(game==='nuts'){
   await page.locator(`[data-bolt="${move.from}"]`).click();
   await page.locator(`[data-bolt="${move.to}"]`).click();
   await page.waitForFunction(()=>!document.querySelector('button[aria-label="Restart level"]')?.disabled);
  }else{
   const vehicle=page.locator(`[data-vehicle="${move.id}"]`),box=await vehicle.boundingBox();
   assert(box);const vertical=await vehicle.getAttribute('data-orientation')==='V';
   const sign=['LEFT','UP'].includes(move.direction)?-1:1;
   const cell=vertical?box.width:box.height;const delta=sign*move.steps*(cell+5);
   await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
   await page.mouse.move(box.x+box.width/2+(vertical?0:delta),box.y+box.height/2+(vertical?delta:0),{steps:5});await page.mouse.up();
   await page.waitForFunction(()=>!document.querySelector('button[aria-label="Restart level"]')?.disabled);
  }
 }
 await page.getByRole('dialog',{name:'Level complete',exact:true}).waitFor({timeout:15000});

 assert(await page.getByText(`Solved in ${levels[0].solution.length} moves`,{exact:true}).count());
 assert.deepEqual(errors,[]);
 results.push({game,difficulty,moves:levels[0].solution.length,longTasks:tasks});console.log('PASS',game,difficulty,results.at(-1));
 await page.screenshot({path:`test-results/${game}-${difficulty}-win.png`});
 await page.getByRole('button',{name:'Replay',exact:true}).click();await page.getByRole('heading',{name:'Level 1',exact:true}).waitFor();assert.equal(await page.getByRole('dialog',{name:'Level complete',exact:true}).count(),0);
 await context.close();
 }
 // Back, refresh, debug hooks, storage, offline and tight viewport checks.
 const context=await browser.newContext({viewport:{width:375,height:667}}),page=await context.newPage();
 await page.goto(base+'/?game=escape&level=57');await page.getByRole('heading',{name:'Offline Games',exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>typeof window.__nuts),'undefined');
 await page.getByRole('button',{name:'Play Nuts & Bolts',exact:true}).click();await page.getByRole('button',{name:'Extra Hard',exact:true}).click();await page.getByRole('button',{name:'Play · Level 1',exact:true}).click();
 await page.locator('[data-bolt="0"]').waitFor();await page.getByRole('button',{name:'Add extra bolt',exact:true}).click();await page.locator('[data-bolt="8"]').waitFor();
 const bounds=await page.locator('[data-bolt]').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom};}));
 assert(bounds.every(b=>b.x>=0&&b.right<=375&&b.y>=0&&b.bottom<=667),JSON.stringify(bounds));
 await page.screenshot({path:'test-results/nuts-small-extra-bolt.png'});
 await page.goBack();await page.getByRole('heading',{name:'Nuts & Bolts',exact:true}).waitFor();await page.reload();await page.getByRole('heading',{name:'Nuts & Bolts',exact:true}).waitFor();await page.goBack();await page.getByRole('heading',{name:'Offline Games',exact:true}).waitFor();
 await page.goto(base+'/escape');await page.getByRole('button',{name:'Play · Level 1',exact:true}).click();await page.getByRole('button',{name:'Use hint',exact:true}).click();await page.getByText('Hint · 2',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Restart level',exact:true}).click();await page.getByText('Hint · 2',{exact:true}).waitFor();await page.reload();await page.getByText('Hint · 2',{exact:true}).waitFor();
 await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
 await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
 await context.setOffline(true);await page.goto(base+'/nuts?difficulty=extra_hard');await page.getByRole('button',{name:'Play · Level 1',exact:true}).waitFor();await page.getByRole('button',{name:'Play · Level 1',exact:true}).click();await page.locator('[data-bolt="0"]').waitFor();await page.reload();await page.locator('[data-bolt="0"]').waitFor();await page.getByRole('button',{name:'Use hint',exact:true}).click();await page.getByText('Hint · 2',{exact:true}).waitFor();await context.setOffline(false);
 await context.close();
 await writeFile('test-results/smoke.json',JSON.stringify(results,null,2));console.log('PASS navigation, storage, offline, debug guard and 375px camera bounds');
}finally{await browser.close();}
