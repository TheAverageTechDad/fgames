"""Four headers down the front of the engine into a collector box under it, then one link pipe and one
long tapered muffler each side."""
import sand3d as s3d

import spec
from util import axial, alloy, black, chrome, tilt_between

DROP_X = 355                                  # the headers' vertical run, behind the downtubes
MUFFLER_Y = 226
M_FRONT = (-470, 282)                         # muffler inlet (x, z)
M_DIR = (-0.9516, 0.3075)                     # rising toward the tail, ~18 deg
M_LEN = 432


def headers():
    out = []
    for y in spec.CYL_Y:
        port = spec.across(spec.bore(282), 100)
        yb = 72 if abs(y) > 60 else 24
        yb = yb if y > 0 else -yb
        path = [(port[0] - 6, y, port[2]), (port[0] + 44, y, port[2] - 14), (DROP_X, y * 0.78, 470), (DROP_X, yb, 262),
                (DROP_X - 34, yb, 176), (172, yb, 158)]
        pipe = chrome(s3d.wire("pipe", path, 38, fillet=[0, 40, 90, 0, 60, 0]))
        flange = alloy(s3d.at(s3d.extrude("flange", s3d.rect(14, 64, r=6), 66, both=True), x=port[0] + 9, y=y, z=port[2] - 3,
                              ry=90 - spec.CYL_TILT), "#c8cbcf", 0.3)
        out.append(s3d.group(f"header-{len(out) + 1}", pipe, flange))
    return out


def collector():
    box = s3d.body("box", [(-180, 150), (-120, 190), (60, 190), (64, 150)], [(-180, 180), (64, 180)], [(-180, 126), (64, 126)], n=4)
    return s3d.material(s3d.at(s3d.group("collector", box), rz=-90), "steel", color="#3e4247", roughness=0.4)


def _muffler_axis(s, t):
    return (M_FRONT[0] + M_DIR[0] * t, s * MUFFLER_Y, M_FRONT[1] + M_DIR[1] * t)


def link_pipes():
    out = []
    for s, side in ((1, "left"), (-1, "right")):
        path = [(30, s * 60, 156), (-60, s * 62, 156), (-232, s * 80, 160), (-330, s * 168, 202), _muffler_axis(s, 0),
                _muffler_axis(s, 40)]
        out.append(chrome(s3d.wire(f"link-pipe-{side}", path, 54, fillet=[0, 0, 120, 120, 80, 0])))
    return out


def mufflers():
    out = []
    prof = axial([(0, 0), (29, 0), (29, 26), (44, 90), (52, 170), (54, M_LEN - 30), (50, M_LEN - 12), (44, M_LEN), (0, M_LEN)], 5)
    for s, side in ((1, "left"), (-1, "right")):
        body = chrome(s3d.revolve("can", prof))
        tip = black(s3d.at(s3d.tube("tip", 88, 40, 6), z=M_LEN - 1), 0.35)
        outlet = chrome(s3d.at(s3d.tube("outlet", 42, 34, 16), z=M_LEN - 4))
        m = s3d.group(f"muffler-{side}", body, tip, outlet)
        out.append(tilt_between(m, _muffler_axis(s, 0), _muffler_axis(s, 100)))
    return out


def build():
    return [*headers(), collector(), *link_pipes(), *mufflers()]
