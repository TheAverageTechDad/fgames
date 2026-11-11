"""Fixed review renders (EEVEE) so every pass is judged from the same angles."""
import bpy
from math import radians
from mathutils import Vector

VIEWS = {  # name: (camera position, look-at, ortho scale or None for perspective)
    "side": ((0, -9000, 560), (0, 0, 560), 2300),
    "hero": ((2300, -2900, 640), (30, 0, 500), None),
    "engine34": ((1100, -1700, 760), (40, 0, 430), None),
    "cockpit34": ((-300, -900, 1500), (420, 0, 960), None),
    "tank34": ((900, -1300, 1250), (60, 0, 760), None),
    "left34": ((1900, 2600, 900), (40, 0, 480), None),
    "front34": ((2500, -2500, 1050), (80, 0, 520), None),
    "rear34": ((-2400, 2300, 1000), (-120, 0, 520), None),
    "front": ((9000, 0, 600), (0, 0, 600), 1250),
    "top": ((0, 0, 9000), (0, 0, 0), 2300),
    # close-ups: right side, ortho
    "z-front": ((700, -6000, 450), (700, 0, 450), 800),
    "z-rear": ((-700, -6000, 450), (-700, 0, 450), 800),
    "z-mid": ((0, -6000, 640), (0, 0, 640), 800),
    "z-cockpit": ((350, -6000, 900), (350, 0, 900), 800),
    "z-engine": ((0, -6000, 400), (0, 0, 400), 700),
}


def _look(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def studio():
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x, scene.render.resolution_y = 1400, 900
    scene.view_settings.view_transform = "AgX"
    world = bpy.data.worlds.new("sky")
    world.use_nodes = True
    nodes = world.node_tree.nodes
    sky = nodes.new("ShaderNodeTexSky")
    sky.sky_type = "SINGLE_SCATTERING"
    sky.sun_elevation = radians(50)
    sky.sun_rotation = radians(235)
    sky.sun_intensity = 0.9
    sky.air_density = 0.6
    sky.sun_size = radians(6)
    # the sky lights and reflects; the camera sees a flat mid-grey backdrop so silhouettes read
    path = nodes.new("ShaderNodeLightPath")
    mix = nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.inputs[7].default_value = (0.30, 0.31, 0.33, 1)   # B: what the camera sees
    links = world.node_tree.links
    links.new(path.outputs["Is Camera Ray"], mix.inputs[0])
    links.new(sky.outputs[0], mix.inputs[6])               # A: what lights the bike
    links.new(mix.outputs[2], nodes["Background"].inputs[0])
    try:
        scene.view_settings.look = "AgX - High Contrast"
    except TypeError:
        pass
    scene.view_settings.exposure = -1.2
    scene.world = world
    # a soft key light from above-front-left gives real cast shadows: the bike sits on the floor, parts shade each other
    bpy.ops.object.light_add(type="SUN", rotation=(radians(24), radians(-14), radians(-30)))
    sun = bpy.context.object.data
    sun.energy, sun.angle = 3.2, radians(6)
    ee = scene.eevee
    for attr, val in (("use_raytracing", False), ("use_shadows", True), ("use_fast_gi", False), ("shadow_ray_count", 2),
                      ("shadow_step_count", 8), ("taa_render_samples", 48)):
        if hasattr(ee, attr):
            setattr(ee, attr, val)
    # an opaque studio floor the bike stands on and shadows fall across
    bpy.ops.mesh.primitive_plane_add(size=40000, location=(0, 0, -0.5))
    floor = bpy.context.object
    mat = bpy.data.materials.new("floor")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (0.20, 0.205, 0.215, 1)
    bsdf.inputs["Roughness"].default_value = 0.6
    floor.data.materials.append(mat)
    # perspective shots stand on a seamless cove instead, so there is no horizon line
    from math import cos as _c, sin as _s
    prof = [(0, 0), (4000, 0)] + [(4000 + 1500 * _c(radians(a)), 1500 + 1500 * _s(radians(a))) for a in range(-80, 1, 10)] + [(5500, 6000)]
    verts, faces, n = [], [], 96
    for i in range(n):
        t = 2 * 3.14159265 * i / n
        verts += [(r * _c(t), r * _s(t), z - 0.6) for r, z in prof]
    m = len(prof)
    for i in range(n):
        j = (i + 1) % n
        faces += [(i * m + k, i * m + k + 1, j * m + k + 1, j * m + k) for k in range(m - 1)]
    mesh = bpy.data.meshes.new("cove")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    for p in mesh.polygons:
        p.use_smooth = True
    cove = bpy.data.objects.new("cove", mesh)
    scene.collection.objects.link(cove)
    cove.data.materials.append(mat)
    return scene


def render_views(prefix, names=None):
    scene = bpy.context.scene
    if scene.world is None or scene.world.name != "sky":
        studio()
    bpy.ops.object.camera_add()
    cam = bpy.context.object
    cam.data.clip_end = 100000
    scene.camera = cam
    for name in names or VIEWS:
        pos, target, ortho = VIEWS[name]
        cam.location = pos
        _look(cam, target)
        cove, floor = bpy.data.objects.get("cove"), bpy.data.objects.get("Plane")
        if cove and floor:
            cove.hide_render, floor.hide_render = bool(ortho), not ortho
        if ortho:
            cam.data.type, cam.data.ortho_scale = "ORTHO", ortho
        else:
            cam.data.type, cam.data.lens = "PERSP", 55
        scene.render.filepath = f"{prefix}-{name}.png"
        bpy.ops.render.render(write_still=True)
