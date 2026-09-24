import {test,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
test('custom head, hair, eyes and skin survive JSON and GLB without shared resource mutation',async({page})=>{
 test.setTimeout(120000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('/');
 const result=await page.evaluate(async()=>{const path='/tests/e2e/customization-runtime.ts';return(await import(path) as typeof import('./customization-runtime.ts')).verifyCustomization();});
 await mkdir('reports/customization',{recursive:true});
 for(const name of ['originalImage','roundtripImage','faceImage'] as const)await writeFile(`reports/customization/${name}.png`,Buffer.from(result[name].split(',')[1]!,'base64'));
 const {originalImage:_original,roundtripImage:_roundtrip,faceImage:_face,...metrics}=result;await writeFile('reports/customization/results.json',JSON.stringify(metrics,null,2));
 expect(result.isolated).toBe(true);expect(result.meshes).toBe(5);expect(result.maps).toBe(5);expect(result.forbidden).toBe(0);expect(result.changedRatio).toBeLessThan(.005);expect(errors).toEqual([]);
});

test('texture controls apply one history step and recover through preset import',async({page})=>{
 test.setTimeout(120000);await page.goto('/');
 const ready=async()=>{await expect(page.getByRole('main')).toHaveAttribute('aria-busy','false');await expect(page.getByRole('button',{name:'Exportar GLB',exact:true})).toBeEnabled();};
 await ready();await page.getByRole('button',{name:'Amber',exact:true}).click();await ready();
 await page.getByRole('button',{name:'Cabello',exact:true}).click();
 await page.getByRole('button',{name:'Hair Keqing Default',exact:true}).click();await ready();
 await page.locator('.texture-editor input[type=color]').fill('#ad425d');
 await expect(page.locator('.texture-editor input[type=color]')).toHaveValue('#ad425d');await page.waitForTimeout(350);await ready();
 await page.getByRole('button',{name:'Deshacer',exact:true}).click();await ready();await expect(page.locator('.texture-editor input[type=color]')).toHaveValue('#bda58a');
 await page.getByRole('button',{name:'Rehacer',exact:true}).click();await ready();await expect(page.locator('.texture-editor input[type=color]')).toHaveValue('#ad425d');
 await page.getByRole('button',{name:'Cara',exact:true}).click();await page.getByRole('button',{name:'Face Barbara Summer',exact:true}).click();await ready();
 await page.getByRole('button',{name:'Cuerpo',exact:true}).click();await page.getByRole('button',{name:'piel: #b87851',exact:true}).click();await page.waitForTimeout(100);await ready();
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Guardar preset',exact:true}).click();const saved=await download;
 await page.getByRole('button',{name:'Restablecer personaje'}).click();await ready();await page.locator('input[type=file]').setInputFiles((await saved.path())!);await ready();
 await page.getByRole('button',{name:'Cabello',exact:true}).click();await expect(page.locator('.texture-editor input[type=color]')).toHaveValue('#ad425d');
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'reports/customization/mobile-controls.png'});
});

test('prepared skin atlases render on each supported outfit',async({page})=>{
 test.setTimeout(120000);await page.goto('/');
 const names=['Amber','Amber · Atuendo alternativo','Barbara','Barbara · Verano'];
 for(const [index,name] of names.entries()){
  await expect(page.getByRole('main')).toHaveAttribute('aria-busy','false');
  await page.getByRole('button',{name:'Presets',exact:true}).click();await page.getByRole('button',{name,exact:true}).click();
  await expect(page.getByRole('main')).toHaveAttribute('aria-busy','false');await page.getByRole('button',{name:'Cuerpo',exact:true}).click();
  await page.getByRole('button',{name:'piel: #b87851',exact:true}).click();await page.waitForTimeout(100);
  await expect(page.getByRole('main')).toHaveAttribute('aria-busy','false');await page.getByRole('button',{name:'Ver cuerpo completo',exact:true}).click();
  await page.locator('canvas').screenshot({path:`reports/customization/skin-${index}.png`});
 }
});

