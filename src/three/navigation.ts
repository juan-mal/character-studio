import { MOUSE, TOUCH } from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export function configureNavigation(controls: OrbitControls): void {
  controls.enablePan = false;
  controls.screenSpacePanning = true;
  controls.panSpeed = 0.8;
  controls.mouseButtons = { LEFT: undefined, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.ROTATE };
  controls.touches = { ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_ROTATE };
  if (controls.domElement) controls.cursorStyle = 'grab';
}

