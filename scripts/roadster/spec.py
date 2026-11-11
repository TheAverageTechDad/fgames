"""One source of truth for the roadster's geometry. Millimetres, X forward, Y left, Z up,
origin on the ground midway between the axles. Proportions read off a CB1100RS side photo
(wheelbase 1485, rake 26, trail ~99, 17 in cast wheels, seat ~800) with a mm grid over it."""
from math import cos, radians, sin

WHEELBASE = 1485
FRONT = dict(rim_d=431.8, tyre_w=120, tyre_h=84, rim_w=89)   # 120/70-17
REAR = dict(rim_d=431.8, tyre_w=180, tyre_h=99, rim_w=140)   # 180/55-17
for w in (FRONT, REAR):
    w["r"] = w["rim_d"] / 2 + w["tyre_h"]        # tyre outer radius
FRONT_AXLE = (WHEELBASE / 2, FRONT["r"])         # (x, z)
REAR_AXLE = (-WHEELBASE / 2, REAR["r"])

RAKE = 26
FORK_OFFSET = 43                                   # axle forward of the steering axis
TH = radians(RAKE)
UP = (-sin(TH), cos(TH))                           # up the steering axis (x, z)
FWD = (cos(TH), sin(TH))                           # perpendicular, forward
_A = (FRONT_AXLE[0] - FORK_OFFSET * FWD[0], FRONT_AXLE[1] - FORK_OFFSET * FWD[1])


def axis(s, y=0.0):
    """Point s mm up the steering axis from the axle's foot, as (x, y, z)."""
    return (_A[0] + s * UP[0], y, _A[1] + s * UP[1])


def axis_x(z):
    """Where the steering axis is at height z."""
    return _A[0] + (z - _A[1]) / UP[1] * UP[0]


_t = -_A[1] / UP[1]
TRAIL = (_A[0] + _t * UP[0]) - FRONT_AXLE[0]
assert 95 < TRAIL < 103, TRAIL

# steering head and fork (photo: lower clamp ~z 750, top clamp ~z 975)
CLAMP_LOW = 512                          # lower clamp, 26 thick, just under the head tube
HEAD_LOW, HEAD_HIGH = 540, 744           # head tube ends, mm up the axis
CLAMP_HIGH = 746                         # top clamp underside
STANCHION_TOP = 776
FORK_SPREAD = 190                        # leg centre to centre

# engine: transverse inline four, bores tilted forward from the crank axis
CRANK = (128, 338)                       # crankshaft centre (x, z)
CYL_TILT = 12
CYL_PITCH = 80
CYL_Y = [3 * CYL_PITCH / 2 - i * CYL_PITCH for i in range(4)]   # +120, +40, -40, -120 (left to right)
COUNTERSHAFT = (-118, 318)               # drive sprocket centre
CHAIN_Y = 108                            # chain line, left of centre
PIVOT = (-196, 352)                      # swingarm pivot (x, z)


def bore(s, y=0.0):
    """Point s mm along the cylinder axis from the crank centre, as (x, y, z)."""
    a = radians(CYL_TILT)
    return (CRANK[0] + s * sin(a), y, CRANK[1] + s * cos(a))


def across(p, d):
    """Move point p d mm square to the bores, forward (+) or back (-), in the side plane."""
    a = radians(CYL_TILT)
    return (p[0] + d * cos(a), p[1], p[2] - d * sin(a))


YOKE = axis(STANCHION_TOP)               # top of the top clamp: bars, gauges, mirrors hang off it


def lamp_centre():
    x, _, z = axis(612)
    return x + 182 * FWD[0], z + 182 * FWD[1]
