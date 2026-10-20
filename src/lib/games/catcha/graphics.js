import * as THREE from "three";
import { createGraphicsPolicy } from "./graphics-settings.js";

/** One scene target + one cheap copy; the existing single HUD composes at native resolution. */
export function createGraphics(renderer) {
  let storage = null;
  try { storage = localStorage; } catch { /* unavailable storage */ }
  const policy = createGraphicsPolicy(storage);
  const hdr = renderer.extensions.has("EXT_color_buffer_float");
  const gl = renderer.getContext();
  const supportedSamples = gl.getInternalformatParameter(gl.RENDERBUFFER, hdr ? gl.RGBA16F : gl.RGBA8, gl.SAMPLES);
  const samplesForMode = () => {
    const ceiling = policy.mode.id === "ultra" ? 4 : 2;
    const available = Array.from(supportedSamples ?? []).filter(n => n > 0 && n <= 4);
    const preferred = Math.max(0, ...available.filter(n => n <= ceiling));
    // Some mobile drivers expose only 4×: keep edge smoothing on Auto/High on those devices.
    return preferred || (policy.mode.id !== "battery" && available.length ? Math.min(...available) : 0);
  };
  const target = new THREE.WebGLRenderTarget(1, 1, {
    samples: samplesForMode(),
    type: hdr ? THREE.HalfFloatType : THREE.UnsignedByteType,
    stencilBuffer: false, resolveDepthBuffer: false, resolveStencilBuffer: false,
  });
  target.texture.colorSpace = THREE.LinearSRGBColorSpace;
  target.texture.generateMipmaps = false;
  const present = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({
    map: target.texture, toneMapped: true, depthTest: false, depthWrite: false,
  }));
  quad.userData.tag = "world-presenter"; quad.frustumCulled = false; present.add(quad);
  // Cheap screen-space pieces drawn over the world but under the HUD (the touch joystick), so a
  // moving thumb doesn't repaint and re-upload the whole full-screen HUD canvas every frame.
  const overlay = new THREE.Group();
  overlay.userData.tag = "screen-overlay";
  present.add(overlay);
  renderer.shadowMap.autoUpdate = false;
  let width = 1, height = 1, dpr = 1, dimensions = policy.dimensions(1, 1, 1);
  let light = null, shadowTime = 1, shadowRenders = 0, sceneRenders = 0;
  let lastSceneStamp = null, sceneDirty = true, presentDirty = true, skipped = 0, lastDraw = 0, last = 0, worldCalls = 0, worldTriangles = 0;
  function invalidate() { sceneDirty = presentDirty = true; renderer.shadowMap.needsUpdate = true; }
  renderer.domElement.addEventListener("webglcontextrestored", () => { last = 0; resize(); });
  function resize(w = width, h = height, pixelRatio = dpr) {
    width = w; height = h; dpr = pixelRatio;
    dimensions = policy.dimensions(w, h, dpr);
    if (renderer.getPixelRatio() !== dimensions.screenRatio) renderer.setPixelRatio(dimensions.screenRatio);
    if (renderer.domElement.width !== dimensions.screenWidth || renderer.domElement.height !== dimensions.screenHeight)
      renderer.setSize(w, h, false);
    if (target.width !== dimensions.sceneWidth || target.height !== dimensions.sceneHeight)
      target.setSize(dimensions.sceneWidth, dimensions.sceneHeight);
    invalidate();
  }
  function shadows() {
    if (!light || light.shadow.mapSize.x === policy.mode.shadow) return;
    light.shadow.mapSize.set(policy.mode.shadow, policy.mode.shadow);
    light.shadow.map?.dispose(); light.shadow.map = null;
    invalidate();
  }
  function fitShadow(sun) {
    // Spend shadow texels on the room instead of the large empty margin around it.
    // Includes walls, airborne children/carried items and both kitchen/playroom footprints.
    sun.updateWorldMatrix(true, false); sun.target.updateWorldMatrix(true, false);
    sun.shadow.updateMatrices(sun);
    const view = sun.shadow.camera, bounds = new THREE.Box3(), point = new THREE.Vector3();
    for (const x of [-14, 14]) for (const y of [-1, 10]) for (const z of [-11, 11])
      bounds.expandByPoint(point.set(x, y, z).applyMatrix4(view.matrixWorldInverse));
    view.left = Math.floor(bounds.min.x - 1); view.right = Math.ceil(bounds.max.x + 1);
    view.bottom = Math.floor(bounds.min.y - 1); view.top = Math.ceil(bounds.max.y + 1);
    view.updateProjectionMatrix();
    invalidate();
  }
  return {
    resize, invalidate, overlay,
    /** The overlay changed: present again (no world redraw). */
    touch() { presentDirty = true; },
    setLight(sun) { light = sun; fitShadow(sun); shadows(); },
    setMode(id, persist = true) {
      policy.setMode(id, persist);
      const samples = samplesForMode();
      if (target.samples !== samples) { target.dispose(); target.samples = samples; }
      shadows(); resize(); return policy.mode.id;
    },
    sample(active) {
      const now = performance.now(), dt = last ? now - last : 0; last = now;
      if (policy.sample(dt, active)) resize();
    },
    step(dt, animate) {
      if (!animate) return;
      shadowTime += dt;
      if (shadowTime >= 1 / policy.mode.shadowHz) {
        shadowTime %= 1 / policy.mode.shadowHz;
        renderer.shadowMap.needsUpdate = true;
      }
    },
    /** Returns false (draws nothing, the last frame stays up) when neither world, overlay nor HUD changed. */
    draw(scene, view, stamp, hudDirty = true) {
      const worldChanged = sceneDirty || stamp !== lastSceneStamp;
      if (!worldChanged && !presentDirty && !hudDirty) { skipped += 1; return false; }
      // Battery Saver draws at most 30 times a second (the game itself still steps at 60).
      const now = performance.now(), cap = policy.mode.fps;
      if (cap && now - lastDraw < 1000 / cap - 4) { skipped += 1; return false; }
      lastDraw = now;
      // Paused/menu world is reused; the HUD can change without redrawing all the furniture.
      if (worldChanged) {
        const shadow = renderer.shadowMap.needsUpdate;
        renderer.setRenderTarget(target);
        renderer.render(scene, view);
        worldCalls = renderer.info.render.calls; worldTriangles = renderer.info.render.triangles;
        renderer.setRenderTarget(null);
        sceneRenders += 1; if (shadow) shadowRenders += 1;
        lastSceneStamp = stamp; sceneDirty = false;
      }
      renderer.render(present, camera);
      presentDirty = false;
      return true;
    },
    snapshot() {
      return { mode: policy.mode.id, name: policy.mode.name, fps: policy.fps, ...dimensions,
        samples: target.samples, shadowSize: policy.mode.shadow, shadowHz: policy.mode.shadowHz,
        hdr, sceneRenders, shadowRenders, skipped, worldCalls, worldTriangles,
        shadowBounds: light ? { left: light.shadow.camera.left, right: light.shadow.camera.right,
          bottom: light.shadow.camera.bottom, top: light.shadow.camera.top } : null };
    },
  };
}
