"""Air-cooled transverse inline four: crankcase with a narrower gearbox section, deep-finned block and head,
cam cover with polished cam end caps, polished side covers, carbs into an air box, starter, oil cooler."""
from math import pi, sin, sqrt

import sand3d as s3d

import spec
from util import axial, alloy, black, chrome, paint, rod, rubber, xz_plate

CASE_Y = 150                         # crank section half width
GEAR_LEFT = 92                       # gearbox section's left face: the drive sprocket sits just outside it
S_DECK, S_HEAD, S_COVER, S_TOP = 118, 245, 318, 346
FIN = "#9ea4aa"
CORE = "#1c1d20"
CASE = "#2a2c30"
POLISH = "#d9dce0"


def on_bore(ob, s, y=0.0):
    x, y, z = spec.bore(s, y)
    return s3d.at(ob, x=x, y=y, z=z, ry=spec.CYL_TILT)


def crankcase():
    deck_r, deck_f = spec.across(spec.bore(S_DECK), -106), spec.across(spec.bore(S_DECK), 106)
    crank = [(-40, 200), (-40, 470), (deck_r[0], deck_r[2]), (deck_f[0], deck_f[2]), (266, 330), (246, 226), (196, 196)]
    gear = [(-162, 268), (-162, 400), (-130, 452), (-30, 474), (-30, 202), (-100, 214)]
    a = s3d.at(s3d.extrude("crank-section", s3d.poly(crank, fillet=24), 2 * CASE_Y, both=True), rx=90)
    b = s3d.extrude("gearbox-section", s3d.poly(gear, fillet=24), CASE_Y + GEAR_LEFT, both=True)
    b = s3d.at(b, rx=90, y=(GEAR_LEFT - CASE_Y) / 2)
    for part in (a, b):
        s3d.soften(part, 7)                  # cast edges catch the light
    return alloy(s3d.group("crankcase", a, b), CASE, 0.42)


def sump():
    pan = s3d.body("pan", [(0, 220), (214, 220)], [(0, 206), (214, 206)], [(0, 184), (214, 184)], n=4)
    return alloy(s3d.at(s3d.group("oil-pan", pan), rz=-90, x=0), CASE, 0.5)


def fin_outline(depth, width, dip, rc=30, n=64):
    """A fin seen down the bore: front and back edges bulge round each cylinder and dip between them."""
    p = spec.CYL_PITCH

    def edge(y):
        lobe = depth / 2 - dip * sin(pi * (y - p / 2) / p) ** 2
        e = abs(y) - (width / 2 - rc)
        corner = depth / 2 if e <= 0 else depth / 2 - rc + sqrt(max(rc * rc - e * e, 0))
        return min(lobe, corner)
    ys = [-width / 2 + width * i / n for i in range(n + 1)]
    return s3d.poly([(edge(y), y) for y in ys] + [(-edge(y), y) for y in reversed(ys)])


def fin_stack(name, core_d, core_w, fin_d, fin_w, s0, s1, n, dip, thick=2.6, barrels=0):
    """A dark core (and, on the block, the four barrels) with thin bright fins stacked along the bore."""
    h = s1 - s0
    core = [s3d.extrude("core", s3d.rect(core_d, core_w, r=20), h)]
    core += [s3d.at(s3d.cylinder("barrel", barrels, h), y=y) for y in spec.CYL_Y] if barrels else []
    fins = [s3d.at(s3d.extrude("fin", fin_outline(fin_d, fin_w, dip), thick), z=(h - thick) * i / (n - 1)) for i in range(n)]
    return on_bore(s3d.group(name, paint(s3d.group("core", *core), CORE, 0.45), alloy(s3d.group("fins", *fins), FIN, 0.34)), s0)


def cylinders():
    return fin_stack("cylinder-block", 150, 330, 272, 384, S_DECK, S_HEAD, 16, dip=16, barrels=98)


def head():
    return fin_stack("cylinder-head", 212, 352, 284, 392, S_HEAD, S_COVER, 9, dip=9, thick=3.0)


def cam_cover():
    c = s3d.extrude("cam-cover", s3d.rect(236, 362, r=44), S_TOP - S_COVER)
    s3d.soften(c, 9)
    ribs = [s3d.at(s3d.extrude("rib", s3d.rect(6, 300, r=3), 4), x=-60 + 30 * i, z=S_TOP - S_COVER - 1) for i in range(5)]
    return on_bore(s3d.group("cam-cover", paint(c, "#24262a", 0.35), alloy(s3d.group("ribs", *ribs), POLISH, 0.2)), S_COVER)


def cam_caps():
    """Polished end caps over both camshafts, each side of the head."""
    out = []
    for s in (1, -1):
        for d in (-62, 62):
            x, _, z = spec.across(spec.bore(296), d)
            cap = s3d.revolve("cap", axial([(0, 0), (27, 0), (27, 22), (20, 32), (0, 34)], 4))
            out.append(s3d.at(cap, x=x, y=s * 166, z=z, rx=-90 * s))
    return alloy(s3d.group("cam-caps", *out), POLISH, 0.14)


def _cover(name, d, depth, bolts):
    """A domed, polished side cover with a ring of bolts and a centre boss."""
    r = d / 2
    body = s3d.revolve("body", axial([(0, 0), (r, 0), (r, depth * 0.45), (r - 10, depth * 0.85), (r * 0.55, depth), (0, depth)], 6))
    boss = s3d.at(s3d.cylinder("boss", d * 0.3, 6), z=depth - 2)
    heads = s3d.at(s3d.extrude("bolt", s3d.polygon(6, 10), 5), on=s3d.ring(bolts, r - 9))
    heads = chrome(s3d.at(s3d.group("bolts", *heads), z=depth * 0.45 - 1))
    return s3d.group(name, alloy(body, POLISH, 0.16), alloy(boss, "#b9bdc2", 0.3), heads)


def covers():
    cx, cz = spec.CRANK
    acg = s3d.at(_cover("acg-cover", 210, 52, 10), x=cx, y=CASE_Y - 1, z=cz, rx=-90)
    clutch = s3d.at(_cover("clutch-cover", 190, 50, 11), x=-36, y=-CASE_Y + 1, z=cz, rx=90)
    pulse = s3d.at(_cover("pulse-cover", 124, 36, 6), x=cx, y=-CASE_Y + 1, z=cz, rx=90)
    sx, sz = spec.COUNTERSHAFT
    sc = s3d.extrude("sprocket-cover", s3d.rect(124, 112, r=36), 46)
    s3d.soften(sc, 8)
    sc = alloy(s3d.at(sc, x=sx + 16, y=GEAR_LEFT - 1, z=sz, rx=-90), "#6f747a", 0.4)
    return [acg, clutch, pulse, s3d.group("sprocket-cover", sc)]


def carburettors():
    """Four carbs off the head's back face, runners down into the air box."""
    out = []
    for y in spec.CYL_Y:
        port = spec.across(spec.bore(282), -106)
        x0, z0 = port[0] + 6, port[2]
        runner = rubber(rod("runner", (x0, y, z0), (x0 - 42, y, z0 - 6), 46))
        bx, bz = x0 - 96, z0 - 14
        body = s3d.extrude("body", s3d.rect(84, 58, r=14), 62, both=True)
        s3d.soften(body, 6)
        body = alloy(s3d.at(body, x=bx, y=y, z=bz, rx=90), "#9a9fa5", 0.38)
        throat = alloy(rod("throat", (x0 - 36, y, z0 - 6), (x0 - 128, y, z0 - 18), 38), "#9a9fa5", 0.38)
        bowl = s3d.extrude("float-bowl", s3d.rect(50, 50, r=14), 34)
        s3d.soften(bowl, 6)
        bowl = alloy(s3d.at(bowl, x=bx, y=y, z=bz - 62), "#b4b8bd", 0.3)
        top = alloy(s3d.at(s3d.revolve("diaphragm", axial([(0, 0), (31, 0), (31, 12), (24, 22), (0, 24)], 4)), x=bx, y=y, z=bz + 22),
                    POLISH, 0.18)
        out.append(s3d.group("carb", runner, body, throat, bowl, top))
    return s3d.group("carburettors", *out)


AIRBOX = [(-392, 688), (-184, 688), (-192, 640), (-234, 572), (-282, 532), (-372, 540)]   # inside the side covers' outline


def air_box():
    box = s3d.extrude("air-box", s3d.poly(AIRBOX, fillet=24), 200, both=True)
    s3d.soften(box, 12)
    box = paint(s3d.at(box, rx=90), "#1b1c1f", 0.6)
    boots = []
    for y in spec.CYL_Y:
        port = spec.across(spec.bore(282), -106)
        a = (port[0] + 6 - 124, y, port[2] - 18)
        boots.append(s3d.wire("boot", [a, (-120, y * 0.82, a[2] + 22), (-200, y * 0.8, 662)], 42, fillet=40))
    return [s3d.group("air-box", box), black(s3d.group("intake-boots", *boots), 0.6)]


def starter():
    body = black(s3d.at(s3d.cylinder("can", 62, 150), x=-18, y=75, z=500, rx=90), 0.35)
    caps = [alloy(s3d.at(s3d.cylinder("end-cap", 66, 10), x=-18, y=y, z=500, rx=90), "#b9bdc2", 0.3) for y in (85, -75)]
    return s3d.group("starter-motor", body, *caps)


def oil_cooler():
    """Finned cooler on the front downtubes, two hoses down to the crankcase."""
    x0, z0, w, h = 452, 570, 196, 112
    core = paint(s3d.at(s3d.box("core", 26, w, h), x=x0, z=z0), "#1b1c1f", 0.5)
    fins = [s3d.at(s3d.box("fin", 30, w - 8, 1.6), x=x0, z=z0 + 6 + i * 6.5) for i in range(16)]
    tanks = [s3d.at(s3d.box("end-tank", 34, 16, h + 10), x=x0, y=s * (w / 2 + 6), z=z0 - 5) for s in (1, -1)]
    tabs = [s3d.at(s3d.box("tab", 44, 6, 30), x=x0 - 26, y=s * 101, z=z0 + 40) for s in (1, -1)]
    cooler = s3d.group("oil-cooler", core, alloy(s3d.group("fins", *fins), "#5d6268", 0.4), paint(s3d.group("t", *tanks, *tabs), "#141518", 0.4))
    hoses = [s3d.wire("hose", [(x0, s * (w / 2 + 8), z0 + 4), (x0 - 20, s * 146, z0 - 20), (390, s * 146, 420), (290, s * 146, 330),
                               (250, s * 140, 320)], 15, fillet=40) for s in (1, -1)]
    return [cooler, rubber(s3d.group("oil-hoses", *hoses))]


def build():
    return [crankcase(), sump(), cylinders(), head(), cam_cover(), cam_caps(), *covers(), carburettors(), *air_box(), starter(),
            *oil_cooler()]
