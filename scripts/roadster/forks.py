"""Telescopic fork: gold sliders with cast axle feet, chrome stanchions, two triple clamps with a stem
through the head tube, axle, front mudguard on its own bracket."""
import sand3d as s3d

import spec
from util import alloy, black, chrome, leg, on_axis, on_leg, paint, xz_plate

LEG_BASE = -38          # slider bottom, mm up the leg from the axle
SLIDER_TOP = 330
GOLD = "#b8892e"
HALF = spec.FORK_SPREAD / 2


def legs():
    out = []
    for s, side in ((1, "left"), (-1, "right")):
        y = s * HALF
        slider = alloy(on_leg(s3d.cylinder("slider", 54, SLIDER_TOP - LEG_BASE), LEG_BASE, y), GOLD, 0.28)
        # cast foot: the axle boss and the caliper lugs behind it
        ax, az = spec.FRONT_AXLE
        foot = alloy(s3d.at(s3d.cylinder("axle-foot", 52, 56), x=ax, y=y + 28, z=az, rx=90), "#c8cbcf", 0.3)
        lugs = alloy(xz_plate("caliper-lugs", [(ax - 10, az + 26), (ax - 86, az + 114), (ax - 116, az + 98), (ax - 140, az + 32),
                                               (ax - 122, az + 8), (ax - 30, az - 22)], 18, s * (HALF - 14), fillet=12), "#c8cbcf", 0.3)
        seal = black(on_leg(s3d.tube("dust-seal", 50, 41, 16), SLIDER_TOP - 4, y), 0.4)
        stanchion = chrome(on_leg(s3d.cylinder("stanchion", 41, spec.STANCHION_TOP - SLIDER_TOP - 6), SLIDER_TOP + 2, y))
        cap = alloy(on_leg(s3d.extrude("fork-cap", s3d.polygon(6, 34), 10), spec.STANCHION_TOP - 4, y), "#d2d5d8", 0.25)
        preload = alloy(on_leg(s3d.cylinder("preload-adjuster", 20, 9), spec.STANCHION_TOP + 5, y), GOLD, 0.26)
        out.append(s3d.group(f"fork-leg-{side}", slider, foot, lugs, seal, stanchion, cap, preload))
    return out


def _clamp(name, s, t):
    """A triple clamp: one plate holding the stem and both legs, its bosses round the leg tubes."""
    plate = s3d.extrude(name, s3d.rect(86, 2 * HALF + 66, r=30), t)
    plate = s3d.at(plate, x=26)
    stem_boss = s3d.at(s3d.cylinder("stem-boss", 62, t), x=0)
    return alloy(on_axis(s3d.group(name, plate, stem_boss), s), "#c3c6ca", 0.3)


def clamps():
    low = _clamp("lower-clamp", spec.CLAMP_LOW, 26)
    up = _clamp("upper-clamp", spec.CLAMP_HIGH, 22)
    stem = alloy(on_axis(s3d.cylinder("steering-stem", 30, spec.CLAMP_HIGH - spec.CLAMP_LOW + 30), spec.CLAMP_LOW - 4))
    nut = chrome(on_axis(s3d.extrude("stem-nut", s3d.polygon(6, 40), 12), spec.CLAMP_HIGH + 22))
    # bearing races close the gaps between the clamps and the head tube ends
    races = [black(on_axis(s3d.tube("bearing-race", 56, 30, 8), s)) for s in (spec.CLAMP_LOW + 25, spec.HEAD_HIGH - 1)]
    return [low, up, s3d.group("steering-stem", stem, nut, *races)]


def axle():
    ax, az = spec.FRONT_AXLE
    shaft = chrome(s3d.at(s3d.cylinder("front-axle", 20, 2 * HALF + 66), x=ax, y=HALF + 33, z=az, rx=90))
    inner = HALF - 28                              # slider foot's inside face
    collars = [alloy(s3d.at(s3d.tube("axle-collar", 34, 20, inner - 51), x=ax, y=inner if s > 0 else -51, z=az, rx=90))
               for s in (1, -1)]
    return s3d.group("front-axle", shaft, *collars)


def mudguard():
    """A short sport mudguard: a shell over the tyre with a stiffening ridge, on a bracket that bolts to both sliders."""
    ax, az = spec.FRONT_AXLE
    r_in = spec.FRONT["r"] + 16
    w = 2 * HALF - 54 - 4                         # fits between the sliders
    # crowned top with a centre ridge, side skirts that drop toward the tyre
    sk = r_in - 26
    prof = s3d.poly([(sk, -w / 2), (r_in + 6, -w / 2), (r_in + 12, -w / 2 + 14), (r_in + 15, 0), (r_in + 12, w / 2 - 14),
                     (r_in + 6, w / 2), (sk, w / 2), (sk, w / 2 - 3), (r_in + 3, w / 2 - 4), (r_in + 11, 0), (r_in + 3, -w / 2 + 4),
                     (sk, -w / 2 + 3)], fillet=1.2)
    shell = s3d.at(s3d.revolve("mudguard-shell", prof, angle=100), rz=56)
    guard = paint(s3d.at(s3d.group("front-mudguard", shell), x=ax, z=az, rx=90), "#121316", 0.25)
    # brackets: a plate each side, bolted to the inside of the slider, the mudguard's edge screwed to it
    from math import cos, radians, sin
    pt = lambda a, r: (ax + r * cos(radians(a)), az + r * sin(radians(a)))
    plate = [pt(106, r_in - 22), pt(106, r_in + 12), pt(128, r_in + 12), pt(128, r_in - 22)]
    bracket = black(s3d.group("mudguard-bracket", *[xz_plate("bracket", plate, 4, s * (HALF - 29), fillet=6) for s in (1, -1)]), 0.4)
    return [guard, bracket]


def build():
    return [*legs(), *clamps(), axle(), *mudguard()]
