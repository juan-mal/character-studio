import {
  NoToneMapping,
  AxesHelper,
  Box3,
  Box3Helper,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Material,
  Mesh,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShadowMaterial,
  SRGBColorSpace,
  Spherical,
  Vector3,
  WebGLRenderer,
  type Object3D,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type {
  CharacterConfiguration,
  LoadProgress,
  StudioData,
  StudioDebug,
} from "../types/studio.ts";
import { exportCharacter } from "../export/exportCharacter.ts";
import { AssetManager } from "./AssetManager.ts";
import { CharacterAssembler } from "./CharacterAssembler.ts";
import { materialsOf } from "./objectResources.ts";
import { boxInView, fitCamera, recenterCamera, viewportFocus } from "./cameraFit.ts";
import { configureNavigation } from "./navigation.ts";
import { ViewPan } from './ViewPan.ts';

interface SceneOptions {
  data: StudioData;
  onProgress?: (progress: LoadProgress) => void;
  onError?: (message: string) => void;
  debug?: StudioDebug;
}

const defaultDebug: StudioDebug = {
  enabled: false,
  wireframe: false,
  bounds: false,
  axes: false,
};

export class CharacterScene {
  readonly characterRoot: Group;
  private readonly container: HTMLElement;
  private readonly options: SceneOptions;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(35, 1, 0.01, 100);
  private readonly renderer: WebGLRenderer;
  private readonly controls: OrbitControls;
  private readonly viewPan: ViewPan;
  private readonly assets: AssetManager;
  private readonly assembler: CharacterAssembler;
  private readonly resizeObserver: ResizeObserver;
  private readonly floor = new Mesh(
    new PlaneGeometry(1, 1),
    new ShadowMaterial({ opacity: 0.08 }),
  );
  private readonly key = new DirectionalLight("#fff4e8", 1.5);
  private readonly fill = new DirectionalLight("#e9efff", 0.5);
  private readonly rim = new DirectionalLight("#ffffff", 0.55);
  private readonly helpers = new Group();
  private debug = defaultDebug;
  private frame = 0;
  private disposed = false;
  private framed = false;
  private archetype: string | null | undefined;
  private viewMode: "full" | "face" | "custom" = "full";

  constructor(container: HTMLElement, options: SceneOptions) {
    this.container = container;
    this.options = options;
    this.debug = options.debug ?? defaultDebug;
    this.renderer = new WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.renderer.domElement.setAttribute(
      "aria-label",
      "Vista 3D del personaje. Arrastra con botón izquierdo para mover la vista y derecho para girar. Rueda para zoom. Flechas para girar, Mayús y flechas para desplazar, más y menos para zoom e Inicio para centrar. En pantalla táctil: un dedo gira; dos dedos giran y acercan.",
    );
    this.renderer.domElement.setAttribute("role", "img");
    this.renderer.domElement.tabIndex = 0;
    this.renderer.domElement.addEventListener("keydown", this.onCameraKey);
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.addEventListener(
      "webglcontextlost",
      this.onContextLost,
    );
    this.renderer.domElement.addEventListener(
      "webglcontextrestored",
      this.invalidate,
    );
    this.scene.background = new Color("#f7f7f5");
    this.assets = new AssetManager(options.data, options.onProgress, this.renderer.capabilities.getMaxAnisotropy());
    this.assembler = new CharacterAssembler((id, config) =>
      this.assets.instantiate(id, config),
    );
    this.characterRoot = this.assembler.root;
    this.scene.add(this.characterRoot, this.helpers);
    this.camera.position.set(0.25, 0.85, 3);
    this.viewPan = new ViewPan(this.camera,this.renderer.domElement,this.onNavigate);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.1;
    configureNavigation(this.controls);
    this.controls.rotateSpeed = 0.65;
    this.controls.zoomSpeed = 0.8;
    this.controls.minPolarAngle = 0.18;
    this.controls.maxPolarAngle = Math.PI * 0.88;
    this.controls.minDistance = 0.3;
    this.controls.maxDistance = 12;
    this.controls.target.set(0, 0.8, 0);
    this.controls.addEventListener("change", this.invalidate);
    this.controls.addEventListener("start", this.onNavigate);
    this.setupStudio();
    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(container);
    this.resize();
  }

  async setConfiguration(config: CharacterConfiguration): Promise<void> {
    if (this.disposed) throw new Error("El escenario ya se cerró.");
    try {
      const previousBounds = new Box3().setFromObject(this.characterRoot);
      const previouslyFitted =
        this.framed && boxInView(this.camera, previousBounds);
      const committed = await this.assembler.setConfiguration(config);
      if (!committed || this.disposed) return;
      this.updateStudio();
      const bounds = new Box3().setFromObject(this.characterRoot);
      if (
        !this.framed ||
        this.archetype !== config.archetype ||
        !boxInView(this.camera, bounds, false) ||
        (this.viewMode === "full" &&
          previouslyFitted &&
          !boxInView(this.camera, bounds))
      ) {
        this.focus("full");
        this.framed = true;
      }
      this.archetype = config.archetype;
      this.setDebug(this.debug);
      this.invalidate();
    } catch (error) {
      if (!this.disposed)
        this.options.onError?.("No se pudo cargar esta opción.");
      throw error;
    }
  }

  focus(mode: "full" | "face"): void {
    if (this.disposed || !this.characterRoot.children.length) return;
    const full = new Box3().setFromObject(this.characterRoot);
    if (full.isEmpty()) return;
    this.viewMode = mode;
    this.viewPan.reset();
    let box = full.clone();
    if (mode === "face") {
      const face = this.characterRoot.children.find(
        (child) => child.name === "face",
      );
      if (face) {
        const faceBox = new Box3().setFromObject(face);
        if (!faceBox.isEmpty()) box = faceBox;
      } else {
        const height = full.max.y - full.min.y;
        box.min.y = full.max.y - height * 0.26;
        const midX = (full.min.x + full.max.x) / 2;
        box.min.x = midX - height * 0.19;
        box.max.x = midX + height * 0.19;
      }
    }
    const direction = this.framed
      ? this.camera.position.clone().sub(this.controls.target).normalize()
      : new Vector3(0.12, 0.025, 1).normalize();
    this.controls.target.copy(fitCamera(this.camera, box, direction));
    this.controls.update();
    this.invalidate();
  }

  /** Restore the front view while retaining the point and zoom currently being inspected. */
  centerView(): void {
    if (this.disposed) return;
    const distance = this.camera.position.distanceTo(this.controls.target);
    const focus = viewportFocus(this.camera, this.controls.target);
    this.viewPan.reset();
    recenterCamera(this.camera, focus, distance);
    this.controls.target.copy(focus);
    this.viewMode = "custom";
    this.controls.update();
    this.invalidate();
  }

  setDebug(debug: StudioDebug): void {
    this.debug = { ...debug };
    this.characterRoot.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      for (const material of materialsOf(object)) {
        if ("wireframe" in material) {
          material.wireframe = debug.enabled && debug.wireframe;
          material.needsUpdate = true;
        }
      }
    });
    this.clearHelpers();
    if (debug.enabled && this.characterRoot.children.length) {
      const bounds = new Box3().setFromObject(this.characterRoot);
      if (debug.bounds) this.helpers.add(new Box3Helper(bounds, "#928570"));
      if (debug.axes) {
        const axes = new AxesHelper(
          bounds.getSize(new Vector3()).length() * 0.4,
        );
        axes.position.copy(bounds.getCenter(new Vector3()));
        axes.position.y = bounds.min.y;
        this.helpers.add(axes);
      }
    }
    this.invalidate();
  }

  async exportGlb(): Promise<ArrayBuffer> {
    if (this.disposed) throw new Error("El escenario ya se cerró.");
    return exportCharacter(this.characterRoot);
  }

  private setupStudio(): void {
    this.scene.add(new HemisphereLight("#ffffff", "#c7bdb1", 0.9));
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.bias = -0.00012;
    this.key.shadow.normalBias = 0.012;
    this.key.shadow.radius = 3;
    this.scene.add(
      this.key,
      this.fill,
      this.rim,
      this.key.target,
      this.fill.target,
      this.rim.target,
    );
    this.floor.name = "StudioShadow";
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.receiveShadow = true;
    this.floor.visible = false;
    this.scene.add(this.floor);
  }

  private updateStudio(): void {
    const box = new Box3().setFromObject(this.characterRoot);
    if (box.isEmpty()) return;
    const center = box.getCenter(new Vector3());
    const size = box.getSize(new Vector3());
    const unit = Math.max(size.x, size.y, size.z, 0.01);
    this.controls.cursor.copy(center);
    this.controls.maxTargetRadius = unit;
    this.floor.visible = true;
    this.floor.position.set(center.x, box.min.y - unit * 0.002, center.z);
    this.floor.scale.setScalar(unit * 10);
    this.key.position
      .copy(center)
      .add(new Vector3(-1.2, 5, 1.7).multiplyScalar(unit));
    this.fill.position
      .copy(center)
      .add(new Vector3(2.8, 1.8, 2).multiplyScalar(unit));
    this.rim.position
      .copy(center)
      .add(new Vector3(0.8, 2.3, -2.5).multiplyScalar(unit));
    for (const light of [this.key, this.fill, this.rim])
      light.target.position.copy(center);
    const shadowCamera = this.key.shadow.camera;
    shadowCamera.left = -unit;
    shadowCamera.right = unit;
    shadowCamera.top = unit;
    shadowCamera.bottom = -unit;
    shadowCamera.near = unit * 0.1;
    shadowCamera.far = unit * 10;
    shadowCamera.updateProjectionMatrix();
    this.key.shadow.normalBias = unit * 0.0015;
    this.camera.near = unit * 0.005;
    this.camera.far = unit * 100;
    this.camera.updateProjectionMatrix();
    this.controls.minDistance = unit * 0.16;
    this.controls.maxDistance = unit * 8;
  }

  private readonly resize = (): void => {
    if (this.disposed) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (!width || !height) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height, false);
    this.viewPan.resize();
    if (
      this.framed &&
      this.viewMode === "full" &&
      !boxInView(this.camera, new Box3().setFromObject(this.characterRoot))
    )
      this.focus("full");
    this.invalidate();
  };

  private readonly invalidate = (): void => {
    if (this.disposed || this.frame) return;
    this.frame = requestAnimationFrame(this.render);
  };

  private readonly onNavigate = (): void => {
    this.viewMode = "custom";
    this.invalidate();
  };

  private readonly render = (): void => {
    this.frame = 0;
    if (this.disposed) return;
    const changed = this.controls.update();
    this.renderer.render(this.scene, this.camera);
    if (changed) this.invalidate();
  };

  private readonly onContextLost = (event: Event): void => {
    event.preventDefault();
    this.options.onError?.(
      "La vista 3D perdió la conexión gráfica. Si no se recupera, recarga la página.",
    );
  };

  private readonly onCameraKey = (event: KeyboardEvent): void => {
    if (
      ![
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "+",
        "=",
        "-",
        "Home",
      ].includes(event.key)
    )
      return;
    event.preventDefault();
    if (event.key === "Home") {
      this.focus("full");
      return;
    }
    this.viewMode = "custom";
    if (event.shiftKey && event.key.startsWith("Arrow")) {
      this.viewPan.shift(
        event.key === "ArrowLeft" ? -0.04 : event.key === "ArrowRight" ? 0.04 : 0,
        event.key === "ArrowUp" ? -0.04 : event.key === "ArrowDown" ? 0.04 : 0);
      this.controls.update();
      this.invalidate();
      return;
    }
    const offset = this.camera.position.clone().sub(this.controls.target);
    const orbit = new Spherical().setFromVector3(offset);
    if (event.key === "ArrowLeft") orbit.theta -= 0.12;
    if (event.key === "ArrowRight") orbit.theta += 0.12;
    if (event.key === "ArrowUp") orbit.phi -= 0.12;
    if (event.key === "ArrowDown") orbit.phi += 0.12;
    if (event.key === "+" || event.key === "=") orbit.radius *= 0.9;
    if (event.key === "-") orbit.radius /= 0.9;
    orbit.phi = Math.max(
      this.controls.minPolarAngle,
      Math.min(this.controls.maxPolarAngle, orbit.phi),
    );
    orbit.radius = Math.max(
      this.controls.minDistance,
      Math.min(this.controls.maxDistance, orbit.radius),
    );
    this.camera.position
      .copy(this.controls.target)
      .add(offset.setFromSpherical(orbit));
    this.controls.update();
    this.invalidate();
  };

  private clearHelpers(): void {
    for (const helper of [...this.helpers.children]) {
      const disposable = helper as Object3D & {
        dispose?: () => void;
        geometry?: { dispose: () => void };
        material?: Material | Material[];
      };
      if (disposable.dispose) disposable.dispose();
      else {
        disposable.geometry?.dispose();
        const material = disposable.material;
        if (material)
          (Array.isArray(material) ? material : [material]).forEach((value) =>
            value.dispose(),
          );
      }
    }
    this.helpers.clear();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.controls.removeEventListener("change", this.invalidate);
    this.controls.removeEventListener("start", this.onNavigate);
    this.controls.dispose();
    this.viewPan.dispose();
    this.renderer.domElement.removeEventListener("keydown", this.onCameraKey);
    this.assembler.dispose();
    this.assets.dispose();
    this.clearHelpers();
    this.floor.geometry.dispose();
    this.floor.material.dispose();
    this.key.shadow.dispose();
    this.scene.clear();
    this.renderer.domElement.removeEventListener(
      "webglcontextlost",
      this.onContextLost,
    );
    this.renderer.domElement.removeEventListener(
      "webglcontextrestored",
      this.invalidate,
    );
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
