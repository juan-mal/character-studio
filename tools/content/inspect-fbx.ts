import {readFile, readdir, mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Box3, LoadingManager, Mesh, Texture, TextureLoader} from 'three';
import {FBXLoader} from 'three/addons/loaders/FBXLoader.js';
import {digest} from '../assets/obj.ts';

/** Metadata only: texture pixels are deliberately not decoded or certified here. */
class MetadataTextureLoader extends TextureLoader {
  override load(url:string):Texture<HTMLImageElement> {const texture=new Texture<HTMLImageElement>();texture.name=url;return texture;}
}
export async function inspectFbx(filename:string) {
  const bytes=await readFile(filename);
  // FBXLoader checks window.URL even in Node when embedded images are present.
  const hadWindow='window' in globalThis;
  const previous=Object.getOwnPropertyDescriptor(globalThis,'window');
  if(!hadWindow) Object.defineProperty(globalThis,'window',{value:{URL},configurable:true});
  const manager=new LoadingManager();manager.addHandler(/.*/,new MetadataTextureLoader(manager));
  let root;
  try {root=new FBXLoader(manager).parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');}
  finally {
    if(!hadWindow) Reflect.deleteProperty(globalThis,'window');
    else if(previous) Object.defineProperty(globalThis,'window',previous);
  }
  root.updateMatrixWorld(true);
  const meshes:{name:string;vertices:number;triangles:number;uv:boolean;normals:boolean;bounds:{min:number[];max:number[]};materials:string[];expressions:string[]}[]=[];
  root.traverse(object=>{
    if(!(object instanceof Mesh))return;
    const box=new Box3().setFromObject(object,true);
    const geometry=object.geometry;
    meshes.push({name:object.name,vertices:geometry.getAttribute('position').count,triangles:(geometry.index?.count??geometry.getAttribute('position').count)/3,uv:!!geometry.getAttribute('uv'),normals:!!geometry.getAttribute('normal'),bounds:{min:box.min.toArray(),max:box.max.toArray()},materials:(Array.isArray(object.material)?object.material:[object.material]).map(material=>material.name),expressions:Object.keys(object.morphTargetDictionary??{})});
    geometry.dispose();
    for(const material of Array.isArray(object.material)?object.material:[object.material])material.dispose();
  });
  return {source:filename,sha256:digest(bytes),meshes,reviewStatus:'pending' as const,limitation:'Solo geometría y nombres de materiales; no certifica texturas, uniones, visibilidad ni compatibilidad.'};
}

async function main(){
  const [directory,output='reports/modular-candidates.json',limitText='24']=process.argv.slice(2);
  const limit=Number(limitText);
  if(!directory || !Number.isInteger(limit) || limit<1 || limit>100)throw new Error('Uso: node tools/content/inspect-fbx.ts carpeta/GameObject reporte.json [límite 1–100]');
  const candidates=(await readdir(directory,{withFileTypes:true})).filter(entry=>entry.isDirectory() && /^Beyd_Avatar_Boy_(Face|Hair|Top|Bottom|Suit)_/.test(entry.name)).sort((a,b)=>a.name.localeCompare(b.name));
  const results:Awaited<ReturnType<typeof inspectFbx>>[]=[];
  const failures:{source:string;error:string}[]=[];
  for(const folder of candidates.slice(0,limit)){
    const filename=path.join(directory,folder.name,folder.name+'.fbx');
    try{results.push(await inspectFbx(filename));}
    catch(error){failures.push({source:filename,error:error instanceof Error?error.message:String(error)});}
  }
  await mkdir(path.dirname(output),{recursive:true});
  await writeFile(output,JSON.stringify({schemaVersion:1,totalCandidates:candidates.length,inspected:results.length+failures.length,results,failures},null,2)+'\n');
  console.info(`[FBX] ${results.length} inspeccionados, ${failures.length} problemáticos; ${output}. Ninguno habilitado automáticamente.`);
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch((error:unknown)=>{console.error(error instanceof Error?error.message:String(error));process.exitCode=1;});
