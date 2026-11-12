"""blender -b --python scripts/roadster/export.py -- <out.glb>
Builds the roadster and writes the game's GLB: one node per part ("part_<id>"), each holding its parts merged
per material, plus the moving bits on their own pivots ("spin_front-wheel", "spin_rear-wheel", "needle_speedometer",
"needle_tachometer") and bolt markers ("bolt_<step>_<n>"); three.js drops ":" from names, so "_" separates. Metres, Y up (glTF), Draco-compressed.
Step membership comes from STEPS; a part missing from it stops the export, so nothing is silently left out."""
import sys
from collections import defaultdict
from fnmatch import fnmatch
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(Path(bpy.utils.user_resource("SCRIPTS")) / "modules"))
import sand3d as s3d
from sand3d import materials as s3d_materials
import spec
from build import MODULES

# The game's parts, frame first (already on the stand). Patterns match top-level part names. The game groups these
# into its 13 big build steps for the easy mode (src/lib/games/garage/steps.ts); the hard mode uses them one by one.
STEPS = [
    ("frame", ["head-tube", "frame-tubes", "pivot-plates", "engine-hangers"]),
    ("crankcase", ["crankcase", "oil-pan", "acg-cover", "clutch-cover", "pulse-cover", "starter-motor", "rear-engine-bolt",
                   "front-sprocket"]),
    ("cylinders", ["cylinder-block", "cylinder-head", "cam-cover", "cam-caps"]),
    ("carburettors", ["carburettors", "intake-boots", "air-box"]),
    ("oil-cooler", ["oil-cooler", "oil-hoses"]),
    ("swingarm", ["swingarm", "chain-adjusters", "pivot-bolt", "chain-guard"]),
    ("shocks", ["shock-mount-*", "shock-left", "shock-right"]),
    ("rear-wheel", ["rear-wheel", "rear-disc", "sprocket", "rear-axle"]),
    ("rear-brake", ["rear-caliper"]),
    ("chain", ["chain", "sprocket-cover"]),
    ("steering", ["steering-stem", "lower-clamp", "upper-clamp"]),
    ("fork-legs", ["fork-leg-*"]),
    ("front-wheel", ["front-wheel", "front-disc-*", "front-axle", "front-axle-nut-*"]),
    ("front-brakes", ["caliper-*"]),
    ("front-mudguard", ["front-mudguard", "mudguard-bracket"]),
    ("headers", ["header-*", "collector"]),
    ("silencers", ["link-pipe-*", "muffler-*", "passenger-peg-*"]),
    ("tank", ["tank", "filler-cap", "tank-badges", "knee-pads", "tank-stripes", "tank-mounts"]),
    ("seat", ["seat", "seat-pan", "seat-welts", "seat-strap"]),
    ("side-covers", ["side-cover-*"]),
    ("handlebars", ["riser-*", "handlebar", "bar-ends", "grip-*"]),
    ("controls", ["switchgear-*", "lever-*", "master-cylinder", "brake-hoses", "clutch-cable", "throttle-cables"]),
    ("mirrors", ["mirror-*"]),
    ("headlight", ["headlamp", "headlamp-ears", "indicator-front-*", "horns"]),
    ("clocks", ["speedometer", "tachometer", "gauge-bracket", "ignition"]),
    ("rear-mudguard", ["inner-fender", "tail-fender"]),
    ("tail-light", ["tail-lamp", "indicator-rear-*"]),
    ("footpegs", ["footpeg-*", "gear-lever", "brake-pedal"]),
    ("side-stand", ["side-stand"]),
]
# Parts that move in the game, by top-level part: (pivot name, the object whose frame is the pivot).
SPIN = {"front-wheel": "front-wheel", "front-disc-*": "front-wheel", "rear-wheel": "rear-wheel", "rear-disc": "rear-wheel",
        "sprocket": "rear-wheel"}
X = lambda x, y, z: Vector((x, y, z))
AX, AZ = spec.FRONT_AXLE
RX, RZ = spec.REAR_AXLE
# Where the child tightens bolts after a step goes on (mm, the bike's own axes; the right side faces the camera).
BOLTS = {
    "crankcase": [X(-150, -162, 430), X(322, -142, 272)],
    "swingarm": [X(spec.PIVOT[0], -180, spec.PIVOT[1])],
    "shocks": [X(-505, -170, 696)],
    "rear-wheel": [X(RX, -170, RZ)],
    "chain": [X(-102, 140, 318)],
    "steering": [X(364, 0, 984)],
    "front-wheel": [X(AX, -131, AZ)],
    "headers": [X(318, -120, 586)],
    "silencers": [X(-600, -178, 390)],
    "tank": [X(150, 0, 954)],
    "seat": [X(-520, -164, 790)],
    "handlebars": [X(330, -42, 1040), X(330, 42, 1040)],
    "headlight": [X(536, -84, 909)],
    "rear-mudguard": [X(-930, -60, 760)],
    "footpegs": [X(-212, -196, 292)],
}
# Every other part gets one bolt where it shows most on the right side: the vertex furthest right, near its middle.


def auto_bolt(objs):
    pts = [o.matrix_world @ v.co for o in objs for v in o.data.vertices]
    lo = Vector([min(p[i] for p in pts) for i in range(3)])
    hi = Vector([max(p[i] for p in pts) for i in range(3)])
    c = (lo + hi) / 2
    return max(pts, key=lambda p: -p.y - 0.6 * ((p.x - c.x) ** 2 + (p.z - c.z) ** 2) ** 0.5).copy()


def step_of(part):
    for step, patterns in STEPS:
        if any(fnmatch(part, p) for p in patterns):
            return step
    raise SystemExit(f"export: part {part!r} is in no build step")


def spin_of(part):
    return next((v for p, v in SPIN.items() if fnmatch(part, p)), None)


def top(obj, root):
    while obj.parent is not None and obj.parent != root:
        obj = obj.parent
    return obj


def join(objs):
    first = objs[0]
    for o in objs:
        o.data = o.data.copy()                   # ring copies share data; each joins as its own mesh
    if len(objs) > 1:
        with bpy.context.temp_override(active_object=first, object=first, selected_objects=objs, selected_editable_objects=objs):
            bpy.ops.object.join()
    return first


def main(out):
    s3d.empty_scene()
    s3d.units("mm")
    parts = [p for m in MODULES.values() for p in m.build()]
    root = s3d.group("roadster", *parts)
    bpy.context.view_layer.update()
    s3d_materials.resolve()
    # the tank's paint gets its own material so the game can respray it
    tank = next(o for o in parts if o.name.split(".")[0] == "tank")
    paint = tank.data.materials[0].copy()
    paint.name = "paint"
    tank.data.materials[0] = paint

    groups, frames = defaultdict(list), {}
    for obj in root.children_recursive:
        if obj.type != "MESH" or not len(obj.data.polygons):
            continue
        part_ob = top(obj, root)
        part = part_ob.name.split(".")[0]
        step, spin = step_of(part), spin_of(part)
        mover = None
        if spin:
            mover = f"spin_{spin}"
            frames[mover] = next(o for o in parts if o.name.split(".")[0] == spin).matrix_world.copy()
        elif part in ("speedometer", "tachometer") and obj.parent and obj.parent.name.split(".")[0] == "needle":
            mover = f"needle_{part}"
            frames[mover] = obj.parent.matrix_world.copy()
        mat = obj.data.materials[0] if obj.data.materials else None
        groups[(step, mover, mat.name if mat else "none")].append(obj)

    by_part = defaultdict(list)
    for (step, _, _), objs in groups.items():
        by_part[step] += objs
    bolt_points = {step: BOLTS.get(step) or [auto_bolt(by_part[step])] for step, _ in STEPS[1:]}   # before joining moves them

    keep = []
    scale = Matrix.Scale(0.001, 4)
    empties = {}

    def empty(name, matrix=Matrix.Identity(4), parent=None):
        e = bpy.data.objects.new(name, None)
        bpy.context.scene.collection.objects.link(e)
        e.matrix_world = matrix
        if parent:
            e.parent = parent
            e.matrix_parent_inverse = parent.matrix_world.inverted()
        keep.append(e)
        return e

    bike = empty("bike")
    for step, _ in STEPS:
        empties[step] = empty(f"part_{step}", parent=bike)
    for mover, m in frames.items():
        step = step_of(mover.split("_", 1)[1]) if mover.startswith("spin") else "clocks"
        loc, rot, _ = m.decompose()
        empties[mover] = empty(mover, Matrix.Translation(loc * 0.001) @ rot.to_matrix().to_4x4(), empties[step])
    stats = defaultdict(int)
    for (step, mover, mat), objs in sorted(groups.items(), key=lambda kv: (kv[0][0], kv[0][1] or "", kv[0][2])):
        ob = join(objs)
        mw = ob.matrix_world.copy()
        ob.parent = None
        ob.matrix_world = Matrix.Identity(4)
        ob.data.transform(scale @ mw)
        holder = empties[mover or step]
        if mover:
            ob.data.transform(holder.matrix_world.inverted())
        ob.parent = holder
        ob.name = f"{mover or step}|{mat}"
        keep.append(ob)
        stats[step] += sum(len(p.vertices) - 2 for p in ob.data.polygons)
    for step, points in bolt_points.items():
        for i, p in enumerate(points):
            empty(f"bolt_{step}_{i}", Matrix.Translation(p * 0.001), bike)
    for o in list(bpy.data.objects):
        if o not in keep:
            bpy.data.objects.remove(o, do_unlink=True)
    print("TRIANGLES", sum(stats.values()), dict(stats))
    print("MATERIALS", sorted({m.name for m in bpy.data.materials if m.users}))
    bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", use_selection=False, export_yup=True, export_apply=False,
                              export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=7,
                              export_draco_position_quantization=14, export_draco_normal_quantization=10,
                              export_extras=False, export_cameras=False, export_lights=False)
    print("wrote", out)


main(sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else str(HERE / "out" / "roadster.glb"))
