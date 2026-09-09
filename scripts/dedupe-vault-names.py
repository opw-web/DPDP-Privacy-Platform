#!/usr/bin/env python3
"""Rename case-colliding notes in the generated Obsidian vault.

graphify names a note after the symbol it describes, so a vault can contain
both `Module_5.md` and `module_5.md`. Git tracks those as two files; Windows
and macOS cannot hold both. The symptoms are a `git clone` that aborts
mid-checkout, an Explorer "Extract All" that stops to ask about overwriting,
and -- on a Windows working tree -- files that stay modified no matter how
often they are checked out.

This renames the loser of each collision to a distinct name and rewrites the
`[[wikilinks]]` that pointed at it. Run it after every `graphify update .`;
it is a no-op when there is nothing to fix.

It reads the working tree, so on Windows or macOS it can only report what the
filesystem was able to keep -- a vault regenerated there has already collapsed
each pair into one file. It is on Linux that both twins survive to be renamed,
and that is where a colliding pair would otherwise be committed.

    python scripts/dedupe-vault-names.py [vault-dir]
"""

from __future__ import annotations

import re
import sys
from collections import defaultdict
from pathlib import Path

DEFAULT_VAULT = Path(__file__).resolve().parent.parent / "graphify-out" / "obsidian"


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

    if not renames:
        print("No case-colliding vault filenames.")
        return 0

    touched = relink(vault, renames)
    print(f"Renamed {len(renames)} notes; updated links in {touched} files.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
