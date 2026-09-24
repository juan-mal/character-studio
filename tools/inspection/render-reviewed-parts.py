"""Orthographic geometry/UV inspection raster; never modifies source files."""
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
DOWNLOADS = Path.home() / 'Downloads'

def obj(path):
    p, t, f = [], [], []
    for line in Path(path).read_text().splitlines():
        q=line.split()
        if not q: continue
        if q[0]=='v': p.append([float(x) for x in q[1:4]])
        if q[0]=='vt': t.append([float(x) for x in q[1:3]])
        if q[0]=='f':
            corners=[[int(x)-1 for x in c.split('/')[:2]] for c in q[1:]]
            for i in range(1,len(corners)-1): f.append([corners[0],corners[i],corners[i+1]])
    return np.array(p),np.array(t),np.array(f)

def render(parts, destination, size=(900,1200), xbounds=(-.65,.65), ybounds=(-.06,1.65), angle=0):
    w,h=size
    pixels=np.full((h,w,3),239,dtype=np.uint8)
    zbuffer=np.full((h,w),-np.inf)
    for geometry,texture in parts:
        positions,uv,faces=obj(geometry)
        radians=np.deg2rad(angle)
        rotated=positions.copy()
        rotated[:,0]=positions[:,0]*np.cos(radians)+positions[:,2]*np.sin(radians)
        rotated[:,2]=-positions[:,0]*np.sin(radians)+positions[:,2]*np.cos(radians)
        positions=rotated
        tex=np.array(Image.open(texture).convert('RGB')) if texture else None
        sx=(positions[:,0]-xbounds[0])/(xbounds[1]-xbounds[0])*(w-1)
        sy=(ybounds[1]-positions[:,1])/(ybounds[1]-ybounds[0])*(h-1)
        for face in faces:
            vi=face[:,0]; ti=face[:,1]
            a,b,c=np.column_stack([sx[vi],sy[vi]])
            xmin=max(0,int(np.floor(min(a[0],b[0],c[0])))); xmax=min(w-1,int(np.ceil(max(a[0],b[0],c[0]))))
            ymin=max(0,int(np.floor(min(a[1],b[1],c[1])))); ymax=min(h-1,int(np.ceil(max(a[1],b[1],c[1]))))
            den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
            if abs(den)<1e-9 or xmin>xmax or ymin>ymax: continue
            yy,xx=np.mgrid[ymin:ymax+1,xmin:xmax+1]
            l1=((b[1]-c[1])*(xx-c[0])+(c[0]-b[0])*(yy-c[1]))/den
            l2=((c[1]-a[1])*(xx-c[0])+(a[0]-c[0])*(yy-c[1]))/den; l3=1-l1-l2
            z=l1*positions[vi[0],2]+l2*positions[vi[1],2]+l3*positions[vi[2],2]
            mask=(l1>=0)&(l2>=0)&(l3>=0)&(z>zbuffer[ymin:ymax+1,xmin:xmax+1])
            if not mask.any(): continue
            if tex is not None:
                u=l1*uv[ti[0],0]+l2*uv[ti[1],0]+l3*uv[ti[2],0]
                v=l1*uv[ti[0],1]+l2*uv[ti[1],1]+l3*uv[ti[2],1]
                tx=np.clip(np.rint(u*(tex.shape[1]-1)).astype(int),0,tex.shape[1]-1)
                ty=np.clip(np.rint((1-v)*(tex.shape[0]-1)).astype(int),0,tex.shape[0]-1)
                rgb=tex[ty,tx]
            else: rgb=np.full((*z.shape,3),[205,183,157],dtype=np.uint8)
            pixels[ymin:ymax+1,xmin:xmax+1][mask]=rgb[mask]
            zbuffer[ymin:ymax+1,xmin:xmax+1][mask]=z[mask]
    Image.fromarray(pixels).save(destination)

out=ROOT/'reports/inspection'; out.mkdir(exist_ok=True,parents=True)
body=DOWNLOADS/'Mesh/Body002_Standard.obj'; hair=DOWNLOADS/'Mesh/Hair210_Standard.obj'; head=ROOT/'src/generated/meshes/girl-standard-body002-original-head.obj'
bodytex=DOWNLOADS/'Texture2D/NPC_Girl_Body002_Vila_Druzhna02_01_Tex_Diffuse.png'
hairtex=DOWNLOADS/'Texture2D/NPC_Girl_Hair210_01_Tex_Diffuse.png'
facetex=DOWNLOADS/'Texture2D/NPC_Girl_Face004_02_Tex_Diffuse.png'
render([(body,bodytex),(head,facetex),(hair,hairtex)],out/'body002-hair210-candidate-textures.png')
render([(body,bodytex),(head,facetex),(hair,hairtex)],out/'body002-hair210-head-candidate.png',size=(1000,1000),xbounds=(-.18,.18),ybounds=(1.25,1.61))
render([(body,bodytex)],out/'body002-integrated-eye-geometry.png',size=(1000,1000),xbounds=(-.18,.18),ybounds=(1.25,1.61))
positions,uv,faces=obj(body)
inside=lambda p:(p[:,0]>.40)&(p[:,0]<.59)&(p[:,1]<.1)
eyefaces=[f for f in faces if inside(uv[f[:,1]]).all()]
eyevertices=np.concatenate([positions[f[:,0]] for f in eyefaces])
print({'eyeAtlasTriangleCount':len(eyefaces),'eyeGeometryBounds':[eyevertices.min(axis=0).tolist(),eyevertices.max(axis=0).tolist()]})
for number,texture in [(205,'NPC_Female_Hair205_Tex_Diffuse.png'),(210,'NPC_Girl_Hair210_01_Tex_Diffuse.png'),(210,'NPC_Girl_Hair210_02_Tex_Diffuse.png'),(213,'NPC_Girl_Hair213_Tex_Diffuse.png')]:
    parts=[(body,bodytex),(head,facetex),(DOWNLOADS/f'Mesh/Hair{number}_Standard.obj',DOWNLOADS/'Texture2D'/texture)]
    shots=[]
    for angle in [0,65,180]:
        dest=out/f'{texture}-{angle}.png'
        render(parts,dest,size=(600,800),angle=angle)
        shots.append(Image.open(dest))
    sheet=Image.new('RGB',(1800,800),(239,239,239))
    for i,img in enumerate(shots): sheet.paste(img,(i*600,0))
    sheet.save(out/f'review-{texture}')
