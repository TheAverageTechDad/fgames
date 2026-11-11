"""blender -b --python scripts/roadster/build.py -- [modules...] [views...] [--out DIR]
Builds the roadster (or just the named modules), runs the fit check and writes review renders."""
import sys
from pathlib import Path

import bpy

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(Path(bpy.utils.user_resource("SCRIPTS")) / "modules"))
import sand3d as s3d
import bodywork, check, cockpit, details, engine, exhaust, forks, frame, render, swingarm, wheels

MODULES = dict(frame=frame, forks=forks, wheels=wheels, swingarm=swingarm, engine=engine, exhaust=exhaust,
               bodywork=bodywork, cockpit=cockpit, details=details)


def main(argv):
    out = Path(argv[argv.index("--out") + 1]) if "--out" in argv else HERE / "out"
    out.mkdir(parents=True, exist_ok=True)
    want = [a for a in argv if a in MODULES] or list(MODULES)
    views = [a for a in argv if a in render.VIEWS] or ["side", "front34"]
    s3d.empty_scene()
    s3d.units("mm")
    parts = [p for name in want for p in MODULES[name].build()]
    root = s3d.group("roadster", *parts)
    bpy.context.view_layer.update()
    check.run(root)
    if "--no-render" not in argv:
        render.render_views(str(out / "pass"), views)
    print("built", len(parts), "parts")


if __name__ == "__main__" or "export.py" not in " ".join(sys.argv):
    main(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
