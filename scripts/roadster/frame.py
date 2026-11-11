"""Steel double-cradle frame: head tube, backbone, two cradle loops, rear frame, seat rails, pivot plates,
engine hangers. Every tube ends inside the tube or plate it is welded to."""
import sand3d as s3d

import spec
from util import on_axis, paint, xz_plate

BLACK = "#141518"
PLATE_Y = 160                 # pivot plates, centre plane
RAIL_Y = 118                  # cradle rails under the engine
SEAT_RAIL_Y = 120


def head_tube():
    h = s3d.tube("head-tube", 60, 44, spec.HEAD_HIGH - spec.HEAD_LOW)
    return paint(on_axis(h, spec.HEAD_LOW), BLACK, 0.3)


def _back(s, y=0.0, d=10):
    """A point on the head tube's back wall, s up the axis: where a tube welds on."""
    x, _, z = spec.axis(s)
    return (x - spec.FWD[0] * d, y, z - spec.FWD[1] * d)


def frame_tubes():
    out = [s3d.wire("backbone", [_back(625, 0, 40), (340, 0, 790), (120, 0, 764), (-140, 0, 752), (-214, 0, 732)], 45, fillet=140)]
    for s, side in ((1, "left"), (-1, "right")):
        cradle = [_back(600, s * 14, 34), (418, s * 70, 680), (410, s * RAIL_Y, 560), (398, s * RAIL_Y, 300),
                  (330, s * RAIL_Y, 168), (-80, s * RAIL_Y, 168), (-160, s * 140, 200), (-205, s * 146, 262)]
        out.append(s3d.wire(f"cradle-{side}", cradle, 34, fillet=[0, 90, 120, 0, 70, 0, 60, 0]))
        # rear frame: a V either side of the side cover, from the pivot plate up to the seat rail
        out.append(s3d.wire(f"rear-down-{side}", [(-205, s * SEAT_RAIL_Y, 735), (-258, s * PLATE_Y, 500)], 30))
        out.append(s3d.wire(f"rear-stay-{side}", [(-258, s * PLATE_Y, 500), (-470, s * SEAT_RAIL_Y, 716)], 26))
    out.append(s3d.wire("rear-cross", [(-214, -SEAT_RAIL_Y - 8, 732), (-214, SEAT_RAIL_Y + 8, 732)], 32))
    rail = [(-205, SEAT_RAIL_Y, 732), (-420, SEAT_RAIL_Y, 714), (-640, 114, 718), (-815, 94, 742), (-878, 45, 752),
            (-878, -45, 752), (-815, -94, 742), (-640, -114, 718), (-420, -SEAT_RAIL_Y, 714), (-205, -SEAT_RAIL_Y, 732)]
    out.append(s3d.wire("seat-rails", rail, 26, fillet=[0, 150, 150, 80, 40, 40, 80, 150, 150, 0]))
    out.append(s3d.wire("seat-cross", [(-640, -114, 718), (-640, 114, 718)], 20))
    return paint(s3d.group("frame-tubes", *out), BLACK, 0.3)


def pivot_plates():
    prof = [(-272, 300), (-266, 512), (-222, 532), (-150, 476), (-138, 330), (-176, 236), (-240, 236)]
    plates = [paint(xz_plate(f"pivot-plate-{side}", prof, 10, s * PLATE_Y, fillet=22), BLACK, 0.45)
              for s, side in ((1, "left"), (-1, "right"))]
    return s3d.group("pivot-plates", *plates)


def engine_hangers():
    """Plates that carry the engine: two at the front of the cases, two at the back, one from the backbone to the head."""
    out = []
    for s, side in ((1, "left"), (-1, "right")):
        out.append(xz_plate(f"front-hanger-{side}", [(236, 232), (410, 250), (408, 312), (240, 300)], 8, s * (RAIL_Y + 18), fillet=10))
        out.append(xz_plate(f"rear-hanger-{side}", [(-150, 400), (-120, 452), (-226, 512), (-250, 470)], 8, s * (PLATE_Y - 9), fillet=10))
    out.append(xz_plate("head-hanger", [(70, 650), (160, 650), (176, 772), (52, 772)], 8, 0, fillet=12))
    return paint(s3d.group("engine-hangers", *out), BLACK, 0.45)


def build():
    return [head_tube(), frame_tubes(), pivot_plates(), engine_hangers()]
