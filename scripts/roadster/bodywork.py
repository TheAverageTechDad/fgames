"""Tank, seat on its pan, side covers on grommets, rear inner fender, tail with lamp and indicators,
headlamp on ears clamped to the fork, front indicators, twin horns."""
from math import cos, radians, sin

import sand3d as s3d

import spec
from util import axial, alloy, black, chrome, leg, on_leg, paint, rod, rubber, xz_plate

RED = "#8f1019"
AMBER = "#e08a10"


def _along_x(name, plan, top, bottom, n):
    """A body drawn in side view (x, z) and plan (x, width), laid along X."""
    return s3d.at(s3d.body(name, plan, top, bottom, n=n), rz=-90)


TANK_TOP = [(-206, 810), (-160, 858), (-90, 902), (40, 940), (120, 956), (250, 944), (318, 916), (362, 868), (386, 800)]
TANK_BOTTOM = [(-206, 772), (-150, 742), (-60, 728), (300, 728), (372, 746), (386, 772)]
TANK_PLAN = [(-206, 190), (-150, 262), (-60, 318), (60, 352), (200, 362), (300, 330), (352, 266), (386, 150)]


def _tank_body(name, t=0.0):
    top = [(x, z + t) for x, z in TANK_TOP]
    bottom = [(x, z - t) for x, z in TANK_BOTTOM]
    plan = [(x, w + 2 * t) for x, w in TANK_PLAN]
    return _along_x(name, plan, s3d.spline(top), bottom, 2.8)


def _side_tool(x0, x1, z0, z1, r=0):
    """A prism through both flanks of the tank (clear of the centre tunnel) over x0..x1, z0..z1."""
    sides = []
    for s in (1, -1):
        p = s3d.extrude("tool", s3d.rect(x1 - x0, z1 - z0, r=r), 170)
        sides.append(s3d.at(p, x=(x0 + x1) / 2, z=(z0 + z1) / 2, y=230 if s > 0 else -60, rx=90))
    return s3d.join(*sides)


def _skin(name, t, *tools):
    """A layer t mm proud of the tank's paint, only where the tools are: pads, stripes, badges that follow its curve."""
    outer = _tank_body(name, t)
    tool = tools[0] if len(tools) == 1 else s3d.join(*tools)
    s3d.intersect(outer, tool)
    s3d.cut(outer, _tank_body("inner"))
    return outer


def tank():
    shell = _tank_body("tank")
    tunnel = s3d.extrude("tunnel", s3d.poly([(-260, 600), (-260, 786), (-140, 784), (120, 796), (340, 824), (450, 884), (450, 600)]),
                         104, both=True)
    s3d.cut(shell, s3d.at(tunnel, rx=90))
    shell = paint(shell, RED, 0.12)
    cap = chrome(s3d.at(s3d.revolve("filler-cap", axial([(0, 0), (40, 0), (40, 6), (34, 12), (0, 14)], 2)), x=150, z=946))
    badges = [chrome(_skin("tank-badges", 2.2, _side_tool(176, 262, 864, 884, r=9)))]
    pads = [black(_skin("knee-pads", 2.5, _side_tool(-132, -14, 772, 846, r=34)), 0.7)]
    stripes = [paint(_skin("tank-stripes", 0.8, _side_tool(-150, 400, 834, 838), _side_tool(-150, 400, 843, 847)), "#c9a24c", 0.3)]
    # rubber blocks between the backbone and the tunnel roof carry the tank
    mounts = [s3d.at(s3d.box("pad", 34, 44, 18), x=300, z=804), s3d.at(s3d.box("pad", 34, 44, 26), x=-176, z=760)]
    pads_ = pads
    return [shell, s3d.group("filler-cap", cap), *badges, *pads_, *stripes, rubber(s3d.group("tank-mounts", *mounts))]


SEAT_TOP = [(-198, 812), (-260, 806), (-420, 806), (-600, 814), (-720, 836), (-800, 858), (-860, 864), (-894, 850)]
SEAT_BOTTOM = [(-198, 762), (-300, 754), (-600, 754), (-800, 768), (-894, 782)]
SEAT_PLAN = [(-198, 212), (-260, 282), (-420, 330), (-650, 322), (-820, 292), (-894, 220)]


def _lerp(pts, x):
    for (x0, v0), (x1, v1) in zip(pts, pts[1:]):
        if x1 <= x <= x0 or x0 <= x <= x1:
            return v0 + (v1 - v0) * (x - x0) / (x1 - x0)
    return pts[-1][1]


def _welt(s, n=3.4):
    """Piping along the seat's shoulder, where its top meets its side."""
    k = 2 ** (-1 / n)
    pts = []
    for i in range(18):
        x = -206 - i * 39
        top, bot, w = _lerp(SEAT_TOP, x), _lerp(SEAT_BOTTOM, x), _lerp(SEAT_PLAN, x)
        pts.append((x, s * k * w / 2, (top + bot) / 2 + k * (top - bot) / 2))
    return pts


def seat():
    cover = black(_along_x("seat", SEAT_PLAN, s3d.spline(SEAT_TOP), SEAT_BOTTOM, 3.4), 0.75)
    pan_top = [(x, z + 2) for x, z in SEAT_BOTTOM]
    pan_bot = [(x, z - 12) for x, z in SEAT_BOTTOM]
    pan_plan = [(x, w - 12) for x, w in SEAT_PLAN]
    pan = black(_along_x("seat-pan", pan_plan, pan_top, pan_bot, 4), 0.55)
    welts = black(s3d.group("seat-welts", *[s3d.wire("welt", s3d.spline(_welt(s)), 7) for s in (1, -1)]), 0.5)
    strap = rubber(s3d.wire("seat-strap", [(-520, -164, 756), (-520, -160, 796), (-520, -110, 810), (-520, 110, 810),
                                           (-520, 160, 796), (-520, 164, 756)], 9, fillet=24))
    return [cover, pan, welts, strap]


def side_covers():
    out = []
    for s, side in ((1, "left"), (-1, "right")):
        prof = s3d.poly([(-414, 704), (-166, 704), (-198, 636), (-284, 492)], fillet=30)
        panel = s3d.extrude("panel", prof, 12, both=True)
        s3d.soften(panel, 4.5)
        panel = alloy(s3d.at(panel, rx=90, y=s * 184), "#c9ccd0", 0.3)
        emblem = black(xz_plate("emblem", [(-332, 664), (-232, 664), (-232, 676), (-332, 676)], 2, s * 190.5, fillet=4), 0.3)
        grommets = rubber(s3d.group("grommets", rod("g", (-214, s * 128, 692), (-214, s * 180, 692), 18),
                                    rod("g", (-262, s * 154, 520), (-262, s * 180, 520), 18)))
        out.append(s3d.group(f"side-cover-{side}", panel, emblem, grommets))
    return out


def inner_fender():
    rx, rz = spec.REAR_AXLE
    r = spec.REAR["r"] + 24
    prof = s3d.poly([(r - 26, -76), (r + 3, -76), (r + 3, 76), (r - 26, 76), (r - 26, 73), (r, 73), (r, -73), (r - 26, -73)])
    shell = s3d.at(s3d.revolve("shell", prof, angle=60), rz=60)
    shell = s3d.at(s3d.group("arc", shell), x=rx, z=rz, rx=90)
    bx = -640
    bz = rz + (r * r - (bx - rx) ** 2) ** 0.5
    bracket = xz_plate("bracket", [(bx - 22, bz - 4), (bx + 22, bz - 4), (bx + 14, 716), (bx - 14, 716)], 8, 0, fillet=4)
    return black(s3d.group("inner-fender", shell, bracket), 0.45)


def tail():
    path = [(-846, 750), (-904, 744), (-980, 716), (-1018, 676), (-1030, 640)]
    fender = s3d.extrude("tail-fender", s3d.stroke(path, 5), 150, both=True)
    fender = black(s3d.at(fender, rx=90), 0.4)
    housing = s3d.extrude("lamp-housing", s3d.rect(64, 120, r=14), 42)
    s3d.soften(housing, 6)
    housing = black(s3d.at(housing, x=-932, z=724), 0.35)
    lens = s3d.material(s3d.at(s3d.extrude("tail-lens", s3d.rect(34, 112, r=10), 8, both=True), x=-962, z=745, ry=90),
                        "glass", color="#b3121a", opacity=0.8)
    plate_holder = black(s3d.at(s3d.extrude("plate-holder", s3d.rect(150, 116, r=8), 4, both=True), x=-1036, z=578, ry=90 - 8), 0.4)
    out = [s3d.group("tail-fender", fender, plate_holder), s3d.group("tail-lamp", housing, lens)]
    for s, side in ((1, "left"), (-1, "right")):
        stalk = black(rod("stalk", (-1000, s * 60, 700), (-1000, s * 126, 700), 12), 0.4)
        lens = s3d.material(s3d.at(s3d.extrude("lens", s3d.rect(46, 22, r=9), 22, both=True), x=-1000, y=s * 136, z=700, rx=90),
                            "glass", color=AMBER, opacity=0.85)
        out.append(s3d.group(f"indicator-rear-{side}", stalk, lens))
    return out


def headlamp():
    cx, cz = spec.lamp_centre()
    bucket = s3d.revolve("bucket", axial([(0, -128), (48, -126), (76, -96), (90, -46), (92, -6), (0, -6)], 10))
    bucket = paint(s3d.at(bucket, x=cx, z=cz, ry=90), "#16171a", 0.25)
    rim = chrome(s3d.at(s3d.revolve("rim", axial([(80, -10), (96, -10), (97, 4), (92, 16), (84, 14), (80, 4)], 2)),
                        x=cx, z=cz, ry=90))
    reflector = chrome(s3d.at(s3d.revolve("reflector", s3d.poly([(0, -40), (30, -38), (70, -18), (82, -2), (0, -2)])), x=cx, z=cz, ry=90))
    lens = s3d.material(s3d.at(s3d.dome("lens", 168, 18), x=cx + 2, z=cz, ry=90), "glass", color="#e6edf2", opacity=0.35)
    ring = s3d.material(s3d.at(s3d.tube("drl", 150, 136, 3), x=cx - 4, z=cz, ry=90), "plastic", color="#f4f6f8", roughness=0.2)
    lamp = s3d.group("headlamp", bucket, rim, reflector, lens, ring)
    ears = []
    for s in (1, -1):
        clamp = on_leg(s3d.tube("ear-clamp", 54, 41, 26), 628, s * spec.FORK_SPREAD / 2)
        lx, _, lz = leg(641, s * spec.FORK_SPREAD / 2)
        arm = rod("ear", (lx + 18, s * 92, lz), (cx - 64, s * 82, cz), 20)
        ears.append(s3d.group("ear", clamp, arm))
    return [lamp, chrome(s3d.group("headlamp-ears", *ears))]


def front_indicators():
    cx, cz = spec.lamp_centre()
    out = []
    for s, side in ((1, "left"), (-1, "right")):
        lx, _, lz = leg(641, s * spec.FORK_SPREAD / 2)
        mx, mz = (lx + 18 + cx - 64) / 2, (lz + cz) / 2
        stalk = black(rod("stalk", (mx, s * 84, mz), (mx, s * 150, mz), 12), 0.4)
        lens = s3d.extrude("lens", s3d.poly([(-30, -10), (22, -10), (32, 0), (22, 10), (-30, 10)], fillet=4), 20, both=True)
        lens = s3d.material(s3d.at(lens, x=mx + 4, y=s * 160, z=mz, rx=90), "glass", color=AMBER, opacity=0.85)
        out.append(s3d.group(f"indicator-front-{side}", stalk, lens))
    return out


def horns():
    out = []
    for s in (1, -1):
        x, _, z = spec.axis(spec.CLAMP_LOW)
        hx, hz = x + 52 * spec.FWD[0] + 30, z - 58
        disc = s3d.revolve("horn", axial([(0, 0), (30, 0), (30, 16), (25, 26), (0, 26)], 3))
        disc = black(s3d.at(disc, x=hx, y=s * 36, z=hz, ry=90), 0.3)
        grille = chrome(s3d.at(s3d.tube("horn-rim", 60, 48, 4), x=hx + 25, y=s * 36, z=hz, ry=90))
        stay = black(rod("stay", (hx + 4, s * 36, hz + 18), (x + 52 * spec.FWD[0], s * 36, z + 52 * spec.FWD[1] + 6), 12), 0.4)
        out += [disc, grille, stay]
    return s3d.group("horns", *out)


def build():
    return [*tank(), *seat(), *side_covers(), inner_fender(), *tail(), *headlamp(), *front_indicators(), horns()]
