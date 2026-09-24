import { chromium } from '@playwright/test';
import { readdir,readFile } from 'node:fs/promises';
const browser=await chromium.launch();
try {
  const page=await browser.newPage({viewport:{width:1440,height:1600}});
  const folders=await readdir('content/characters');
  for(const view of ['full','face','back']) {
    const cards=await Promise.all(folders.map(async folder=>{
      const image=await readFile(`reports/expansion/${folder}-${view}.png`);
      return `<figure><figcaption>${folder}</figcaption><img src="data:image/png;base64,${image.toString('base64')}"></figure>`;
    }));
    await page.setContent(`<style>body{margin:0;background:#f7f7f5;display:grid;grid-template-columns:repeat(4,1fr);font:16px system-ui}figure{margin:0;text-align:center}img{display:block;width:100%;height:480px;object-fit:contain}</style>${cards.join('')}`);
    await page.locator('img').evaluateAll(images=>Promise.all(images.map(image=>image.decode())));
    await page.screenshot({path:`reports/expansion/contact-${view}.png`,fullPage:true});
  }
} finally {await browser.close();}
