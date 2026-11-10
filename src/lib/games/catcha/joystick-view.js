/**
 * The touch joystick, drawn as a few flat meshes in the screen overlay (graphics.js) instead of in
 * the HUD canvas. The thumb moves every frame while she runs; in the canvas HUD that meant painting
 * and uploading the whole screen-sized texture every frame — the game's biggest cost on phones.
 *
 *   const stick = createJoystickView(graphics.overlay);
 *   if (stick.sync(layout.stick, layout.w, layout.h)) graphics.touch();  // stick: null hides it
 *
 * `stick` (from game-ui's layout, CSS px): { x, y, r, tx, ty, sprint, staminaShown, stamina, tired }.
 */
import * as THREE from "three";

const INK = "#241b3a", CREAM = "#fff3df", ORANGE = "#f8824f";

export function createJoystickView(parent) {
  const group = new THREE.Group();
  group.userData.tag = "joystick";
  group.visible = false;
  parent.add(group);
  const mat = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, toneMapped: false, depthTest: false, depthWrite: false });
  const piece = (geometry, material, order) => {
    const m = new THREE.Mesh(geometry, material);
    m.renderOrder = order;
    m.frustumCulled = false;
    group.add(m);
    return m;
  };
  const base = piece(new THREE.CircleGeometry(1, 48), mat(INK, 0.2), 1);
  const ring = piece(new THREE.BufferGeometry(), mat(CREAM, 0.75), 2);
  const glow = piece(new THREE.BufferGeometry(), mat("#3dff8a", 0.4), 3);
  const arc = piece(new THREE.BufferGeometry(), mat("#3dff8a"), 4);
  const thumbInk = piece(new THREE.CircleGeometry(22.5, 32), mat(INK), 5);
  const thumb = piece(new THREE.CircleGeometry(19.5, 32), mat(CREAM), 6);
  const ringOf = (mesh, inner, outer, start = 0, length = Math.PI * 2) => {
    mesh.geometry.dispose();
    mesh.geometry = new THREE.RingGeometry(inner, outer, Math.max(8, Math.round(64 * length / (Math.PI * 2))), 1, start, length);
  };
  let key = "", radius = 0, arcKey = "";

  return {
    /** Returns true when anything visible changed (the overlay needs presenting again). */
    sync(stick, w, h) {
      if (!stick) {
        if (!group.visible) return false;
        group.visible = false;
        key = "";
        return true;
      }
      // a quarter-pixel thumb grid and a 1/64 stamina step: tiny jitters don't cost a frame
      const s = stick.staminaShown ? Math.max(1, Math.round((stick.stamina ?? 1) * 64)) / 64 : 0;
      const k = [w, h, stick.x, stick.y, stick.r, Math.round(stick.tx * 4), Math.round(stick.ty * 4), stick.sprint, s, stick.tired].join();
      if (k === key && group.visible) return false;
      key = k;
      group.visible = true;
      group.position.set((stick.x / w) * 2 - 1, 1 - (stick.y / h) * 2, 0);
      group.scale.set(2 / w, 2 / h, 1); // children are in CSS px, y up
      if (stick.r !== radius) { radius = stick.r; base.scale.setScalar(radius); ringOf(ring, radius - 2, radius + 2); }
      ring.material.color.set(stick.staminaShown ? CREAM : stick.sprint ? "#ff9a6b" : CREAM);
      ring.material.opacity = stick.staminaShown ? 0.3 : stick.sprint ? 1 : 0.75;
      glow.visible = arc.visible = s > 0;
      if (s > 0) {
        const a = `${s}:${radius}`;
        // clockwise from the top, like the canvas gauge it replaces
        if (a !== arcKey) { arcKey = a; ringOf(glow, radius - 5.5, radius + 5.5, Math.PI / 2 - s * Math.PI * 2, s * Math.PI * 2); ringOf(arc, radius - 2.5, radius + 2.5, Math.PI / 2 - s * Math.PI * 2, s * Math.PI * 2); }
        const color = stick.tired ? "#ff6b5b" : "#3dff8a";
        glow.material.color.set(color);
        arc.material.color.set(color);
      }
      thumb.material.color.set(stick.sprint && !stick.tired ? ORANGE : CREAM);
      for (const m of [thumbInk, thumb]) m.position.set(stick.tx - stick.x, stick.y - stick.ty, 0);
      return true;
    },
  };
}
