"""Small helpers shared by the part modules."""
from math import atan2, degrees, hypot

import sand3d as s3d

import spec


def paint(ob, color, rough=0.35):
    return s3d.material(ob, "painted_metal", color=color, roughness=rough)


def chrome(ob):
    return s3d.material(ob, "chrome")


def alloy(ob, color="#b9bdc2", rough=0.36):
    return s3d.material(ob, "aluminium", color=color, roughness=rough)


def black(ob, rough=0.5):
    return s3d.material(ob, "plastic", color="#111214", roughness=rough)


def rubber(ob):
    return s3d.material(ob, "rubber", color="#151618")


def on_axis(ob, s, y=0.0):
    """Place something built along +Z so that it runs up the steering axis, origin s mm up it."""
    x, y, z = spec.axis(s, y)
    return s3d.at(ob, x=x, y=y, z=z, ry=-spec.RAKE)


def on_leg(ob, s, y=0.0):
    """Like on_axis, but on a fork leg's own axis: parallel to the steering axis, FORK_OFFSET ahead of it,
    so s = 0 is the front axle."""
    x, y, z = spec.axis(s, y)
    return s3d.at(ob, x=x + spec.FORK_OFFSET * spec.FWD[0], y=y, z=z + spec.FORK_OFFSET * spec.FWD[1], ry=-spec.RAKE)


def leg(s, y=0.0):
    x, y, z = spec.axis(s, y)
    return (x + spec.FORK_OFFSET * spec.FWD[0], y, z + spec.FORK_OFFSET * spec.FWD[1])


def xz_plate(name, pts, t, y, fillet=0):
    """A flat plate drawn in the side view, (x, z) points, t thick, centred on y."""
    return s3d.at(s3d.extrude(name, s3d.poly(pts, fillet=fillet), t, both=True), rx=90, y=y)


def axial(pts, r):
    """A profile to revolve: corners rounded by r, except those on the axis (x = 0)."""
    return s3d.poly(pts, fillet=[0 if p[0] == 0 else r for p in pts])


def ycyl(name, d, length, x, y, z):
    """Cylinder lying along Y, centred on (x, y, z)."""
    return s3d.at(s3d.cylinder(name, d, length), x=x, y=y + length / 2, z=z, rx=90)


def xcyl(name, d, length, x, y, z):
    """Cylinder lying along X, centred on (x, y, z)."""
    return s3d.at(s3d.cylinder(name, d, length), x=x - length / 2, y=y, z=z, ry=90)


def rod(name, a, b, d):
    """Straight round bar between two (x, y, z) points."""
    return s3d.wire(name, [a, b], d)


def tilt_between(ob, a, b):
    """Place an object built along +Z (origin at its base) so it runs from point a toward b."""
    dx, dy, dz = (b[i] - a[i] for i in range(3))
    ry = degrees(atan2(hypot(dx, dy), dz))      # lean from vertical
    rz = degrees(atan2(dy, dx)) if hypot(dx, dy) > 1e-6 else 0
    return s3d.at(ob, x=a[0], y=a[1], z=a[2], rz=rz, ry=ry)
