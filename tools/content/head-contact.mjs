import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const cases=JSON.parse(await readFile('reports/head-mixes/cases.json','utf8'));
const browser=await chromium.launch();
try {const page=await browser.newPage({viewport:{width:1500,height:1000}});
for(let start=0;start<cases.length;start+=7){const cards=await Promise.all(cases.slice(start,start+7).map(async(c,j)=>`<figure><figcaption>${start+j}: ${c.body}<br>${c.hair} / ${c.face}</figcaption><img src="data:image/png;base64,${(await readFile(`reports/head-mixes/${start+j}-face.png`)).toString('base64')}"></figure>`));await page.setContent(`<style>body{margin:0;display:grid;grid-template-columns:repeat(4,1fr);font:13px system-ui}figure{margin:0}img{width:100%;height:420px;object-fit:contain}</style>${cards.join('')}`);await page.locator('img').evaluateAll(imgs=>Promise.all(imgs.map(i=>i.decode())));await page.screenshot({path:`reports/head-mixes/contact-${start}.png`,fullPage:true});}
}finally{await browser.close();}
