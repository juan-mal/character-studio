import type { PerspectiveCamera } from 'three';

/** Move the framing in projection space; the orbit pivot never leaves the character. */
export class ViewPan {
  private x = 0;
  private y = 0;
  private pointer: {id:number;x:number;y:number} | undefined;
  private camera: PerspectiveCamera;
  private element: HTMLElement;
  private changed: () => void;
  constructor(camera: PerspectiveCamera, element: HTMLElement, changed: () => void) {
    this.camera=camera;this.element=element;this.changed=changed;
    element.addEventListener('pointerdown',this.down,true);
    element.addEventListener('pointermove',this.move,true);
    element.addEventListener('pointerup',this.up,true);
    element.addEventListener('pointercancel',this.up,true);
  }
  shift(x: number,y: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    this.x += x;
    this.y += y;
    this.resize(); this.changed();
  }
  reset(): void { this.x=0;this.y=0;this.resize(); }
  resize(): void {
    const width=this.element.clientWidth, height=this.element.clientHeight;
    if(width && height) this.camera.setViewOffset(width,height,-this.x*width,-this.y*height,width,height);
  }
  private down = (event: PointerEvent): void => {
    if(event.pointerType==='touch' || event.button!==0) return;
    event.preventDefault();event.stopImmediatePropagation();
    this.element.focus(); this.element.setPointerCapture(event.pointerId);
    this.pointer={id:event.pointerId,x:event.clientX,y:event.clientY};
  };
  private move = (event: PointerEvent): void => {
    if(this.pointer?.id!==event.pointerId)return;
    event.stopImmediatePropagation();
    this.shift((event.clientX-this.pointer.x)/this.element.clientWidth,(event.clientY-this.pointer.y)/this.element.clientHeight);
    this.pointer.x=event.clientX;this.pointer.y=event.clientY;
  };
  private up = (event: PointerEvent): void => {
    if(this.pointer?.id!==event.pointerId)return;
    event.stopImmediatePropagation();this.pointer=undefined;
    if(this.element.hasPointerCapture(event.pointerId))this.element.releasePointerCapture(event.pointerId);
  };
  dispose():void {
    this.element.removeEventListener('pointerdown',this.down,true);
    this.element.removeEventListener('pointermove',this.move,true);
    this.element.removeEventListener('pointerup',this.up,true);
    this.element.removeEventListener('pointercancel',this.up,true);
  }
}
