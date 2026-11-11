"""Fit check. MOUNTS says which parts are fastened to which; from that:
  CLASH     two parts interpenetrate but are not fastened together
  FLOATING  a part touches none of the parts it is fastened to
  LOOSE     a part has no chain of touching mounts back to the frame
The same list is the build graph the game will use (what each part goes onto)."""
from collections import defaultdict, deque
from fnmatch import fnmatch
from itertools import combinations

from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT = "frame-tubes"
MOUNTS = [
    # frame
    ("head-tube", "frame-tubes"), ("pivot-plates", "frame-tubes"), ("engine-hangers", "frame-tubes"), ("engine-hangers", "pivot-plates"),
    # steering and front wheel
    ("steering-stem", "head-tube"), ("*-clamp", "steering-stem"), ("fork-leg-*", "*-clamp"),
    ("front-axle", "fork-leg-*"), ("front-axle-nut-*", "front-axle"), ("front-axle-nut-*", "fork-leg-*"),
    ("front-wheel", "front-axle"), ("front-disc-*", "front-wheel"), ("front-disc-*", "front-axle"),
    ("caliper-*", "fork-leg-*"), ("mudguard-bracket", "fork-leg-*"), ("front-mudguard", "mudguard-bracket"),
    ("headlamp-ears", "fork-leg-*"), ("headlamp", "headlamp-ears"), ("indicator-front-*", "headlamp-ears"), ("horns", "lower-clamp"),
    ("brake-hoses", "caliper-*"), ("brake-hoses", "master-cylinder"),
    # cockpit
    ("riser-*", "upper-clamp"), ("handlebar", "riser-*"), ("bar-ends", "handlebar"), ("grip-*", "handlebar"),
    ("switchgear-*", "handlebar"), ("lever-*", "handlebar"), ("master-cylinder", "lever-right"), ("master-cylinder", "handlebar"),
    ("mirror-*", "lever-*"), ("mirror-right", "master-cylinder"), ("gauge-bracket", "upper-clamp"), ("speedometer", "gauge-bracket"), ("tachometer", "gauge-bracket"),
    # rear suspension and wheel
    ("pivot-bolt", "pivot-plates"), ("swingarm", "pivot-bolt"), ("swingarm", "pivot-plates"), ("chain-adjusters", "swingarm"),
    ("rear-axle", "swingarm"), ("rear-axle", "chain-adjusters"), ("rear-wheel", "rear-axle"), ("rear-disc", "rear-wheel"),
    ("rear-disc", "rear-axle"), ("sprocket", "rear-wheel"), ("sprocket", "rear-axle"), ("rear-caliper", "rear-axle"),
    ("shock-mount-*", "frame-tubes"), ("shock-*", "shock-mount-*"), ("shock-left", "swingarm"), ("shock-right", "swingarm"),
    ("chain", "sprocket"), ("chain", "front-sprocket"), ("chain-guard", "swingarm"), ("front-sprocket", "crankcase"),
    # engine
    ("crankcase", "engine-hangers"), ("rear-engine-bolt", "engine-hangers"), ("rear-engine-bolt", "crankcase"),
    ("oil-pan", "crankcase"), ("cylinder-block", "crankcase"), ("cylinder-head", "cylinder-block"), ("cam-cover", "cylinder-head"),
    ("cam-caps", "cylinder-head"), ("cam-caps", "cam-cover"), ("rear-engine-bolt", "pivot-plates"), ("*-cover", "crankcase"), ("sprocket-cover", "front-sprocket"), ("sprocket-cover", "chain"),
    ("carburettors", "cylinder-head"), ("intake-boots", "carburettors"), ("intake-boots", "air-box"),
    ("starter-motor", "crankcase"), ("oil-cooler", "frame-tubes"), ("oil-hoses", "oil-cooler"), ("oil-hoses", "crankcase"),
    ("engine-hangers", "cam-cover"), ("engine-hangers", "cylinder-head"), ("engine-hangers", "crankcase"),
    # exhaust
    ("header-*", "cylinder-head"), ("header-*", "collector"), ("link-pipe-*", "collector"), ("muffler-left", "link-pipe-left"),
    ("muffler-right", "link-pipe-right"), ("muffler-left", "passenger-peg-left"), ("muffler-right", "passenger-peg-right"),
    # bodywork
    ("tank-mounts", "frame-tubes"), ("tank", "tank-mounts"), ("filler-cap", "tank"), ("tank-badges", "tank"), ("knee-pads", "tank"), ("tank-stripes", "tank"), ("seat-welts", "seat"), ("seat-strap", "seat-welts"),
    ("tank-stripes", "knee-pads"), ("tank-stripes", "tank-badges"),
    ("seat-pan", "frame-tubes"), ("seat", "seat-pan"), ("seat", "tank"), ("seat-strap", "seat"),
    ("side-cover-*", "frame-tubes"), ("side-cover-*", "pivot-plates"), ("side-cover-left", "passenger-peg-left"),
    ("side-cover-right", "passenger-peg-right"), ("air-box", "frame-tubes"), ("inner-fender", "frame-tubes"),
    ("tail-fender", "frame-tubes"), ("tail-lamp", "tail-fender"), ("indicator-rear-*", "tail-fender"),
    # controls
    ("side-stand", "frame-tubes"), ("clutch-cable", "lever-left"), ("clutch-cable", "crankcase"), ("ignition", "gauge-bracket"),
    ("throttle-cables", "switchgear-right"), ("throttle-cables", "carburettors"),
    ("footpeg-*", "pivot-plates"), ("footpeg-*", "frame-tubes"), ("gear-lever", "footpeg-left"), ("gear-lever", "crankcase"), ("brake-pedal", "footpeg-right"),
    ("passenger-peg-*", "frame-tubes"), ("passenger-peg-*", "pivot-plates"),
]


def mounted(a, b):
    return any((fnmatch(a, p) and fnmatch(b, q)) or (fnmatch(b, p) and fnmatch(a, q)) for p, q in MOUNTS)


def _top(obj, root):
    while obj.parent is not None and obj.parent != root:
        obj = obj.parent
    return obj.name.split(".")[0]


def _tree(obj):
    m = obj.matrix_world
    verts = [m @ v.co for v in obj.data.vertices]
    polys = [tuple(p.vertices) for p in obj.data.polygons]
    return BVHTree.FromPolygons(verts, polys), verts, polys


def run(root, tol=1.5, show=60):
    groups = defaultdict(list)
    for obj in root.children_recursive:
        if obj.type == "MESH" and len(obj.data.polygons):
            groups[_top(obj, root)].append(obj)
    data = {g: [_tree(o) for o in objs] for g, objs in groups.items()}
    box = {}
    for g, items in data.items():
        vs = [v for _, verts, _ in items for v in verts]
        box[g] = (Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs))),
                  Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs))))

    def near(a, b):
        (a0, a1), (b0, b1) = box[a], box[b]
        return all(a0[i] - tol <= b1[i] and b0[i] - tol <= a1[i] for i in range(3))

    def overlap(a, b):
        hits, where = 0, None
        for ta, va, pa in data[a]:
            for tb, _, _ in data[b]:
                pairs = ta.overlap(tb)
                if pairs:
                    hits += len(pairs)
                    if where is None:
                        p = pa[pairs[0][0]]
                        where = sum((va[k] for k in p), Vector()) / len(p)
        return hits, where

    def touch(a, b):
        for src, dst in ((a, b), (b, a)):
            for _, verts, _ in data[src]:
                for tb, _, _ in data[dst]:
                    if any(tb.find_nearest(v, tol)[0] is not None for v in verts):
                        return True
        return False

    clashes, edges = [], defaultdict(set)
    for a, b in combinations(sorted(groups), 2):
        if not near(a, b):
            continue
        m = mounted(a, b)
        hits, where = overlap(a, b)
        if hits and not m:
            clashes.append((hits, a, b, where))
        if m and (hits or touch(a, b)):
            edges[a].add(b)
            edges[b].add(a)

    unruled = [g for g in groups if g != ROOT and not any(mounted(g, h) for h in groups if h != g)]
    floating = [g for g in groups if g != ROOT and not edges[g] and g not in unruled]
    seen, todo = {ROOT}, deque([ROOT])
    while todo:
        for h in edges[todo.popleft()]:
            if h not in seen:
                seen.add(h)
                todo.append(h)
    loose = [g for g in groups if g not in seen and g not in floating and g not in unruled]

    clashes.sort(reverse=True)
    print(f"PARTS: {len(groups)}")
    print(f"CLASH: {len(clashes)} pairs")
    for hits, a, b, w in clashes[:show]:
        print(f"  {a:24s} x {b:24s} {hits:6d} tris  near x={w.x:.0f} y={w.y:.0f} z={w.z:.0f}")
    print(f"FLOATING: {len(floating)}  {' '.join(sorted(floating))}")
    print(f"LOOSE: {len(loose)}  {' '.join(sorted(loose))}")
    print(f"NO MOUNT RULE: {len(unruled)}  {' '.join(sorted(unruled))}")
    return clashes, floating, loose, unruled
