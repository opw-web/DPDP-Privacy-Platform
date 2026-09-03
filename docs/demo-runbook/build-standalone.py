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


def embed_image(match: re.Match[str], source: Path) -> str:
    prefix, relative_name, suffix = match.groups()
    if relative_name.startswith(("data:", "http://", "https://")):
        return match.group(0)

    image_path = (source.parent / relative_name).resolve()
    if not image_path.is_file():
        raise FileNotFoundError(
            f"{source.name} references a missing image: {relative_name}"
        )

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


if __name__ == "__main__":
    main()
