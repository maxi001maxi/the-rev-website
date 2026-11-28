#!/usr/bin/env python3
"""R5 article scene: reversible, no-model, subject-safe background depth trial.

Produces an isolated private R6 scene; it never writes public blog/GBP assets.
Input must match the R5 rejection archive's SHA manifest; no image is invented.
"""
import argparse
import hashlib
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

SLUG = "personal-gym-first-session-pain-health-history"
R5 = "reference-v26-grounded-lobbysp-20261015-pain-r5"
EXPECTED_SCENE_SHA = "6ce3d1df4c1111ce63856bbdc83e2f1521ddd67cbff7c96ee47f0d2704635303"
REL = f"assets/images/editorial-generated/{SLUG}-{R5}-scene.png"

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--archive-dir", required=True)
    p.add_argument("--output", required=True)
    p.add_argument("--report", required=True)
    a = p.parse_args()
    prefix = Path(a.archive_dir) / ".operator-rejected-evidence" / SLUG / R5
    original = prefix / REL
    manifest_path = prefix / "evidence-manifest.json"
    if not original.is_file() or not manifest_path.is_file():
        raise SystemExit("R5_QUARANTINE_MISSING: cannot substitute unapproved assets")
    manifest = json.loads(manifest_path.read_text())
    listed = next((x for x in manifest.get("files", []) if x.get("path") == REL), None)
    if (manifest.get("slug") != SLUG or manifest.get("asset_version") != R5 or
            manifest.get("approved_for_publishing") is not False or
            not listed or listed["sha256"] != EXPECTED_SCENE_SHA or sha(original) != EXPECTED_SCENE_SHA):
        raise SystemExit("R5_SOURCE_SHA_OR_PROVENANCE_MISMATCH")
    im = Image.open(original).convert("RGB")
    if im.size != (1536, 1024):
        raise SystemExit("R5_UNEXPECTED_IMAGE_DIMENSIONS")

    # Reproducible local v2: shallow optical softness on existing back wall,
    # plant and gym equipment, with a softly feathered human-protection area.
    w, h = im.size
    soft = im.filter(ImageFilter.GaussianBlur(radius=5.8))
    right = im.filter(ImageFilter.GaussianBlur(radius=10.5))
    side = Image.new("L", (w, h))
    px = side.load()
    for y in range(h):
        for x in range(w):
            ax = max(0, min(1, (x-1140)/350))
            ay = max(0, min(1, (820-y)/290))
            px[x, y] = round(200*ax*ay)
    base = Image.composite(right, soft, side)
    protect = Image.new("L", (w,h), 0)
    draw = ImageDraw.Draw(protect)
    draw.polygon([(1050,176),(1205,183),(1284,264),(1291,434),
                  (1274,616),(1337,697),(1370,816),(1338,1023),
                  (830,1023),(845,846),(829,759),(855,654),
                  (945,598),(987,450),(996,328)], fill=255)
    protect = protect.filter(ImageFilter.GaussianBlur(radius=55))
    logo = Image.new("L", (w,h), 0)
    ImageDraw.Draw(logo).ellipse((120,-90,625,210), fill=130)
    logo = logo.filter(ImageFilter.GaussianBlur(radius=70))
    protect = Image.composite(Image.new("L", (w,h),255),protect,logo)
    result = Image.composite(im,base,protect)
    # Identity validation in central facial region before saving.
    for xy in [(1140,375),(1150,350),(1100,480)]:
        if result.getpixel(xy) != im.getpixel(xy):
            raise SystemExit(f"SUBJECT_FACE_PIXELS_CHANGED_AT_{xy}")
    output = Path(a.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    result.save(output, "PNG", optimize=True)
    report = {
        "slug":SLUG,
        "original_asset_version":R5,
        "status":"OFFLINE_DEPTH_CANDIDATE_NOT_QC_APPROVED",
        "original_scene_sha256":EXPECTED_SCENE_SHA,
        "depth_scene_sha256":sha(output),
        "dimensions":[w,h],
        "source_geometry_repainted":False,
        "person_region_check_pass":True,
        "image_generation_api_calls":0,
        "publication_allowed":False
    }
    target = Path(a.report)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(report, indent=2)+"\n")
    print(json.dumps(report))
if __name__ == "__main__":
    main()
