#!/usr/bin/env python3
"""Build shareable, single-file copies of both HTML runbooks."""

from __future__ import annotations

import base64
import mimetypes
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parent
BUILDS = {
    "RUNBOOK.html": "RUNBOOK-standalone.html",
    "CLIENT-GUIDE.html": "CLIENT-GUIDE-standalone.html",
}
IMAGE_SRC = re.compile(r'(<img\b[^>]*?\bsrc=")([^"#]+)(")', re.IGNORECASE)


PLACEHOLDER_SVG = (
    '<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="320">'
    '<rect width="1440" height="320" fill="#fff5df" stroke="#8a5900" stroke-width="4"/>'
    '<text x="720" y="150" text-anchor="middle" font-family="sans-serif" font-size="34"'
    ' fill="#8a5900">Figure not captured yet: {name}</text>'
    '<text x="720" y="205" text-anchor="middle" font-family="sans-serif" font-size="24"'
    ' fill="#8a5900">Start the demo, then run '
    'node scripts/capture-guide-screenshots.mjs</text></svg>'
)

missing_images: list[str] = []


def embed_image(match: re.Match[str], source: Path) -> str:
    prefix, relative_name, suffix = match.groups()
    if relative_name.startswith(("data:", "http://", "https://")):
        return match.group(0)

    image_path = (source.parent / relative_name).resolve()
    if not image_path.is_file():
        # A figure whose screenshot has not been captured yet must not block the
        # build; it is replaced by a placeholder that says so on the page, so an
        # uncaptured figure is obvious rather than silently missing.
        missing_images.append(f"{source.name}: {relative_name}")
        svg = PLACEHOLDER_SVG.format(name=Path(relative_name).name)
        encoded = base64.b64encode(svg.encode("utf-8")).decode("ascii")
        return f'{prefix}data:image/svg+xml;base64,{encoded}{suffix}'

    mime_type = mimetypes.guess_type(image_path.name)[0] or "application/octet-stream"
    encoded = base64.b64encode(image_path.read_bytes()).decode("ascii")
    return f'{prefix}data:{mime_type};base64,{encoded}{suffix}'


def build(source_name: str, output_name: str) -> None:
    source = ROOT / source_name
    output = ROOT / output_name
    html = source.read_text(encoding="utf-8")
    embedded, count = IMAGE_SRC.subn(lambda match: embed_image(match, source), html)
    if count == 0:
        raise RuntimeError(f"No images found in {source.name}")

    banner = (
        "<!-- Standalone generated file: all images are embedded. "
        f"Edit {source.name}, then run build-standalone.py again. -->\n"
    )
    output.write_text(banner + embedded, encoding="utf-8")
    size_mib = output.stat().st_size / (1024 * 1024)
    print(f"Built {output.name}: {count} embedded images, {size_mib:.1f} MiB")


def main() -> None:
    for source_name, output_name in BUILDS.items():
        build(source_name, output_name)
    if missing_images:
        print(f"\n{len(missing_images)} figure(s) are placeholders until captured:")
        for entry in missing_images:
            print(f"  - {entry}")


if __name__ == "__main__":
    main()
