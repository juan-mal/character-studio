import {readFile} from 'node:fs/promises';
import path from 'node:path';
import type {AssetCatalog,AssetDefinition,CompatibilityCatalog,Vec3} from '../../src/assets/types.ts';
import {digest,parseObj} from './obj.ts';
interface Review {members:{folder:string;files:{path:string;sha256:string}[]}[];reviewed:boolean;restrictedHair?:string[];evidence:string[]}
export function neckDistance(a:Vec3[],b:Vec3[]):number {
  const band=(points:Vec3[])=>{const min=Math.min(...points.map(p=>p[1]));return points.filter(p=>p[1]<min+0.02);};
  const aa=band(a),bb=band(b);
  const directed=(from:Vec3[],to:Vec3[])=>Math.max(...from.map(p=>Math.min(...to.map(q=>Math.hypot(p[0]-q[0],p[1]-q[1],p[2]-q[2])))));
  return Math.max(directed(aa,bb),directed(bb,aa));
}
/** Explicitly reviewed static head exchanges. Recheck source hashes and measured neck surfaces. */
export async function enrichHeadMixes(root:string,catalog:AssetCatalog,compatibility:CompatibilityCatalog,warnings:string[]):Promise<void> {
  let reviews:Review[];
  try {reviews=JSON.parse(await readFile(path.join(root,'content/head-mixes.reviewed.json'),'utf8')) as Review[];}
  catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return;throw error;}
  for(const review of reviews){
    if(!review.reviewed)continue;
    try {
      const groups=await Promise.all(review.members.map(async member=>{
        if(path.basename(member.folder)!==member.folder)throw new Error('Ruta no válida');
        for(const file of member.files)if(path.basename(file.path)!==file.path || digest(await readFile(path.join(root,'content/characters',member.folder,file.path)))!==file.sha256)throw new Error('Cambió una pieza revisada');
        const assets=catalog.assets.filter(a=>a.mesh.relativePath.startsWith(`content/characters/${member.folder}/`) && a.metadata.shading==='anime-static');
        const face=assets.find(a=>a.category==='face');
        if(!face || assets.length!==5)throw new Error('Paquete incompleto o sin revisar');
        const positions=parseObj(await readFile(path.join(root,face.mesh.relativePath),'utf8')).positions;
        return {assets,face,positions};
      }));
      let deviation=0;
      for(const a of groups)for(const b of groups){
        deviation=Math.max(deviation,neckDistance(a.positions,b.positions));
        const ab=a.face.mesh.geometry.bounds!,bb=b.face.mesh.geometry.bounds!;
        if([...ab.min,...ab.max].some((v,i)=>Math.abs(v-[...bb.min,...bb.max][i]!)>0.0001))throw new Error('Cabezas con coordenadas o dimensiones distintas');
      }
      if(deviation>0.0001)throw new Error('La unión del cuello no coincide');
      const assets=groups.flatMap(g=>g.assets),ids=new Set(assets.map(a=>a.id));
      const obsolete=new Set(compatibility.pieceRelations.filter(r=>ids.has(r.a)&&ids.has(r.b)).map(r=>r.id));
      compatibility.pieceRelations=compatibility.pieceRelations.filter(r=>!obsolete.has(r.id));
      for(const asset of catalog.assets)asset.compatibility.relationIds=asset.compatibility.relationIds.filter(id=>!obsolete.has(id));
      for(const [i,a] of assets.entries())for(const b of assets.slice(i+1)){
        if(a.category===b.category)continue;
        const folder=(asset:AssetDefinition)=>asset.mesh.relativePath.split('/')[2]!;
        if(folder(a)!==folder(b) && [a,b].some(asset=>asset.category==='hair' && review.restrictedHair?.includes(folder(asset))))continue;
        const id='head-mix-'+digest(a.id+b.id).slice(0,20);
        compatibility.pieceRelations.push({id,a:a.id,b:b.id,kind:'face-body',confidence:'confirmed',status:'supported',metrics:{maximumNeckDistance:deviation},sourceMeshIds:groups.map(g=>g.face.mesh.id),evidence:review.evidence});
        a.compatibility.relationIds.push(id);b.compatibility.relationIds.push(id);
      }
    }catch(error){warnings.push(`Intercambio de cabezas deshabilitado: ${error instanceof Error?error.message:String(error)}`);}
  }
}
