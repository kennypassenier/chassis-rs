#!/usr/bin/env python3
"""Judge a change to the kit's public surface against the frozen contract.

Kenny, 2026-09-10, after the release chain refused 1.9.0 (CF-15): the recorded
surface saw the breaking field and let it through, because the file is
rewritten whenever the surface changes. So it only ever caught changes nobody
meant. Freezing it for the life of a major turns it into a contract:

    major (X.0.0)   the contract is re-frozen; anything may change
    otherwise       every recorded line must still be there, unchanged, and
                    a new line is allowed only when it cannot break a caller

What "cannot break a caller" means, and why the generator now records
`[sealed]`:

    new fn / struct / enum / trait / type / const     additive
    new field on a struct recorded as [sealed]        additive
    new variant on an enum recorded as [sealed]       additive
    new field or variant on an OPEN type              BREAKING
    a recorded line that is gone or changed           BREAKING

A move is a break here, on purpose (Kenny, 2026-09-10). A line is the path
that DECLARES an item, so carrying a function from `shell` to `core` reads as a
removal plus an addition even though no caller who reaches it through a
crate-root re-export can feel it. The judge is not loosened to see through
that; the surface is narrowed at the next major instead, so there is less to
move. See docs/PENDING_MINI_ROUNDS.md, "place or name".

His other question, answered here rather than in code: a hash would say the
contract moved and nothing else. Measured on this file — 829 lines — twenty
full comparisons take 13 ms and twenty hashes take 24 ms, so there is no speed
to win. The hash is in the header instead, as the contract's name.

    contract_check.py <recorded> <current> <version>
"""

import hashlib
import re
import sys

FIELD = re.compile(r"^field ([A-Za-z0-9_:]+)\.")
VARIANT = re.compile(r"^variant ([A-Za-z0-9_:]+)::")


def body(lines):
    return [l for l in lines if l.strip() and not l.startswith("#")]


def sealed_types(lines):
    """Every struct or enum the file records as sealed."""
    out = set()
    for l in lines:
        for kind in ("struct ", "enum "):
            if l.startswith(kind) and l.endswith(" [sealed]"):
                out.add(l[len(kind) : -len(" [sealed]")])
    return out


PATH = re.compile(r"^(\w+) (chassis(?:::\w+)*)(.*)$")


def leaf(line):
    """The line without its module path, so a moved item still matches itself."""
    m = PATH.match(line)
    if not m:
        return line
    kind, path, rest = m.groups()
    return f"{kind} {path.rsplit('::', 1)[-1]}{rest}"


def contract_hash(lines):
    return hashlib.sha256("\n".join(body(lines)).encode()).hexdigest()


def main(recorded_path, current_path, version):
    recorded = open(recorded_path, encoding="utf-8").read().splitlines()
    current = open(current_path, encoding="utf-8").read().splitlines()
    old, new = body(recorded), body(current)

    if version.endswith(".0.0"):
        print(f"contract: {version} is a major — the contract is re-frozen, not compared.")
        print(f"contract: new identity sha256:{contract_hash(current)[:16]}")
        return 0

    if old == new:
        print(f"contract: unchanged ({len(new)} items, sha256:{contract_hash(current)[:16]})")
        return 0

    gone = [l for l in old if l not in set(new)]
    added = [l for l in new if l not in set(old)]
    sealed_now = sealed_types(current)

    breaking = list(gone)
    for l in added:
        m = FIELD.match(l) or VARIANT.match(l)
        if m and m.group(1) not in sealed_now:
            breaking.append(l)

    if not breaking:
        print(f"contract: {len(added)} additive item(s), nothing removed or changed.")
        for l in added:
            print(f"  + {l}")
        print("contract: a minor may carry these.")
        return 0

    print(f"contract: {version} is not a major, but the surface changed in a way a caller can feel.")
    for l in breaking:
        why = "gone or changed" if l in gone else "added to a type that is not sealed"
        print(f"  ! {l}    ({why})")
    print()
    moved = [l for l in gone if leaf(l) in {leaf(a) for a in added}]
    if moved:
        print(f"Of these, {len(moved)} item(s) only moved to another module — same name,")
        print("same signature, another path. The contract records where an item is")
        print("declared, so that counts as a break; narrowing the public modules is a")
        print("candidate for the next major (docs/PENDING_MINI_ROUNDS.md, place or name).")
        print()
    print("What now: either release this as a major (X.0.0), which re-freezes the")
    print("contract and needs a ### Migration section, or seal the type with")
    print("#[non_exhaustive] and give it a constructor so the addition cannot be felt.")
    return 1


if __name__ == "__main__":
    # One place computes the identity, so the line in the header and the line
    # the judge prints can never disagree — they did on the first try, because
    # a shell `sha256sum` sees the trailing newline and a join does not.
    if len(sys.argv) == 3 and sys.argv[1] == "--hash":
        print(contract_hash(open(sys.argv[2], encoding="utf-8").read().splitlines()))
        sys.exit(0)
    if len(sys.argv) != 4:
        print(__doc__)
        sys.exit(2)
    sys.exit(main(sys.argv[1], sys.argv[2], sys.argv[3]))
