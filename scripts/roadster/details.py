"""Brakes, footpegs and their hangers, pedals, passenger pegs with the muffler mounts, engine bolt, axle nuts."""
from math import cos, radians, sin

import sand3d as s3d

import spec
from frame import PLATE_Y
from util import alloy, black, chrome, leg, paint, rod, rubber, xz_plate

AX, AZ = spec.FRONT_AXLE
RX, RZ = spec.REAR_AXLE
SIDES = ((1, "left"), (-1, "right"))
GOLD = "#b8892e"
HANGER_Y = PLATE_Y + 9                    # hanger plates bolt to the pivot plates' outer faces


def _caliper(name, r_mid, angle, z_disc, outboard):
    """A two-piece caliper straddling the disc at radius r_mid, angle deg in the wheel plane.
    Built in the wheel frame (axle along Z); outboard is +1 or -1 along Z."""
    body = s3d.at(s3d.extrude("body", s3d.rect(108, 56, r=16), 60, both=True), z=outboard * 8)
    s3d.soften(body, 5)
    s3d.cut(body, s3d.at(s3d.box("slot", 130, 46, 9), y=-6, z=-4.5))
    pins = s3d.at(s3d.cylinder("pin", 10, 66), x=0, y=22, z=-33)
    body = s3d.group(name, alloy(body, GOLD, 0.3), chrome(pins))
    s3d.at(body, z=z_disc)
    a = radians(angle)
    g = s3d.group(name + "-placed", body)
    return s3d.at(g, x=r_mid * cos(a), y=r_mid * sin(a), rz=angle - 90)


def front_calipers():
    out = []
    for s, side in SIDES:
        z_disc = 48.5 if s < 0 else -48.5
        c = _caliper(f"caliper-{side}", 141, 150, z_disc, 1 if s < 0 else -1)
        out.append(s3d.at(s3d.group(f"caliper-{side}", c), rx=90, x=AX, z=AZ))
    return out


def rear_caliper():
    c = _caliper("rear-caliper", 113, 336, 77.5, 1)
    c = s3d.at(s3d.group("c", c), rx=90, x=RX, z=RZ)
    bx = RX + 113 * cos(radians(336))
    bracket = xz_plate("caliper-bracket", [(RX - 24, RZ - 22), (RX + 20, RZ - 30), (bx + 30, RZ - 60), (bx + 34, RZ - 18), (RX + 16, RZ + 22)],
                       8, -116, fillet=12)
    return s3d.group("rear-caliper", c, alloy(bracket, "#c8cbcf", 0.3))


def brake_hoses():
    """Up the outside of each fork leg, past the clamp ends, to the master cylinder on the right bar."""
    from cockpit import bar_at
    a = radians(150)
    mx, my, mz = bar_at(-214)
    end = [(360, -195, 1005), (mx + 30, -205, mz + 8)]
    out = []
    for s in (1, -1):
        start = (AX + 160 * cos(a) + 6, s * 82, AZ + 160 * sin(a) + 10)
        up = [(p[0] - 20, s * 136, p[2]) for p in (leg(300), leg(500))] + [(leg(700)[0] - 20, s * 142, leg(700)[2])]
        top = [(330, 135, 985), (300, 60, 988), (298, -60, 988), (340, -150, 990)] if s > 0 else [(365, -150, 985)]
        path = [start] + up + top + end
        out.append(s3d.wire("hose", path, 8, fillet=[0] + [30] * (len(path) - 2) + [0]))
    return black(s3d.group("brake-hoses", *out), 0.35)


def footpegs():
    out = []
    for s, side in SIDES:
        hanger = xz_plate("hanger", [(-170, 336), (-140, 310), (-214, 238), (-262, 246), (-250, 292)], 10, s * HANGER_Y, fillet=12)
        hanger = alloy(hanger, "#c3c6ca", 0.3)
        pivot = alloy(s3d.at(s3d.cylinder("peg-pivot", 26, 20), x=-238, y=s * (HANGER_Y + 24) if s > 0 else -(HANGER_Y + 4), z=255, rx=90))
        peg = rubber(s3d.at(s3d.cylinder("peg", 30, 118), x=-238, y=s * (HANGER_Y + 140) if s > 0 else -(HANGER_Y + 22), z=255, rx=90))
        out.append(s3d.group(f"footpeg-{side}", hanger, pivot, peg))
    return out


def gear_lever():
    y0 = HANGER_Y + 5
    boss = alloy(s3d.at(s3d.cylinder("boss", 26, 22), x=-212, y=y0 + 22, z=292, rx=90))
    arm = chrome(s3d.wire("arm", [(-212, y0 + 14, 292), (-160, y0 + 18, 282), (-84, y0 + 26, 262)], 13, fillet=40))
    toe = rubber(s3d.at(s3d.cylinder("toe-peg", 22, 62), x=-84, y=y0 + 84, z=262, rx=90))
    link = chrome(rod("link", (-200, y0 + 12, 296), (-28, 166, 326), 8))
    crank = alloy(rod("shift-arm", (-28, 146, 326), (-28, 172, 326), 18))
    return s3d.group("gear-lever", boss, arm, toe, link, crank)


def brake_pedal():
    y0 = -(HANGER_Y + 5)
    boss = alloy(s3d.at(s3d.cylinder("boss", 26, 46), x=-212, y=y0, z=292, rx=90))
    arm = chrome(s3d.wire("arm", [(-212, y0 - 40, 292), (-140, y0 - 44, 276), (-72, y0 - 44, 250)], 14, fillet=40))
    pad = rubber(s3d.at(s3d.extrude("pad", s3d.rect(52, 44, r=8), 12, both=True), x=-64, y=y0 - 46, z=250, ry=-10))
    return s3d.group("brake-pedal", boss, arm, pad)


def passenger_pegs():
    """Cast hangers off the rear frame carry the passenger pegs and the mufflers."""
    out = []
    for s, side in SIDES:
        hanger = xz_plate("hanger", [(-240, 506), (-276, 520), (-470, 412), (-618, 404), (-618, 376), (-470, 374), (-262, 470)], 10,
                          s * 170, fillet=14)
        hanger = alloy(hanger, "#c3c6ca", 0.3)
        peg = rubber(s3d.at(s3d.cylinder("peg", 28, 110), x=-455, y=s * 285 if s > 0 else -175, z=394, rx=90))
        mount = alloy(rod("muffler-mount", (-600, s * 172, 392), (-600, s * 226, 362), 18), "#c3c6ca", 0.3)
        out.append(s3d.group(f"passenger-peg-{side}", hanger, peg, mount))
    return out


def side_stand():
    """Folded up along the left frame rail; pivots on a lug welded to the rail."""
    p, e = (-100, 178, 178), (-272, 178, 222)
    boss = alloy(s3d.at(s3d.cylinder("pivot-lug", 26, 64), x=p[0], y=p[1] + 12, z=p[2], rx=90), "#2a2c30", 0.4)
    leg_ = rod("leg", p, e, 22)
    foot = xz_plate("foot", [(e[0] - 26, e[2] - 14), (e[0] + 6, e[2] - 8), (e[0] + 6, e[2] + 14), (e[0] - 26, e[2] + 8)], 6, e[1] + 9, fillet=5)
    spring = s3d.material(rod("spring", (p[0] - 30, p[1] - 14, p[2] + 2), (p[0] - 120, p[1] - 14, p[2] + 22), 8), "steel", color="#9ea3a8")
    return s3d.group("side-stand", boss, paint(s3d.group("s", leg_, foot), "#141518", 0.35), spring)


def clutch_cable():
    from cockpit import bar_at
    x, y, z = bar_at(214)
    path = [(x + 22, 214, z - 2), (362, 212, 1006), (410, 186, 950), (440, 178, 820), (440, 178, 640), (410, 176, 470),
            (330, 170, 360), (262, 162, 304)]
    cable = s3d.wire("cable", path, 7, fillet=[0, 40, 60, 80, 80, 80, 60, 0])
    release = alloy(s3d.at(s3d.cylinder("release-arm", 22, 22), x=258, y=170, z=304, rx=90), "#b9bdc2", 0.3)
    return s3d.group("clutch-cable", black(cable, 0.4), release)


def throttle_cables():
    from cockpit import bar_at
    x, y, z = bar_at(-247)
    out = []
    for dx, dz in ((0, 0), (9, 9)):
        path = [(x + 4 + dx, -244, z - 20), (330, -232, 984 + dz), (362, -206, 968 + dz), (420, -186, 880 + dz), (420, -204, 762 + dz), (340, -212, 715 + dz),
                (200, -214, 702 + dz), (60, -212, 682 + dz), (-6, -176, 640 + dz), (-7, -140, 626 + dz)]
        out.append(s3d.wire("cable", path, 6.5, fillet=[0, 20, 30, 60, 60, 60, 80, 60, 30, 0]))
    return black(s3d.group("throttle-cables", *out), 0.4)


def engine_bolt():
    return chrome(s3d.at(s3d.cylinder("rear-engine-bolt", 14, 2 * (PLATE_Y - 2)), x=-150, y=PLATE_Y - 2, z=430, rx=90))


def front_axle_nuts():
    out = []
    half = spec.FORK_SPREAD / 2
    for s, side in SIDES:
        n = s3d.extrude(f"front-axle-nut-{side}", s3d.polygon(6, 30), 12)
        out.append(chrome(s3d.at(n, rx=90, x=AX, y=s * (half + 40) if s > 0 else -(half + 28), z=AZ)))
    return out


def build():
    return [*front_calipers(), rear_caliper(), brake_hoses(), *footpegs(), gear_lever(), brake_pedal(), *passenger_pegs(),
            s3d.group("rear-engine-bolt", engine_bolt()), *front_axle_nuts(), side_stand(), clutch_cable(), throttle_cables()]
