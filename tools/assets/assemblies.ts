import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import type { AssetCatalog, CompatibilityCatalog, Preset } from '../../src/assets/types.ts';
import { digest } from './obj.ts';
import { archetypeOf } from './classify.ts';

interface Assembly {
  version: number; name: string; variant: string; reviewed: boolean;
  calibration: {fbxImportScale:number;axes:string;staticRestPose:boolean};
  source: string; sourceHash: string;
  parts: Record<'body'|'hair'|'face', string> & Partial<Record<'eyes'|'brows',string>>;
  skin?: Partial<Record<'body'|'face',{reference:string;regions?:number[][]}>>;
  files: {path:string;sha256:string}[];
  previews?: Partial<Record<'body'|'hair'|'face'|'eyes'|'brows', {name:string;sha256:string}>>;
}
/** Reviewed packs preserve one authored FBX assembly; filenames alone never authorize a pack. */
export async function enrichAssemblies(root: string, catalog: AssetCatalog, compatibility: CompatibilityCatalog, presets: Preset[], warnings: string[]): Promise<void> {
  const directory = path.join(root,'content/characters');
  const folders = await readdir(directory,{withFileTypes:true}).catch(error => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  });
  for (const folder of folders.filter(folder=>folder.isDirectory())) {
    const base = path.join(directory,folder.name);
    try {
      const pack = JSON.parse(await readFile(path.join(base,'assembly.json'),'utf8')) as Assembly;
      if (!pack.reviewed) continue;
      if(pack.version!==1 || !pack.name || !pack.variant || !Array.isArray(pack.files) || !Number.isFinite(pack.calibration?.fbxImportScale) || pack.calibration.fbxImportScale<=0 || !pack.calibration.axes || pack.calibration.staticRestPose!==true) throw new Error('Manifest inválido');
      if (!/^[a-f0-9]{64}$/i.test(pack.sourceHash)) throw new Error('Hash de origen inválido');
      const source = await readFile(pack.source).catch((error: unknown) => {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        warnings.push(`Paquete ${folder.name}: origen no disponible; se verifican las copias locales por SHA-256.`);
        return undefined;
      });
      if(source && digest(source)!==pack.sourceHash) throw new Error('El FBX original cambió');
      for(const file of pack.files) {
        if(path.basename(file.path)!==file.path || digest(await readFile(path.join(base,file.path)))!==file.sha256) throw new Error('Cambió un recurso revisado: '+file.path);
      }
      const roles = (['body','hair','face','eyes','brows'] as const).filter(role=>role==='body'||role==='hair'||role==='face'||pack.parts[role]);
      const parts = roles.map(role=> {
        const relative = `content/characters/${folder.name}/${pack.parts[role]}`;
        const asset = catalog.assets.find(a=>a.mesh.sourceId==='project' && a.mesh.relativePath===relative);
        if(!asset || asset.category!==role || !asset.metadata.mainApplication || asset.mesh.geometry.normalCoverage!==1 || asset.mesh.geometry.uvCoverage!==1 || !pack.files.some(file=>file.path===pack.parts[role] && file.sha256===asset.mesh.sha256)) throw new Error('Pieza no verificada: '+role);
        if(!asset.textureVariants.some(v=>v.confidence==='confirmed' && !v.requiresVisualValidation)) throw new Error('Material sin mapa directo: '+role);
        return asset;
      });
      const [body,hair,face]=parts;
      if(!body || !hair || !face) throw new Error('Conjunto incompleto');
      const ids = new Set(parts.map(a=>a.id));
      const obsolete = new Set(compatibility.pieceRelations.filter(r=>ids.has(r.a)&&ids.has(r.b)).map(r=>r.id));
      compatibility.pieceRelations = compatibility.pieceRelations.filter(r=>!obsolete.has(r.id));
      for(const asset of catalog.assets) asset.compatibility.relationIds=asset.compatibility.relationIds.filter(id=>!obsolete.has(id));
      for(const asset of parts) {
        asset.metadata.shading='anime-static';asset.metadata.renderSide='double';
        asset.metadata.calibration={...pack.calibration};
        const seen = new Set<string>();
        asset.textureVariants=asset.textureVariants.filter(variant=> {
          const key=JSON.stringify(variant.maps)+variant.confidence;
          if(seen.has(key))return false;seen.add(key);return true;
        });
        const skin=pack.skin?.[asset.category as 'body'|'face'];
        if(skin){asset.metadata.skinReference=skin.reference;asset.metadata.skinRegions=skin.regions;}
        const preview=pack.previews?.[asset.category as 'body'|'hair'|'face'|'eyes'|'brows'];
        const image=preview && catalog.images.find(image=>image.usage==='preview' && image.name===preview.name.replace(/\.(png|jpe?g|webp|tga)$/i,'') && image.sha256===preview.sha256);
        if(image) asset.preview={imageId:image.id,confidence:'confirmed',evidence:['Captura del conjunto real revisado; no sustituye al modelo.']};
        asset.metadata.reasons.push('Ensamblaje FBX estático revisado; transformación común documentada en assembly.json.');
      }
      for(const [index,a] of parts.entries()) for(const b of parts.slice(index+1)) {
        const id='assembly-'+digest(a.id+b.id).slice(0,20);
        compatibility.pieceRelations.push({id,a:a.id,b:b.id,kind:'merged-evidence',confidence:'confirmed',status:'supported',metrics:{},sourceMeshIds:parts.map(a=>a.mesh.id),evidence:[`Mismo FBX revisado: ${pack.name} / ${pack.variant}; sha256 ${pack.sourceHash}. Posiciones y UV preservadas bajo transformación común; revisión frontal/lateral/posterior.`]});
        a.compatibility.relationIds.push(id);b.compatibility.relationIds.push(id);
      }
      const outfitLabel = ({Default:'Atuendo original',Alternate:'Atuendo alternativo',Summer:'Verano'} as Record<string,string>)[pack.variant] ?? pack.variant;
      const archetype = archetypeOf(path.basename(pack.source)) ?? body.mesh.archetype;
      for (const asset of parts) { asset.archetype = archetype; asset.mesh.archetype = archetype; }
      presets.push({id:'assembly-'+digest(folder.name).slice(0,16),name:pack.name+' / '+pack.variant,displayName:pack.name+(pack.variant==='Default'?'':' · '+outfitLabel),outfitLabel,archetype,buildVariant:null,sourceMeshIds:parts.map(a=>a.mesh.id),bodyFamily:pack.name,hairFamily:pack.name,bodyAssetIds:[body.id],hairAssetIds:[hair.id],missingParts:[],status:'geometry-supported',completeCharacter:false,evidence:['Paquete local revisado; vestido y calzado integrados; exportación estática sin rig.']});
    } catch(error) { warnings.push(`Paquete ${folder.name} no habilitado: ${error instanceof Error ? error.message : String(error)}`); }
  }
}
