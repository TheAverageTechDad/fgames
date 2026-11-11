"""blender -b --python overlay.py -- <my-side-render.png> <reference-side.png> <out.png>
Rescales the render so the two wheelbases and ground lines match, then writes
[reference | overlay | model] so proportions can be judged by eye."""
import sys

import bpy
import numpy as np

mine, ref, out = sys.argv[sys.argv.index("--") + 1:][:3]
REF_REAR, REF_FRONT, REF_GROUND = (258.5, 484), (807, 490), 595      # px, read off the CB1100RS side photo
MODEL_WB, MODEL_PPM, MODEL_CENTRE = 1485, 1400 / 2300, (700, 450)     # render: 1400 px = 2300 mm, centred on x=0, z=560


def load(path):
    img = bpy.data.images.load(path)
    w, h = img.size
    a = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1]   # to top-down rows
    return a


R, M = load(ref), load(mine)
h, w = R.shape[:2]
s = (REF_FRONT[0] - REF_REAR[0]) / MODEL_WB                           # canvas px per model mm
vv, uu = np.mgrid[0:h, 0:w]
X = (uu - REF_REAR[0]) / s - MODEL_WB / 2
Z = (REF_GROUND - vv) / s
su = np.clip((MODEL_CENTRE[0] + X * MODEL_PPM).astype(int), 0, M.shape[1] - 1)
sv = np.clip((MODEL_CENTRE[1] - (Z - 560) * MODEL_PPM).astype(int), 0, M.shape[0] - 1)
model = M[sv, su]
bg = M[5, 5]                                                         # backdrop colour: anything unlike it is the bike
mask = (np.abs(model[..., :3] - bg[:3]).sum(-1) > 0.08)[..., None]
grey = R[..., :3].mean(-1, keepdims=True).repeat(3, -1)
tint = np.array([1.0, 0.15, 0.1], dtype=np.float32)
over = np.where(mask, 0.35 * grey + 0.65 * (model[..., :3] * 0.5 + tint * 0.5), grey)
panel = lambda rgb: np.concatenate([rgb, np.ones((h, w, 1), np.float32)], -1)
sheet = np.concatenate([panel(R[..., :3]), panel(over), panel(np.where(mask, model[..., :3], 0.5))], axis=1)
img = bpy.data.images.new("sheet", sheet.shape[1], sheet.shape[0])
img.pixels = sheet[::-1].ravel().tolist()
img.filepath_raw, img.file_format = out, "PNG"
img.save()
print("wrote", out)
