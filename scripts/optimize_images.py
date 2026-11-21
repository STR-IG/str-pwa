#!/usr/bin/env python3
"""Audit image references and optionally convert referenced PNG/JPEG to WebP.
Usage: python3 -m pip install Pillow
       python3 scripts/optimize_images.py
       python3 scripts/optimize_images.py --apply
Dry run by default. Review git diff and test before merging.
"""
from __future__ import annotations
import argparse
from collections import Counter
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
TEXT_EXT = {".html", ".css", ".js", ".mjs", ".json"}
IMAGE_EXT = {".png", ".jpg", ".jpeg"}
SKIP_DIRS = {".git", "node_modules", "vendor", "dist", "build"}
# Installed-app icons and manifest assets must remain PNG for compatibility.
SKIP_NAMES = {"icono-str-ig.png", "icono-str-ig-192.png", "icono-str-ig-512.png",
              "favicon.png", "apple-touch-icon.png"}
PATTERN = re.compile(r"(?<![\w./-])([^\s\"'<>\x60()]+?\.(?:png|jpg|jpeg))(?=\?|#|[\"'\x60)\s<>]|$)", re.I)

def eligible(path: Path) -> bool:
    return not any(part in SKIP_DIRS for part in path.relative_to(ROOT).parts)

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="Write WebP images and update references")
    parser.add_argument("--quality", type=int, default=88)
    args = parser.parse_args()
    if not 1 <= args.quality <= 100:
        parser.error("--quality must be 1..100")
    texts = [p for p in ROOT.rglob("*") if p.is_file() and eligible(p) and p.suffix.lower() in TEXT_EXT]
    images = [p for p in ROOT.rglob("*") if p.is_file() and eligible(p) and p.suffix.lower() in IMAGE_EXT | {".webp"}]
    references: dict[Path, set[Path]] = {}
    for textfile in texts:
        try:
            body = textfile.read_text(encoding="utf-8")
        except UnicodeError:
            continue
        for match in PATTERN.finditer(body):
            raw = match.group(1)
            candidate = (textfile.parent / raw).resolve()
            if candidate.is_file() and candidate.is_relative_to(ROOT) and candidate.suffix.lower() in IMAGE_EXT:
                references.setdefault(candidate, set()).add(textfile)
    planned = []
    for src, owners in sorted(references.items()):
        if src.name.lower() in SKIP_NAMES or src.name.lower().startswith(("icon-", "icono-")):
            continue
        target = src.with_suffix(".webp")
        if target.exists():
            # Existing WebP might not be visually equivalent; don't redirect automatically.
            print(f"REVIEW existing WebP: {src.relative_to(ROOT)}")
            continue
        planned.append((src, target, owners))
    print("Repository image counts:", dict(Counter(p.suffix.lower() for p in images)))
    print(f"Referenced non-WebP candidates: {len(planned)}")
    if not args.apply:
        for src, _, owners in planned:
            print(f"WOULD CONVERT {src.relative_to(ROOT)} ({src.stat().st_size // 1024} KiB; {len(owners)} referencing files)")
        print("Dry run only. Run --apply to convert and rewrite references.")
        return
    from PIL import Image, ImageOps
    replacements: dict[Path, dict[str, str]] = {}
    for src, target, owners in planned:
        try:
            with Image.open(src) as original:
                img = ImageOps.exif_transpose(original)
                if img.mode not in ("RGB", "RGBA"):
                    img = img.convert("RGBA" if "A" in img.getbands() else "RGB")
                img.save(target, "WEBP", quality=args.quality, method=6)
            if target.stat().st_size >= src.stat().st_size:
                target.unlink()
                print(f"SKIP no savings: {src.relative_to(ROOT)}")
                continue
            for owner in owners:
                rel = src.relative_to(owner.parent).as_posix()
                replacements.setdefault(owner, {})[rel] = target.relative_to(owner.parent).as_posix()
            print(f"CONVERTED {src.relative_to(ROOT)}: {src.stat().st_size} -> {target.stat().st_size} bytes")
        except Exception as exc:
            print(f"ERROR {src.relative_to(ROOT)}: {exc}")
    for owner, mapping in replacements.items():
        body = owner.read_text(encoding="utf-8")
        for old, new in mapping.items():
            body = body.replace(old, new)
        owner.write_text(body, encoding="utf-8")
        print(f"UPDATED {owner.relative_to(ROOT)}")
    print("Review changes, check rendering, then remove unused originals only after validation.")

if __name__ == "__main__":
    main()
