import { Box3, Frustum, Matrix4, PerspectiveCamera, Vector3 } from "three";

export function boxCorners(box: Box3): Vector3[] {
  return [box.min.x, box.max.x].flatMap((x) =>
    [box.min.y, box.max.y].flatMap((y) =>
      [box.min.z, box.max.z].map((z) => new Vector3(x, y, z)),
    ),
  );
}

export function boxInView(
  camera: PerspectiveCamera,
  box: Box3,
  complete = true,
): boolean {
  camera.updateMatrixWorld(true);
  if (!complete)
    return new Frustum()
      .setFromProjectionMatrix(
        new Matrix4().multiplyMatrices(
          camera.projectionMatrix,
          camera.matrixWorldInverse,
        ),
      )
      .intersectsBox(box);
  return boxCorners(box).every((corner) => {
    const point = corner.project(camera);
    return (
      Math.abs(point.x) <= 1 && Math.abs(point.y) <= 1 && Math.abs(point.z) <= 1
    );
  });
}

/** World point under the centre of the current viewport on the orbit-target plane. */
export function viewportFocus(
  camera: PerspectiveCamera,
  orbitTarget: Vector3,
): Vector3 {
  camera.updateMatrixWorld(true);
  const origin = camera.position.clone();
  const forward = camera.getWorldDirection(new Vector3());
  const direction = new Vector3(0, 0, 0.5).unproject(camera).sub(origin).normalize();
  const denominator = forward.dot(direction);
  if (Math.abs(denominator) < 1e-8) return orbitTarget.clone();
  const distance = forward.dot(orbitTarget.clone().sub(origin)) / denominator;
  if (!Number.isFinite(distance) || distance <= 0) return orbitTarget.clone();
  return origin.addScaledVector(direction, distance);
}

/** Restore the studio's front view while retaining the user's current focus and zoom distance. */
export function recenterCamera(
  camera: PerspectiveCamera,
  focus: Vector3,
  distance: number,
): void {
  const safeDistance = Number.isFinite(distance) && distance > 0 ? distance : 1;
  camera.position.copy(focus).addScaledVector(new Vector3(0, 0, 1), safeDistance);
  camera.lookAt(focus);
  camera.updateMatrixWorld(true);
}

/** Solve distance in camera axes, including each corner's depth, preserving view direction. */
export function fitCamera(
  camera: PerspectiveCamera,
  box: Box3,
  direction: Vector3,
  padding = 1.16,
  target = box.getCenter(new Vector3()),
): Vector3 {
  const backward = direction.clone().normalize();
  if (backward.lengthSq() === 0) backward.set(0, 0, 1);
  const right = new Vector3().crossVectors(camera.up, backward).normalize();
  if (right.lengthSq() < 0.001) right.set(1, 0, 0);
  const up = new Vector3().crossVectors(backward, right).normalize();
  const tangent = Math.tan((camera.getEffectiveFOV() * Math.PI) / 360);
  const shiftX = Math.abs(camera.projectionMatrix.elements[8] ?? 0);
  const shiftY = Math.abs(camera.projectionMatrix.elements[9] ?? 0);
  let distance = camera.near * 2;
  for (const corner of boxCorners(box)) {
    const relative = corner.sub(target);
    distance = Math.max(
      distance,
      relative.dot(backward) +
        padding *
          Math.max(
            Math.abs(relative.dot(right)) / (tangent * camera.aspect * Math.max(0.1,1-shiftX)),
            Math.abs(relative.dot(up)) / (tangent * Math.max(0.1,1-shiftY)),
          ),
    );
  }
  camera.position.copy(target).addScaledVector(backward, distance);
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
  return target;
}
