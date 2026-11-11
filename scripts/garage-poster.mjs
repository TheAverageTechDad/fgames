// Renders the Garage arcade card from the game itself: a finished bike in the garage, HUD hidden.
// Run with the dev server up: FGAMES_URL=http://localhost:5180 node scripts/garage-poster.mjs
import {chromium} from '@playwright/test';
import sharp from 'sharp';
const base=process.env.FGAMES_URL||'http://localhost:5180';
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1280,height:680},deviceScaleFactor:1});
 await page.addInitScript(()=>{localStorage.setItem('garage:v1',JSON.stringify({bikes:[{paint:'red',stars:14,built:1}],building:null,voice:false}));localStorage.setItem('fgames_muted','true');});
 await page.goto(`${base}/garage`);
 await page.locator('.garage-world[data-ready="true"]').waitFor({timeout:60000});
 await page.addStyleTag({content:'.garage-header,.garage-bottom{display:none!important}.garage-surround{padding:0!important}.garage-shell{max-width:none!important;height:100%!important;border:0!important;border-radius:0!important;box-shadow:none!important}'});
 await page.evaluate(()=>window.garage.look(32,7,0.8));
 await page.waitForTimeout(1500);
 const png=await page.screenshot({type:'png'});
 const info=await sharp(png).webp({quality:84}).toFile('static/cards/garage-poster-v1.webp');
 console.log('wrote static/cards/garage-poster-v1.webp',info.size);
}finally{await browser.close();}
