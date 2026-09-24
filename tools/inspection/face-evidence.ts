import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { parseObj, pointKey, getBounds, digest } from '../assets/obj.ts';
import { surfaceCoverage } from '../assets/compatibility.ts';
import type { ParsedObj } from '../assets/obj.ts';
import type { AssetCatalog, InspectionReport, MeshRecord } from '../../src/assets/types.ts';
const catalog = JSON.parse(await fs.readFile('src/generated/assets.generated.json', 'utf8')) as AssetCatalog;
const report = JSON.parse(await fs.readFile('reports/asset-inspection.json', 'utf8')) as InspectionReport;
const cache = new Map<string, ParsedObj>();
async function load(m: MeshRecord) { let p = cache.get(m.id); if (!p) { const src = catalog.sources.find(s=>s.id===m.sourceId)!; p=parseObj(await fs.readFile(path.resolve(src.path.replace(/^~/,os.homedir()),m.relativePath),'utf8'));cache.set(m.id,p); } return p; }
function tris(m: ParsedObj) { return m.polygons.flatMap(f=> f.slice(1,-1).map((_,i)=>[f[0]!,f[i+1]!,f[i+2]!])); }
function key(m: ParsedObj,f:number[]) { return f.map(i=>pointKey(m.positions[i]!,.0001)).sort().join('|'); }
const targetMeshes = report.meshes.filter(m=>m.category==='merged characters' && m.lod===0 && /Girl_Standard_Body002/.test(m.name));
const faces = catalog.assets.filter(a=> a.category==='face');
const output = [];
for (const m of targetMeshes) {
  const merged = await load(m), bodyAsset = catalog.assets.find(a=>a.name==='Body002_Standard')!, hairAsset=catalog.assets.find(a=>a.name===m.name.match(/Hair\d+/)![0]+'_Standard')!;
  const body=await load(bodyAsset.mesh), hair=await load(hairAsset.mesh);
  const known = new Set([...tris(body).map(f=>key(body,f)), ...tris(hair).map(f=>key(hair,f))]);
  const residualPolygons=tris(merged).filter(f=>!known.has(key(merged,f))), indices=[...new Set(residualPolygons.flat())];
  const residual={...merged,positions:merged.positions,polygons:residualPolygons};
  const comparisons=[];
  for(const f of faces) { const obj=await load(f.mesh); comparisons.push({name:f.name,id:f.id,faceTriangles:obj.stats.triangleCount,bounds:obj.stats.bounds,...surfaceCoverage(obj,merged),residualTriangleCoverage:surfaceCoverage(obj,residual).triangleCoverage}); }
  comparisons.sort((a,b)=>b.triangleCoverage-a.triangleCoverage);
  const source=catalog.sources.find(s=>s.id===m.sourceId)!;
  const raw=await fs.readFile(path.resolve(source.path.replace(/^~/,os.homedir()),m.relativePath),'utf8');
  const uv=raw.split(/\r?\n/).filter(l=>l.startsWith('vt ')).map(l=>l.slice(3).split(/\s+/).map(Number));
  const normal=raw.split(/\r?\n/).filter(l=>l.startsWith('vn ')).map(l=>l.slice(3).split(/\s+/).map(Number));
  const rawFaces=raw.split(/\r?\n/).filter(l=>l.startsWith('f ')).map(l=>l.slice(2).split(/\s+/).map(c=>c.split('/').map(v=>Number(v)-1)));
  const residualRaw=rawFaces.filter(f=>!known.has(key(merged,f.map(c=>c[0]!))));
  const layout=residualRaw.map(f=>f.map(c=>[...merged.positions[c[0]!]!,...uv[c[1]!]!,...normal[c[2]!]!].map(v=>Math.round(v*1e6)).join(',')).sort().join('|')).sort();
  const row={name:m.name,mergedTriangles:merged.stats.triangleCount,body:surfaceCoverage(body,merged),hair:surfaceCoverage(hair,merged),residualTriangles:residualPolygons.length,residualLayoutHash:digest(layout.join(';')),residualUVBounds:getBounds(residualRaw.flat().map(c=>[uv[c[1]!]![0]!,uv[c[1]!]![1]!,0])),residualBounds:getBounds(indices.map(i=>merged.positions[i]!)),faces:comparisons}; output.push(row);
}
await fs.mkdir('reports/inspection',{recursive:true});
await fs.writeFile('reports/inspection/face-evidence.json',JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify(output.map(r=>({...r,faces:r.faces.slice(0,6)})),null,2));
