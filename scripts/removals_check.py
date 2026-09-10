#!/usr/bin/env python3
"""feat-api-2: hold the transition window to what docs/REMOVALS.md promises.

A deprecation is a promise with two halves — the item still works, and it
goes at a named version — and neither half is checked by the compiler. This
compares the `#[deprecated]` attributes the generator finds with the table in
docs/REMOVALS.md and refuses:

    a deprecated item with no row        a window nobody wrote down
    a row with no deprecated item        the list promises what is already gone
    a row whose `Since` disagrees        two answers to when it started
    `Goes at` that is not a later major  rule 46: the contract is frozen for
                                         the life of a major, so a removal in
                                         a minor breaks it

    removals_check.py <REMOVALS.md> <generated deprecated list> <version>
"""

import re
import sys

ROW = re.compile(r"^\|\s*`([^`]+)`\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|")
GENERATED = re.compile(r"^deprecated (\S+) since (\S+)$")


def rows(path):
    out = {}
    for line in open(path, encoding="utf-8"):
        m = ROW.match(line)
        if m:
            out[m.group(1)] = (m.group(2), m.group(3))
    return out


def generated(path):
    out = {}
    for line in open(path, encoding="utf-8"):
        m = GENERATED.match(line.strip())
        if m:
            out[m.group(1)] = m.group(2)
    return out


def main(list_path, generated_path, version):
    listed = rows(list_path)
    found = generated(generated_path)
    major = version.split(".")[0]
    problems = []

    for item, since in sorted(found.items()):
        if item not in listed:
            problems.append(
                f"{item} is #[deprecated] and has no row in {list_path}; "
                f"add one saying when it goes"
            )
        elif listed[item][0] != since:
            problems.append(
                f"{item}: the attribute says since {since}, the table says "
                f"since {listed[item][0]}"
            )

    for item, (_, goes_at) in sorted(listed.items()):
        if item not in found:
            problems.append(
                f"{item} has a row but carries no #[deprecated] attribute; "
                f"it is already gone or was never marked — remove the row"
            )
            continue
        if not goes_at.endswith(".0.0"):
            problems.append(
                f"{item}: 'Goes at' is {goes_at}, which is not a major. The "
                f"contract is frozen for the life of a major, so a removal "
                f"only fits an X.0.0"
            )
        elif goes_at.split(".")[0] <= major:
            problems.append(
                f"{item}: 'Goes at' is {goes_at}, which is not after {version}"
            )

    if problems:
        print(f"removals: {len(problems)} problem(s) with the transition window.")
        for p in problems:
            print(f"  ! {p}")
        return 1

    print(f"removals: {len(listed)} item(s) in the window, all with a major to go at.")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 4:
        print(__doc__.strip().splitlines()[-1].strip(), file=sys.stderr)
        raise SystemExit(2)
    raise SystemExit(main(*sys.argv[1:]))
