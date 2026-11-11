"""Alloy box-section swingarm, gold piggyback shocks, rear axle with spacers, chain and both sprockets."""
from math import acos, atan2, cos, pi, sin

import sand3d as s3d

import spec
from frame import PLATE_Y
from util import alloy, black, chrome, paint, tilt_between, xz_plate

ARM_Y = 142                          # arm centre plane
ARM_W = 34
PX, PZ = spec.PIVOT
AX, AZ = spec.REAR_AXLE
SHOCK_TOP = (-505, 696)
SHOCK_BOT = (-668, 398)
GOLD = "#c49a35"
R1, R2 = 40.7, 106.3                 # 16 and 42 tooth sprockets, 5/8 in pitch


def _arm(s):
    """One arm, drawn from its side view: deep at the pivot, slimmer at the axle."""
    top = [(-PX, PZ + 36), (-AX, AZ + 26), (-AX + 34, AZ + 26)]
    bottom = [(-PX, PZ - 36), (-AX, AZ - 28), (-AX + 34, AZ - 28)]
    arm = s3d.body("arm", [(-PX, ARM_W), (-AX + 34, ARM_W)], top, bottom, n=5)
    return s3d.at(arm, rz=90, y=s * ARM_Y)


def arms():
    out = [_arm(1), _arm(-1)]
    for s in (1, -1):
        out.append(s3d.at(s3d.cylinder("pivot-boss", 58, PLATE_Y - 5 - (ARM_Y - ARM_W / 2) + 2), x=PX, z=PZ, rx=90,
                          y=s * (PLATE_Y - 5) if s > 0 else -(ARM_Y - ARM_W / 2 - 2)))
        # clevis for the shock's lower eye
        for dy in (13, -13):
            out.append(xz_plate("shock-lug", [(SHOCK_BOT[0] - 26, 330), (SHOCK_BOT[0] + 26, 330), (SHOCK_BOT[0] + 20, SHOCK_BOT[1] + 6),
                                              (SHOCK_BOT[0] - 20, SHOCK_BOT[1] + 6)], 6, s * (ARM_Y + dy), fillet=10))
    out.append(s3d.wire("cross-member", [(-292, -ARM_Y, 335), (-292, ARM_Y, 335)], 44))
    arm = alloy(s3d.group("swingarm", *out), "#c2c6ca", 0.32)
    # chain adjusters: end caps on the arm tails, axle through them
    caps = [alloy(xz_plate("adjuster", [(AX - 36, AZ - 26), (AX - 22, AZ - 26), (AX - 22, AZ + 24), (AX - 36, AZ + 24)], ARM_W + 2,
                           s * ARM_Y), "#d4d7da", 0.25) for s in (1, -1)]
    return [arm, s3d.group("chain-adjusters", *caps)]


def pivot_bolt():
    bolt = chrome(s3d.at(s3d.cylinder("pivot-bolt", 18, 2 * (PLATE_Y + 14)), x=PX, y=PLATE_Y + 14, z=PZ, rx=90))
    nuts = [chrome(s3d.at(s3d.extrude("pivot-nut", s3d.polygon(6, 30), 9), x=PX, z=PZ, y=s * (PLATE_Y + 14) if s > 0 else -(PLATE_Y + 5),
                          rx=90)) for s in (1, -1)]
    return s3d.group("pivot-bolt", bolt, *nuts)


def rear_axle():
    inner = ARM_Y - ARM_W / 2
    shaft = chrome(s3d.at(s3d.cylinder("rear-axle", 20, 2 * (ARM_Y + 34)), x=AX, y=ARM_Y + 34, z=AZ, rx=90))
    left = alloy(s3d.at(s3d.tube("spacer", 36, 20, inner - spec.CHAIN_Y - 3), x=AX, y=inner, z=AZ, rx=90))
    right = alloy(s3d.at(s3d.tube("spacer", 36, 20, inner - 80), x=AX, y=-80, z=AZ, rx=90))
    nuts = [chrome(s3d.at(s3d.extrude("axle-nut", s3d.polygon(6, 32), 14), x=AX, z=AZ, y=s * (ARM_Y + 32) if s > 0 else -(ARM_Y + 18),
                          rx=90)) for s in (1, -1)]
    return s3d.group("rear-axle", shaft, left, right, *nuts)


def shock(s):
    side = "left" if s > 0 else "right"
    bot = (SHOCK_BOT[0], s * ARM_Y, SHOCK_BOT[1])
    top = (SHOCK_TOP[0], s * ARM_Y, SHOCK_TOP[1])
    L = sum((top[i] - bot[i]) ** 2 for i in range(3)) ** 0.5
    eye = lambda name, z: s3d.at(s3d.tube(name, 32, 12, 20), z=z, y=10, rx=90)
    parts = [
        alloy(eye("lower-eye", 0), "#c8cbcf", 0.3),
        alloy(s3d.at(s3d.cylinder("lower-seat", 60, 12), z=26), GOLD, 0.3),
        chrome(s3d.at(s3d.cylinder("shaft", 16, L * 0.5), z=14)),
        alloy(s3d.at(s3d.cylinder("body", 46, L * 0.55 - 14), z=L * 0.45), GOLD, 0.28),
        alloy(s3d.at(s3d.cylinder("upper-seat", 66, 12), z=L - 78), GOLD, 0.3),
        s3d.material(s3d.at(s3d.wire("spring", s3d.helix(58, 21, L - 78 - 38), 8), z=38), "steel", color="#d6a53a", roughness=0.3),
        alloy(s3d.at(s3d.cylinder("reservoir", 40, 96), x=40, z=L - 150), GOLD, 0.28),
        alloy(s3d.at(s3d.cylinder("reservoir-neck", 22, 24), x=22, z=L - 70, ry=90), "#c8cbcf", 0.3),
        alloy(s3d.at(s3d.cylinder("top-cap", 40, 16), z=L - 30), "#c8cbcf", 0.3),
        alloy(eye("upper-eye", L), "#c8cbcf", 0.3),
    ]
    g = s3d.group(f"shock-{side}", *parts)
    return tilt_between(g, bot, top)


def shock_mounts():
    out = []
    for s, side in ((1, "left"), (-1, "right")):
        x, z = SHOCK_TOP
        boss = s3d.at(s3d.cylinder("top-boss", 24, ARM_Y - 108 + 26), x=x, y=s * (ARM_Y + 26) if s > 0 else -108, z=z, rx=90)
        web = xz_plate("top-web", [(x - 22, z - 4), (x + 22, z - 4), (x + 16, z + 26), (x - 16, z + 26)], 8, s * 116)
        bolt = chrome(s3d.at(s3d.cylinder("bolt", 12, 46), x=x, y=s * (ARM_Y + 23) if s > 0 else -(ARM_Y - 23), z=z, rx=90))
        out.append(s3d.group(f"shock-mount-{side}", paint(s3d.group("m", boss, web), "#141518", 0.4), bolt))
    return out


def _loop(c1, r1, c2, r2, y, n=16):
    """Closed path round two sprockets: tangent runs plus the wrapped arcs."""
    dx, dz = c2[0] - c1[0], c2[1] - c1[1]
    L = (dx * dx + dz * dz) ** 0.5
    phi = atan2(dz, dx)
    k = acos((r1 - r2) / L)
    up, lo = phi + k, phi - k
    pts = []
    for i in range(n + 1):
        a = up + (lo - up) * i / n
        pts.append((c2[0] + r2 * cos(a), y, c2[1] + r2 * sin(a)))
    span = 2 * pi - 2 * k
    for i in range(n + 1):
        a = lo - span * i / n
        pts.append((c1[0] + r1 * cos(a), y, c1[1] + r1 * sin(a)))
    return pts


def chain():
    path = s3d.spline(_loop(spec.COUNTERSHAFT, R1, spec.REAR_AXLE, R2, spec.CHAIN_Y), loop=True)
    plates = s3d.wire("chain", path, 9)
    rollers = s3d.at(s3d.cylinder("roller", 10, 18), on=s3d.along(path, pitch=15.875))
    return s3d.material(s3d.group("chain", plates, rollers), "steel", color="#3a3d42", roughness=0.45)


def front_sprocket():
    g = s3d.gear("front-sprocket", 16, 5.05, 7, bore=24)
    shaft = s3d.cylinder("countershaft", 24, 40)
    g = s3d.group("front-sprocket", s3d.at(g, z=-spec.CHAIN_Y - 3.5), s3d.at(shaft, z=-spec.CHAIN_Y - 8))
    return s3d.material(s3d.at(g, x=spec.COUNTERSHAFT[0], z=spec.COUNTERSHAFT[1], rx=90), "steel", color="#8a8f95")


def chain_guard():
    zu = lambda x: spec.COUNTERSHAFT[1] + R1 + (spec.REAR_AXLE[1] + R2 - spec.COUNTERSHAFT[1] - R1) * (spec.COUNTERSHAFT[0] - x) / (spec.COUNTERSHAFT[0] - AX)
    x0, x1 = -340, -640
    strip = s3d.body("guard", [(-x0, 36), (-x1, 36)], [(-x0, zu(x0) + 21), (-x1, zu(x1) + 21)], [(-x0, zu(x0) + 17), (-x1, zu(x1) + 17)], n=6)
    strip = s3d.at(strip, rz=90, y=spec.CHAIN_Y + 6)
    tab = xz_plate("guard-tab", [(-470, zu(-470) + 20), (-520, zu(-520) + 20), (-520, 340), (-470, 340)], 4, ARM_Y - ARM_W / 2 - 1.5, fillet=6)
    return paint(s3d.group("chain-guard", strip, tab), "#141518", 0.35)


def build():
    return [*arms(), pivot_bolt(), rear_axle(), shock(1), shock(-1), *shock_mounts(), chain(), front_sprocket(), chain_guard()]
