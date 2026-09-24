import test from 'node:test';
import assert from 'node:assert/strict';
import { BufferGeometry, Float32BufferAttribute, MeshStandardMaterial, Texture } from 'three';
import { createAnimeMaterial, prepareAnimeGeometry } from '../src/materials/animeStyle.ts';

function geometry(): BufferGeometry {
  return new BufferGeometry()
    .setAttribute('position', new Float32BufferAttribute([0,0,0,1,0,0,0,1,0],3))
    .setAttribute('normal', new Float32BufferAttribute([0,0,1,0,0,-1,0,1,0],3))
    .setAttribute('uv', new Float32BufferAttribute([0,0,1,0,0,1],2));
}

test('anime shading preserves mesh/UV/normals and caches portable linear colors once', () => {
  const mesh = geometry();
  const position = mesh.getAttribute('position'), uv = mesh.getAttribute('uv'), normal = mesh.getAttribute('normal');
  prepareAnimeGeometry(mesh, false);
  const color = mesh.getAttribute('color');
  assert.equal(color.count, position.count);
  assert.equal(color.getX(0), 1);
  assert.ok(color.getX(1) > 0.6 && color.getX(1) < 0.65);
  assert.ok(color.getZ(1) > color.getY(1));
  prepareAnimeGeometry(mesh, false);
  assert.equal(mesh.getAttribute('color'),color);
  assert.equal(mesh.getAttribute('position'),position);
  assert.equal(mesh.getAttribute('normal'),normal);
  assert.equal(mesh.getAttribute('uv'),uv);
});

test('face profile softens shadows without changing the source normals', () => {
  const face = geometry(), body = geometry();
  prepareAnimeGeometry(face,true); prepareAnimeGeometry(body,false);
  assert.ok(face.getAttribute('color').getX(1) > body.getAttribute('color').getX(1));
  assert.equal(face.getAttribute('normal').getZ(1), -1);
  assert.ok([...face.getAttribute('color').array].every(value => value >= 0 && value <= 1));
});

test('anime conversion keeps map, tint, alpha and independent material ownership', () => {
  const source = new MeshStandardMaterial({map:new Texture(),color:'#ab1234',alphaMap:new Texture(),alphaTest:0.4});
  const first = createAnimeMaterial(source), second = createAnimeMaterial(source);
  assert.equal(first.color.getHexString(),'ab1234');
  assert.equal(first.map,source.map);
  assert.equal(first.alphaMap,source.alphaMap);
  assert.equal(first.alphaTest,source.alphaTest);
  assert.equal(first.vertexColors,true);
  assert.equal(first.toneMapped,false);
  first.color.set('#ffffff');
  assert.equal(second.color.getHexString(),'ab1234');
  assert.equal(source.color.getHexString(),'ab1234');
});

test('static anime profile rejects skinning and morph geometry instead of freezing its lighting silently', () => {
  const mesh = geometry();
  mesh.morphAttributes.position = [mesh.getAttribute('position').clone()];
  assert.throws(()=>prepareAnimeGeometry(mesh,false),/animable/);
});

test('anime conversion refuses to silently discard a reviewed normal or emissive map', () => {
  const material = new MeshStandardMaterial({normalMap:new Texture()});
  assert.throws(()=>createAnimeMaterial(material),/revisión/);
});
