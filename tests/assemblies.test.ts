import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,mkdir,readFile,writeFile,rm } from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {runScan} from '../tools/assets/scan.ts';
import {digest} from '../tools/assets/obj.ts';

test('reviewed assembly requires unchanged source, meshes, materials and images; a changed map revokes its preset',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'studio-assembly-'));
 try {
  const folder=path.join(root,'content/characters/Test');await mkdir(folder,{recursive:true});
  const triangle='mtllib material.mtl\nusemtl skin\nv 0 0 0\nv 1 0 0\nv 0 1 0\nvt 0 0\nvt 1 0\nvt 0 1\nvn 0 0 1\nf 1/1/1 2/2/1 3/3/1\n';
  const files:Record<string,string|Buffer>={'Body_Test.obj':triangle,'Hair_Test.obj':triangle,'Face_Test.obj':triangle,'material.mtl':'newmtl skin\nmap_Kd color.png\n','color.png':Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==','base64')};
  for(const [name,data]of Object.entries(files))await writeFile(path.join(folder,name),data);
  const source=path.join(root,'source.fbx');await writeFile(source,'source fixture');
  const manifest={version:1,name:'Test',variant:'Default',reviewed:true,source,sourceHash:digest('source fixture'),calibration:{fbxImportScale:100,axes:'Z up -> Y up',staticRestPose:true},parts:{body:'Body_Test.obj',hair:'Hair_Test.obj',face:'Face_Test.obj'},files:Object.entries(files).map(([name,data])=>({path:name,sha256:digest(data)}))};
  await writeFile(path.join(folder,'assembly.json'),JSON.stringify(manifest));
  const config={sources:[{id:'project',path:'.',kind:'mixed' as const}]};
  await runScan(root,config,()=>{});
  const presets=()=>readFile(path.join(root,'src/generated/presets.generated.json'),'utf8').then(s=>JSON.parse(s) as {presets:{displayName?:string}[]});
  assert.ok((await presets()).presets.some(p=>p.displayName==='Test'));
  await rm(source);
  await runScan(root,config,()=>{});
  assert.ok((await presets()).presets.some(p=>p.displayName==='Test'),'verified local copies remain usable with the source drive offline');
  await writeFile(source,'changed source');
  await runScan(root,config,()=>{});
  assert.equal((await presets()).presets.some(p=>p.displayName==='Test'),false,'an available changed source still revokes review');
  await writeFile(source,'source fixture');
  await writeFile(path.join(folder,'material.mtl'),'newmtl skin\nKd 0 0 0\n');
  await runScan(root,config,()=>{});
  assert.equal((await presets()).presets.some(p=>p.displayName==='Test'),false);
 } finally {await rm(root,{recursive:true,force:true});}
});
