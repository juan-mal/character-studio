import assert from 'node:assert/strict';
import test from 'node:test';
import { Box3, MOUSE, TOUCH, PerspectiveCamera, Vector3 } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { configureNavigation } from '../src/three/navigation.ts';
import { ViewPan } from '../src/three/ViewPan.ts';
import { boxCorners, fitCamera, boxInView, viewportFocus, recenterCamera } from '../src/three/cameraFit.ts';

test('camera fit contains all corners for tall, wide and deep models at oblique angles', () => {
  for (const aspect of [0.5, 1, 2.8]) for (const size of [[1, 4, 1], [4, 1, 1], [1, 1, 8]]) {
    const box = new Box3(new Vector3(-size[0]!, 2, -size[2]!), new Vector3(size[0]!, 2 + size[1]!, size[2]!));
    const camera = new PerspectiveCamera(35, aspect, 0.001, 1000);
    fitCamera(camera, box, new Vector3(1, 0.8, 0.4));
    assert.ok(boxInView(camera, box));
    for (const corner of boxCorners(box)) { const p = corner.project(camera); assert.ok(Math.abs(p.x) < 1 && Math.abs(p.y) < 1 && Math.abs(p.z) < 1); }
  }
});

test('camera visibility detects an offscreen translated model', () => {
  const box = new Box3(new Vector3(-1, 0, -1), new Vector3(1, 2, 1));
  const camera = new PerspectiveCamera(35, 1, 0.01, 1000);
  fitCamera(camera, box, new Vector3(0, 0, 1));
  assert.equal(boxInView(camera, box.clone().translate(new Vector3(100, 0, 0))), false);
});

test('left drag pans in screen space, right drag rotates and touch retains both navigation modes', () => {
  const controls = new OrbitControls(new PerspectiveCamera());
  configureNavigation(controls);
  assert.equal(controls.enablePan,false);
  assert.equal(controls.screenSpacePanning,true);
  assert.equal(controls.mouseButtons.LEFT,undefined);
  assert.equal(controls.mouseButtons.RIGHT,MOUSE.ROTATE);
  assert.equal(controls.touches.ONE,TOUCH.ROTATE);
  assert.equal(controls.touches.TWO,TOUCH.DOLLY_ROTATE);
});

test('projection pan preserves the orbit pivot and world camera, including fit and resize', () => {
  const camera = new PerspectiveCamera(35, 1.5);
  const box = new Box3(new Vector3(-.4,0,-.2),new Vector3(.4,1.7,.2));
  const target=box.getCenter(new Vector3());
  fitCamera(camera,box,new Vector3(0,0,1));
  const position=camera.position.clone();
  const element={clientWidth:900,clientHeight:600,addEventListener(){},removeEventListener(){}} as unknown as HTMLElement;
  const pan=new ViewPan(camera,element,()=>{});
  pan.shift(.15,.2);
  assert.deepEqual(camera.position,position);
  const projected=target.clone().project(camera);
  assert.ok(Math.abs(projected.x-.3)<1e-10);
  assert.ok(Math.abs(projected.y+.4)<1e-10);
  fitCamera(camera,box,new Vector3(1,.2,1),1.16,target);
  assert.ok(boxInView(camera,box));
  assert.ok(target.clone().project(camera).distanceTo(new Vector3(projected.x,projected.y,target.clone().project(camera).z))<1e-10);
  pan.dispose();
});

test('fit current view retains the panned orbit target and orientation while fitting the whole model', () => {
  const box = new Box3(new Vector3(-0.4,0,-0.2),new Vector3(0.4,1.7,0.2));
  const camera = new PerspectiveCamera(35,1.5,0.001,100);
  const target = new Vector3(0.2,0.45,0), original = target.clone();
  const direction = new Vector3(1,0.2,1).normalize();
  fitCamera(camera,box,direction,1.16,target);
  assert.deepEqual(target,original);
  assert.ok(camera.position.clone().sub(target).normalize().distanceTo(direction)<1e-12);
  assert.ok(boxInView(camera,box));
});

test('zoomed views can pan by several viewport heights without hitting an artificial ceiling',()=>{
 const camera=new PerspectiveCamera(35,1.5);const target=new Vector3(0,1,0);camera.position.set(0,1,1);camera.lookAt(target);camera.updateMatrixWorld();
 const element={clientWidth:900,clientHeight:600,addEventListener(){},removeEventListener(){}} as unknown as HTMLElement;
 const pan=new ViewPan(camera,element,()=>{});
 for(let i=0;i<8;i++)pan.shift(0,.3);
 assert.ok(Math.abs(target.clone().project(camera).y+4.8)<1e-9);
 pan.shift(0,-4.8);assert.ok(Math.abs(target.clone().project(camera).y-4.8)<1e-9);
 assert.deepEqual(camera.position,new Vector3(0,1,1));pan.dispose();
});

test('recentering clears only screen-space pan and preserves the current zoom and orbit',()=>{
 const camera=new PerspectiveCamera(35,1.5);const target=new Vector3(.2,.8,0);camera.position.set(.7,1.1,2.2);camera.lookAt(target);camera.updateMatrixWorld();
 const position=camera.position.clone(), distance=camera.position.distanceTo(target);
 const element={clientWidth:900,clientHeight:600,addEventListener(){},removeEventListener(){}} as unknown as HTMLElement;
 const pan=new ViewPan(camera,element,()=>{});
 pan.shift(.75,-1.4);
 assert.ok(Math.abs(target.clone().project(camera).x)>1);
 pan.reset();
 const centered=target.clone().project(camera);
 assert.ok(Math.abs(centered.x)<1e-10 && Math.abs(centered.y)<1e-10);
 assert.deepEqual(camera.position,position);
 assert.equal(camera.position.distanceTo(target),distance);
 pan.dispose();
});

test('front recenter keeps the current viewport focus and distance after a rotated, panned view',()=>{
 const camera=new PerspectiveCamera(35,1.5,0.001,100);
 const target=new Vector3(0,1,0);
 camera.position.set(1.4,1.8,2.1);camera.lookAt(target);camera.updateMatrixWorld();
 const element={clientWidth:900,clientHeight:600,addEventListener(){},removeEventListener(){}} as unknown as HTMLElement;
 const pan=new ViewPan(camera,element,()=>{});
 pan.shift(.2,-.48);
 const focus=viewportFocus(camera,target);
 const distance=camera.position.distanceTo(target);
 assert.ok(focus.distanceTo(target)>.1,'the user is looking at a different body area');
 pan.reset();
 recenterCamera(camera,focus,distance);
 assert.ok(camera.position.clone().sub(focus).normalize().distanceTo(new Vector3(0,0,1))<1e-10);
 assert.ok(Math.abs(camera.position.distanceTo(focus)-distance)<1e-10);
 const centered=focus.clone().project(camera);
 assert.ok(Math.abs(centered.x)<1e-10 && Math.abs(centered.y)<1e-10);
 pan.dispose();
});
