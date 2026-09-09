#!/usr/bin/env python3
"""Make the generated Obsidian vault safe to check out and unzip on Windows.

graphify names a note after the thing it describes, which produces two kinds
of filename Windows cannot live with:

* **Case collisions.** A vault can contain both `Module_5.md` and
  `module_5.md`. Git tracks two files; Windows and macOS can hold only one.
  A `git clone` aborts mid-checkout, Explorer's "Extract All" stops to ask
  about overwriting, and on a Windows working tree those files stay modified
  no matter how often they are checked out.
* **Over-long names.** A note titled after a whole sentence can run past 150
  characters. Added to the folder someone unzipped into, that crosses the
  260-character path limit and the extraction fails part-way through.

This renames both kinds apart and rewrites the `[[wikilinks]]` that pointed at
them. Run it after any regeneration of the vault; it is a no-op when there is
nothing to fix.

It reads the working tree, so on Windows or macOS it can only see what the
filesystem was able to keep -- a vault regenerated there has already collapsed
each colliding pair into one file. It is on Linux that both twins survive to be
renamed, and that is where a colliding pair would otherwise be committed.

    python scripts/dedupe-vault-names.py [vault-dir]
"""

from __future__ import annotations

import hashlib
import re
import sys
from collections import defaultdict
from pathlib import Path

DEFAULT_VAULT = Path(__file__).resolve().parent.parent / "graphify-out" / "obsidian"

# A note's own filename, at most. The repository path in front of it is about
# 40 characters, and the folder a client unzips into has to fit in what is left
# of Windows' 260-character limit.
MAX_STEM = 90


def winner(paths: list[Path]) -> Path:
    """The name that keeps its spelling: the first in sorted order.

    Sorting is what makes this deterministic -- the same vault produces the
    same renames on every machine, so the result does not churn in git.
    """
    return sorted(paths, key=lambda p: p.name)[0]


def rename_target(path: Path, taken: set[str]) -> Path:
    """A free name for the loser, marked by its own casing."""
    stem = path.stem
    suffix = "_upper" if stem[:1].isupper() else "_lower"
    candidate = path.with_name(f"{stem}{suffix}{path.suffix}")
    n = 2
    while candidate.name.lower() in taken:
        candidate = path.with_name(f"{stem}{suffix}{n}{path.suffix}")
        n += 1
    return candidate


def shorten(vault: Path, taken: set[str]) -> dict[str, str]:
    """Trim any note whose name would blow the Windows path limit.

    The trimmed name keeps the readable start of the title and ends with a
    hash of the original, so two notes that share a long prefix still land on
    different filenames -- and the same note trims to the same name on every
    machine.
    """
    renames: dict[str, str] = {}
    for note in sorted(vault.rglob("*.md")):
        if len(note.stem) <= MAX_STEM:
            continue
        digest = hashlib.sha1(note.stem.encode("utf-8")).hexdigest()[:8]
        stem = note.stem[: MAX_STEM - 9].rstrip(" -_.") + "-" + digest
        new_path = note.with_name(stem + note.suffix)
        # A file already sitting at the trimmed name is, by construction, this
        # same note trimmed on an earlier run: the name is a pure function of
        # the long one. A regeneration reinstates the long name beside it, so
        # the freshly written content replaces the older trim rather than the
        # long name being left in place.
        note.replace(new_path)
        taken.discard(note.name.lower())
        taken.add(new_path.name.lower())
        renames[note.stem] = new_path.stem
        print(f"{note.name} -> {new_path.name}")
    return renames


def relink(vault: Path, renames: dict[str, str]) -> int:
    """Repoint every [[wikilink]] that named a renamed note."""
    if not renames:
        return 0
    pattern = re.compile(r"\[\[([^\]|#]+)((?:[|#][^\]]*)?)\]\]")

    def replace(match: re.Match[str]) -> str:
        target, tail = match.group(1), match.group(2)
        new = renames.get(target.strip())
        return f"[[{new}{tail}]]" if new else match.group(0)

    touched = 0
    for note in vault.rglob("*.md"):
        text = note.read_text(encoding="utf-8")
        rewritten = pattern.sub(replace, text)
        if rewritten != text:
            note.write_text(rewritten, encoding="utf-8")
            touched += 1
    return touched


def main() -> int:
    vault = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_VAULT
    if not vault.is_dir():
        print(f"No vault at {vault} -- nothing to do.")
        return 0

    groups: dict[str, list[Path]] = defaultdict(list)
    for note in vault.rglob("*.md"):
        groups[str(note.parent).lower() + "/" + note.name.lower()].append(note)

    taken = {key.rsplit("/", 1)[1] for key in groups}
    renames: dict[str, str] = {}
    for paths in groups.values():
        if len(paths) < 2:
            continue
        keep = winner(paths)
        for loser in paths:
            if loser == keep:
                continue
            new_path = rename_target(loser, taken)
            loser.rename(new_path)
            taken.add(new_path.name.lower())
            renames[loser.stem] = new_path.stem
            print(f"{loser.name} -> {new_path.name}")

    renames.update(shorten(vault, taken))

    if not renames:
        print("Every vault filename is already Windows-safe.")
        return 0

    touched = relink(vault, renames)
    print(f"Renamed {len(renames)} notes; updated links in {touched} files.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
