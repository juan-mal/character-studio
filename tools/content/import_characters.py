"""Bounded offline FBX -> static OBJ packs. Originals are read-only; restart skips unchanged packs.
Run Blender -b -t 2 --python tools/content/import_characters.py -- --source ROOT --output content/characters
"""
import bpy,sys,argparse,pathlib,json,hashlib,shutil
p=argparse.ArgumentParser();p.add_argument('--source',required=True);p.add_argument('--output',required=True)
p.add_argument('--characters',nargs='+',default=['Amber','Barbara']);p.add_argument('--limit',type=int,default=2);p.add_argument('--variant',default='Default')
a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);source=pathlib.Path(a.source);out=pathlib.Path(a.output).resolve();out.mkdir(parents=True,exist_ok=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
recipes=[(name,a.variant) for name in a.characters[:max(0,min(a.limit,10))]]
if pathlib.Path(a.variant).name!=a.variant or a.variant in ['.','..']:raise RuntimeError('Invalid variant directory')
if any(pathlib.Path(name).name!=name or name in ['.','..'] for name,_ in recipes):raise RuntimeError('Invalid character directory')
for character,variant in recipes:
 folder=source/character/variant
 if not folder.exists() and variant=='Default':folder=source/character
 fbxs=list(folder.glob('*.fbx'))
 if len(fbxs)!=1: raise RuntimeError('Expected one FBX: '+str(folder))
 old={}
 fbx=fbxs[0];dest=out/(character+'-'+variant);dest.mkdir(exist_ok=True)
 if (dest/'assembly.json').exists():
  old=json.loads((dest/'assembly.json').read_text())
  if old.get('recipeVersion')==4 and old['sourceHash']==sha(fbx) and all((dest/f['path']).exists() and sha(dest/f['path'])==f['sha256'] for f in old['files']):
   print('UNCHANGED',character,flush=True);continue
 bpy.ops.wm.read_factory_settings(use_empty=True)
 bpy.ops.import_scene.fbx(filepath=str(fbx),global_scale=100)
 dg=bpy.context.evaluated_depsgraph_get();parts={r:[] for r in ['body','hair','face','eyes','brows']};textures={};excluded=[]
 for obj in bpy.context.scene.objects:
  if obj.type!='MESH':continue
  if obj.name in ['EffectMesh','EyeStar']:excluded.append(obj.name);continue
  evaluated=obj.evaluated_get(dg);mesh=evaluated.to_mesh();mesh.calc_loop_triangles()
  if not mesh.uv_layers.active:raise RuntimeError('Missing UV '+obj.name)
  transform=obj.matrix_world;nm=transform.to_3x3().inverted().transposed()
  # Iris surfaces use the hair atlas. Face_Eye is surrounding facial skin, not the iris.
  eye_polygons=set()
  eye_shell=next((o for o in bpy.context.scene.objects if o.type=='MESH' and o.name.lower()=='face_eye'),None)
  if eye_shell:
   points=[eye_shell.matrix_world@v.co for v in eye_shell.data.vertices]
   lo=[min(v[i] for v in points) for i in range(3)];hi=[max(v[i] for v in points) for i in range(3)]
   parent=list(range(len(mesh.vertices)))
   def find(i):
    while parent[i]!=i:parent[i]=parent[parent[i]];i=parent[i]
    return i
   polygons=[p for p in mesh.polygons if mesh.materials[p.material_index].name.lower().endswith('_hair')]
   for poly in polygons:
    for vi in poly.vertices:parent[find(vi)]=find(poly.vertices[0])
   components={}
   for poly in polygons:components.setdefault(find(poly.vertices[0]),[]).append(poly)
   for group in components.values():
    vertices=[transform@mesh.vertices[i].co for i in set(v for poly in group for v in poly.vertices)]
    mn=[min(v[i] for v in vertices) for i in range(3)];mx=[max(v[i] for v in vertices) for i in range(3)]
    # Small disconnected frontal components contained inside the central eye shell.
    inside=all(mn[i]>=lo[i] and mx[i]<=hi[i] for i in range(3))
    central=max(abs(mn[0]),abs(mx[0])) < max(abs(lo[0]),abs(hi[0]))*.8
    compact=mx[0]-mn[0]<(hi[0]-lo[0])*.28 and mx[2]-mn[2]<(hi[2]-lo[2])*.45 and mx[1]-mn[1]<(hi[1]-lo[1])*.35
    if inside and central and compact:eye_polygons.update(poly.index for poly in group)
  for tri in mesh.loop_triangles:
   mat=mesh.materials[tri.material_index];material_role=mat.name.rsplit('_',1)[-1].lower();role={'dress':'body'}.get(material_role,material_role)
   if obj.name.lower()=='face_eye':role='face'
   if tri.polygon_index in eye_polygons:role='eyes'
   if obj.name.lower() in ['brow','brows','face_brow']:role='brows'
   if role not in parts:raise RuntimeError('Unmapped material '+mat.name)
   tex=folder/(mat.name.replace('_Mat_','_Tex_')+'_Diffuse.png')
   if not tex.exists():
    material_folders=[d for d in [folder/'Materials',folder.parent/'Materials'] if (d/(mat.name+'.json')).is_file()]
    if len(material_folders)!=1:raise RuntimeError('Missing unambiguous material definition: '+mat.name+' in '+str(folder))
    material_folder=material_folders[0];definition=json.loads((material_folder/(mat.name+'.json')).read_text())['m_SavedProperties']['m_TexEnvs']['_MainTex'];matches=[]
    for candidate in material_folder.glob('*.json'):
     properties=json.loads(candidate.read_text())['m_SavedProperties']['m_TexEnvs'].get('_MainTex',{})
     image=folder/(candidate.stem.replace('_Mat_','_Tex_')+'_Diffuse.png')
     if image.exists() and properties.get('m_Texture',{}).get('m_PathID')==definition['m_Texture']['m_PathID'] and properties.get('m_Scale')==definition['m_Scale'] and properties.get('m_Offset')==definition['m_Offset']:matches.append(image)
    if len(set(matches))!=1:raise RuntimeError('Missing unambiguous diffuse '+str(tex))
    tex=matches[0]

   if material_role in textures and textures[material_role]!=tex:raise RuntimeError('Multiple diffuse maps in '+role)
   textures[material_role]=tex;corners=[]
   for li in tri.loops:
    v=transform@mesh.vertices[mesh.loops[li].vertex_index].co;n=(nm@mesh.corner_normals[li].vector).normalized();uv=mesh.uv_layers.active.data[li].uv
    corners.append(((v.x,v.z,-v.y),(uv.x,uv.y),(n.x,n.z,-n.y)))
   parts[role].append((corners,material_role))
  evaluated.to_mesh_clear()
 files=[];records={}
 for role,triangles in parts.items():
  if not triangles:
   if role in ['eyes','brows']:continue
   raise RuntimeError('Missing '+role)
  stem=role.title()+'_'+character+'_'+variant
  images=[];mtl_lines=[]
  for material_role in sorted(set(m for _,m in triangles)):
   image=dest/textures[material_role].name;shutil.copyfile(textures[material_role],image);images.append(image)
   mtl_lines += ['newmtl '+material_role,'Kd 1 1 1','d 1','map_Kd '+image.name]
  mtl=dest/(stem+'.mtl');mtl.write_text('\n'.join(mtl_lines)+'\n')
  obj=dest/(stem+'.obj');lines=['# Static FBX assembly; import global_scale=100; Blender Z-up -> OBJ Y-up','mtllib '+mtl.name,'usemtl '+role];faces=[];i=1
  previous_material=None
  for triangle,material_role in triangles:
   for v,uv,n in triangle:
    lines+=['v '+' '.join(map(str,v)),'vt '+' '.join(map(str,uv)),'vn '+' '.join(map(str,n))]
   if material_role!=previous_material:faces.append('usemtl '+material_role);previous_material=material_role
   faces.append('f '+' '.join(f'{k}/{k}/{k}' for k in range(i,i+3)));i+=3
  obj.write_text('\n'.join(lines+faces)+'\n');records[role]=obj.name
  for file in [obj,mtl,*images]:files.append({'path':file.name,'sha256':sha(file)})
 manifest={'version':1,'recipeVersion':4,'name':character,'variant':variant,'source':str(fbx),'sourceHash':sha(fbx),'calibration':{'fbxImportScale':100,'axes':'Blender Z-up to OBJ Y-up','staticRestPose':True},'excluded':excluded,'parts':records,'files':files,'reviewed':False}
 if 'old' in locals():
  for key in ['skin','previews']:
   if key in old:manifest[key]=old[key]
 (dest/'assembly.json').write_text(json.dumps(manifest,indent=2))
 print('PREPARED',character,len(files),'files',flush=True)
