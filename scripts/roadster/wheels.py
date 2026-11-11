"""Cast-alloy 10-spoke wheels, floating front discs, one-piece rear disc, rear sprocket.
Built with the axle along Z, then turned to lie along Y: local +Z ends up on the bike's right (-Y)."""
import sand3d as s3d

import spec
from util import alloy, paint

WHEEL = "#1b1c1f"
AXLE_D = 20


def tyre(d, w, h, rim_w):
    """Sport tyre: crowned tread with two shallow circumferential grooves; beads seated on the rim lips."""
    R, Ro = d / 2, d / 2 + h
    toe, half = rim_w / 2 - 5, w / 2
    left = [(R + 19, -toe), (R + h * 0.22, -half * 0.97), (R + h * 0.55, -half), (Ro - h * 0.16, -half * 0.9), (Ro - h * 0.08, -half * 0.74)]
    crown = []
    for f in (-0.30, -0.2, -0.1, 0.0, 0.1, 0.2, 0.30):
        groove = 3.2 if abs(f) == 0.2 else 0
        crown.append((Ro - 2.5 - abs(f * w) * 0.09 - groove, f * w))
    right = [(r, -z) for r, z in reversed(left)]
    pts = left + crown + right + [(R + 19, 0)]
    return s3d.material(s3d.revolve("tyre", s3d.spline(pts, closed=True)), "rubber", color="#17181a")


def rim(d, w):
    R, t = d / 2, 5.0
    outer = [(R + 17, -w / 2), (R + 17, -w / 2 + 4), (R + 2, -w / 2 + 12), (R - 7, -w / 2 + 24),
             (R - 7, w / 2 - 24), (R + 2, w / 2 - 12), (R + 17, w / 2 - 4), (R + 17, w / 2)]
    pts = outer + [(r - t, z) for r, z in outer[::-1]]
    return paint(s3d.revolve("rim", s3d.poly(pts, fillet=2.0)), WHEEL, 0.32)


def spokes(d, count=10):
    """Slim tapering spokes from the hub barrel out to the rim's well."""
    r0, r1 = 30, d / 2 - 4
    shape = s3d.poly([(r0, -13), (r1, -8), (r1, 8), (r0, 13)], fillet=4)
    spoke = s3d.extrude("spoke", shape, 16, both=True)
    s3d.soften(spoke, 3)
    return paint(s3d.group("spokes", *s3d.at(spoke, on=s3d.ring(count, 0, start=90 / count))), WHEEL, 0.32)


def hub(length, d=74):
    barrel = s3d.at(s3d.tube("barrel", d, AXLE_D, length), z=-length / 2)
    caps = [s3d.at(s3d.tube("bearing-boss", d + 14, AXLE_D, 12), z=sz * (length / 2 - 6) - 6) for sz in (-1, 1)]
    return paint(s3d.group("hub", barrel, *caps), WHEEL, 0.32)


def _wheel(name, f, hub_len, extra=()):
    pieces = [tyre(f["rim_d"], f["tyre_w"], f["tyre_h"], f["rim_w"]), rim(f["rim_d"], f["rim_w"]), spokes(f["rim_d"]),
              hub(hub_len), *extra]
    return s3d.at(s3d.group(name, *pieces), rx=90)


def front_wheel():
    w = _wheel("front-wheel", spec.FRONT, 92)
    return s3d.at(w, x=spec.FRONT_AXLE[0], z=spec.FRONT_AXLE[1])


def rear_wheel():
    carrier = alloy(s3d.at(s3d.tube("sprocket-carrier", 128, AXLE_D, 30), z=-105), "#b4b8bd", 0.3)
    w = _wheel("rear-wheel", spec.REAR, 150, (carrier,))
    return s3d.at(w, x=spec.REAR_AXLE[0], z=spec.REAR_AXLE[1])


def _ring(r_in, r_out, z, t, holes):
    ring = s3d.revolve("rotor", s3d.poly([(r_in, 0), (r_out, 0), (r_out, t), (r_in, t)]))
    for n, r, start in holes:
        s3d.hole(ring, 7, on=s3d.ring(n, r, start=start))
    return s3d.material(s3d.at(ring, z=z), "steel", color="#a7abb0", roughness=0.26)


def _place(ob, axle):
    return s3d.at(ob, rx=90, x=axle[0], z=axle[1])


def front_discs():
    """310 mm floating discs: a steel ring on six buttons round a gold alloy carrier bolted to the hub."""
    out = []
    for s, side in ((1, "left"), (-1, "right")):
        z0 = 46 if s < 0 else -51                      # carrier face against the hub end, outboard
        ring = _ring(116, 155, z0, 5, [(24, 126, 0), (24, 144, 7.5)])
        spider = s3d.extrude("carrier", s3d.poly([(-14, 34), (14, 34), (9, 122), (-9, 122)], fillet=3), 5)
        arms = s3d.at(spider, on=s3d.ring(6, 0, start=0))
        boss = s3d.tube("carrier-boss", 82, AXLE_D, 5)
        carrier = alloy(s3d.at(s3d.group("carrier", boss, *arms), z=z0), "#b8892e", 0.3)
        buttons = alloy(s3d.at(s3d.group("buttons", *s3d.at(s3d.cylinder("button", 13, 9), on=s3d.ring(6, 118))), z=z0 - 2), "#d0d3d6", 0.25)
        out.append(_place(s3d.group(f"front-disc-{side}", ring, carrier, buttons), spec.FRONT_AXLE))
    return out


def rear_disc():
    z0 = 75                                            # right side, against the hub end
    ring = _ring(66, 128, z0, 5, [(10, 92, 0), (10, 106, 18)])
    centre = s3d.material(s3d.at(s3d.tube("disc-centre", 140, AXLE_D, 5), z=z0), "steel", color="#a7abb0", roughness=0.3)
    return _place(s3d.group("rear-disc", ring, centre), spec.REAR_AXLE)


def sprocket(teeth=42):
    g = s3d.gear("sprocket", teeth, 5.05, 6, bore=AXLE_D)
    return _place(s3d.material(s3d.at(g, z=-spec.CHAIN_Y - 3), "steel", color="#8a8f95"), spec.REAR_AXLE)


def build():
    return [front_wheel(), rear_wheel(), *front_discs(), rear_disc(), sprocket()]
