"""Bar risers on the top clamp, handlebar, grips, switch housings, perches, levers, master cylinder, mirrors,
twin gauges on a bracket. Everything is placed off the top clamp's top face."""
from math import cos, radians, sin

import sand3d as s3d

import spec
from util import axial, alloy, black, chrome, rod, rubber

TOP = spec.CLAMP_HIGH + 22                # top clamp's upper face, mm up the steering axis
F = spec.FWD


def clamp_point(fwd, y, up=0.0):
    x, _, z = spec.axis(TOP + up)
    return (x + fwd * F[0], y, z + fwd * F[1])


B = clamp_point(-8, 0, 54)                 # handlebar centre


def bar_at(y):
    """Point on the bar's centre line at lateral offset y (either side)."""
    s = 1 if y >= 0 else -1
    pts = [(0, 0, 0), (-4, 150, 2), (-50, 290, 12), (-100, 370, 16), (-106, 392, 16)]
    a = abs(y)
    for (x0, y0, z0), (x1, y1, z1) in zip(pts, pts[1:]):
        if a <= y1:
            t = (a - y0) / (y1 - y0)
            return (B[0] + x0 + t * (x1 - x0), y, B[2] + z0 + t * (z1 - z0))
    return (B[0] + pts[-1][0], s * pts[-1][1], B[2] + pts[-1][2])


def risers():
    out = []
    for s, side in ((1, "left"), (-1, "right")):
        x, y, z = clamp_point(-8, s * 42, -3)
        post = s3d.at(s3d.cylinder("post", 34, 50), x=x, y=y, z=z, ry=-spec.RAKE)
        x, y, z = clamp_point(-8, s * 42, 54)
        cap = s3d.at(s3d.box("cap", 40, 38, 30), x=x, y=y, z=z - 15, ry=-spec.RAKE)
        bolts = []
        for f in (-11, 11):
            for dy in (-12, 12):
                bx, by, bz = clamp_point(-8 + f, s * 42 + dy, 0)
                ux, uz = spec.UP[0] * 30, spec.UP[1] * 30           # up to the cap's top face
                bolts.append(s3d.at(s3d.extrude("bolt", s3d.polygon(6, 10), 6), x=x - 13.2 + f * F[0] + 0, y=by,
                                    z=z - 15 + uz + f * F[1] - 1, ry=-spec.RAKE))
        out.append(s3d.group(f"riser-{side}", alloy(s3d.group("r", post, cap), "#cfd2d5", 0.24), chrome(s3d.group("bolts", *bolts))))
    return out


def bars():
    sides = [s3d.wire(f"bar-{n}", [bar_at(s * y) for y in (0, 150, 290, 370, 392)], 22.2, fillet=[0, 90, 80, 0, 0])
             for s, n in ((1, "left"), (-1, "right"))]
    ends = [chrome(s3d.at(s3d.cylinder("bar-end", 30, 14), x=bar_at(s * 392)[0], y=s * 399 if s > 0 else -385, z=bar_at(392)[2], rx=90))
            for s in (1, -1)]
    return [chrome(s3d.group("handlebar", *sides)), s3d.group("bar-ends", *ends)]


def grips():
    return [rubber(s3d.group(f"grip-{side}", rod("grip", bar_at(s * 274), bar_at(s * 376), 32)))
            for s, side in ((1, "left"), (-1, "right"))]


def switches():
    out = []
    for s, side in ((1, "left"), (-1, "right")):
        x, y, z = bar_at(s * 247)
        box = s3d.extrude("switch", s3d.rect(52, 46, r=12), 32, both=True)
        box = s3d.at(box, x=x, y=y, z=z, rx=90)
        button = s3d.at(s3d.box("button", 14, 16, 10), x=x - 22, y=y, z=z + 4)
        body = black(s3d.group(f"switchgear-{side}", box, button), 0.4)
        if s < 0:
            s3d.material(button, "plastic", color="#b5121b", roughness=0.4)
        out.append(body)
    return out


def levers():
    out = []
    for s, side in ((1, "left"), (-1, "right")):
        x, y, z = bar_at(s * 214)
        perch = alloy(s3d.at(s3d.cylinder("perch", 34, 28), x=x, y=y + 14, z=z, rx=90), "#c8cbcf", 0.3)
        boss = alloy(rod("boss", (x, y, z), (x + 30, y + s * 6, z - 2), 22), "#c8cbcf", 0.3)
        blade = chrome(s3d.wire("blade", [(x + 30, y + s * 4, z - 2), (x + 46, y + s * 60, z - 6), (x + 30, y + s * 168, z - 10)], 11, fillet=40))
        out.append(s3d.group(f"lever-{side}", perch, boss, blade))
    x, y, z = bar_at(-214)
    body = alloy(s3d.at(s3d.cylinder("master-body", 30, 36), x=x + 22, y=y + 24, z=z + 16, rx=90), "#c8cbcf", 0.3)
    res = s3d.extrude("reservoir", s3d.rect(46, 44, r=8), 30)
    res = black(s3d.at(res, x=x + 22, y=y, z=z + 28), 0.35)
    out.append(s3d.group("master-cylinder", body, res))
    return out


def mirrors():
    out = []
    for s, side in ((1, "left"), (-1, "right")):
        x, y, z = bar_at(s * 214)
        base = (x + 4, y, z + 16)
        head = (x - 4, s * 300, z + 206)
        stalk = chrome(s3d.wire("stalk", [base, (x - 2, s * 252, z + 118), (head[0] + 18, head[1], head[2] - 40)], 11, fillet=60))
        shell = chrome(s3d.at(s3d.revolve("shell", axial([(0, 0), (52, 0), (52, 8), (40, 20), (0, 22)], 4)),
                              x=head[0], y=head[1], z=head[2], ry=90))
        glass = s3d.material(s3d.at(s3d.cylinder("glass", 98, 1.5), x=head[0] + 0.5, y=head[1], z=head[2], ry=-90), "chrome")
        neck = chrome(rod("neck", (head[0] + 18, head[1], head[2] - 40), (head[0] + 10, head[1], head[2] - 10), 11))
        out.append(s3d.group(f"mirror-{side}", stalk, neck, shell, glass))
    return out


GAUGE_TILT = 38                            # faces lean back toward the rider
GAUGES = [(490, 64, 1066), (490, -64, 1066)]


def gauges():
    out = []
    for (x, y, z), name in zip(GAUGES, ("speedometer", "tachometer")):
        cup = black(s3d.at(s3d.cylinder("cup", 104, 66), z=-66), 0.3)
        bezel = chrome(s3d.at(s3d.tube("bezel", 110, 92, 10), z=-4))
        face = s3d.material(s3d.at(s3d.cylinder("face", 92, 2), z=-8), "plastic", color="#2a2d31", roughness=0.4)
        marks = [s3d.at(s3d.box("tick", 7, 1.8, 1), x=36 * cos(radians(a)), y=36 * sin(radians(a)), z=-6, rz=a)
                 for a in range(-135, 136, 27)]
        ticks = s3d.material(s3d.group("ticks", s3d.at(s3d.tube("ring", 86, 82, 1), z=-6), *marks), "plastic", color="#e8e9ea", roughness=0.4)
        # pivoted on the dial's centre, resting on zero (lower left as the rider sees it); the game swings it
        needle = s3d.material(s3d.at(s3d.group("needle", s3d.at(s3d.box("blade", 38, 2.4, 1.2), x=13)), z=-5.5, rz=135), "plastic",
                              color="#f1f2f3", roughness=0.3)
        hub = chrome(s3d.at(s3d.cylinder("hub", 10, 3), z=-6))
        lens = s3d.material(s3d.at(s3d.cylinder("glass", 92, 1.5), z=-2.5), "glass", color="#ffffff", opacity=0.12)
        g = s3d.group(name, cup, bezel, face, ticks, needle, hub, lens)
        out.append(s3d.at(g, x=x, y=y, z=z, ry=-GAUGE_TILT))
    ix, iz = 470, 1015
    key = s3d.group("ignition", black(s3d.at(s3d.cylinder("barrel", 40, 18), z=0), 0.35), chrome(s3d.at(s3d.tube("bezel", 44, 30, 4), z=16)),
                    black(s3d.at(s3d.box("slot", 16, 3, 3), z=19), 0.2))
    out.append(s3d.at(key, x=ix, y=0, z=iz, ry=-GAUGE_TILT + 10))
    bracket = s3d.extrude("gauge-bracket", s3d.poly([(392, 976), (412, 978), (534, 1004), (536, 1022), (516, 1026), (396, 996)], fillet=8),
                          144, both=True)
    out.append(chrome(s3d.at(bracket, rx=90)))
    return out


def build():
    return [*risers(), *bars(), *grips(), *switches(), *levers(), *mirrors(), *gauges()]
