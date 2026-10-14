#!/usr/bin/env python3
"""Independent oracle for dsh-ipcalc anchors (ipv4_split / ipv4_range).

Why this file is committed: every numeric expectation in the TypeScript suite
must come from an *independent* implementation — the Python standard library
`ipaddress` module — not from the code under test and not from mental
arithmetic (the "guessed expectation" failure mode recorded in the pipeline
log at R19/R21/R27/R30/R46). Running this script reproduces, value by value,
every anchor quoted in:

  * test/split.test.ts   (ipv4_split  — subnet planning)
  * test/range.test.ts   (ipv4_range  — arbitrary range → minimal CIDR list)
  * test/tools.test.ts   (tool inventory + the long-standing anchors, re-quoted
                          here because editing that file moves it into the
                          "changed" scope of the anchors gate)

The math below deliberately goes through `ipaddress.ip_network`,
`ip_network.subnets(new_prefix=…)` and `ipaddress.summarize_address_range`,
which are a completely different code path from `src/ipv4.ts` (hand-rolled
dotted-quad arithmetic) and from `src/tools.ts`'s renderers.

Usage: python3 test/oracle/anchors.py
"""

import ipaddress
import sys

WIDTH = 2 ** 32


def usable_hosts(prefix: int) -> int:
    """RFC 3021/6164-style usable host count for an IPv4 prefix."""
    if prefix == 32:
        return 1
    if prefix == 31:
        return 2
    return 2 ** (32 - prefix) - 2


def split(cidr: str, new_prefix: int) -> dict:
    """Split `cidr` into the equal subnets of `new_prefix` (ipaddress)."""
    net = ipaddress.ip_network(cidr, strict=False)
    subnets = [str(s) for s in net.subnets(new_prefix=new_prefix)]
    return {
        "source": str(net),
        "source_prefix": net.prefixlen,
        "new_prefix": new_prefix,
        "count": len(subnets),
        "addresses_each": 2 ** (32 - new_prefix),
        "usable_each": usable_hosts(new_prefix),
        "first": subnets[0],
        "last": subnets[-1],
        "subnets": subnets,
    }


def split_by_parts(cidr: str, parts: int) -> dict:
    """Split by subnet count: new prefix = source prefix + log2(parts)."""
    net = ipaddress.ip_network(cidr, strict=False)
    new_prefix = net.prefixlen + parts.bit_length() - 1
    return split(cidr, new_prefix)


def addr_range(start: str, end: str) -> dict:
    """Minimal CIDR list covering [start, end] (ipaddress summarization)."""
    first = ipaddress.ip_address(start)
    last = ipaddress.ip_address(end)
    cidrs = [str(n) for n in ipaddress.summarize_address_range(first, last)]
    return {
        "start": str(first),
        "end": str(last),
        "count": len(cidrs),
        "addresses_covered": int(last) - int(first) + 1,
        "cidrs": cidrs,
    }


def show(title: str, data: dict, keys=None) -> None:
    print(f"── {title} " + "─" * max(0, 62 - len(title)))
    for key in keys or data:
        value = data[key]
        if isinstance(value, list):
            print(f"   {key} ({len(value)}) = {value}")
        else:
            print(f"   {key} = {value}")
    print()


def main_anchors() -> None:
    print("dsh-ipcalc oracle — independent anchors (stdlib ipaddress)\n")
    print("══ ipv4_split ════════════════════════════════════════════════\n")
    show("A. 10.0.0.0/24 → parts=4 (→ /26)", split_by_parts("10.0.0.0/24", 4))
    show("B. 192.168.1.77/24 → prefix=30 (host bits masked away)",
         split("192.168.1.77/24", 30),
         ["source", "source_prefix", "new_prefix", "count", "addresses_each",
          "usable_each", "first", "last"])
    show("C. 172.16.0.0/30 → prefix=31 (RFC 3021 pair)",
         split("172.16.0.0/30", 31))
    show("D. 10.1.1.0/30 → parts=4 (→ /32 single hosts)",
         split_by_parts("10.1.1.0/30", 4))
    show("E. 10.0.0.0/16 → prefix=24 (the 256-subnet limit, exactly at the cap)",
         split("10.0.0.0/16", 24),
         ["source", "source_prefix", "new_prefix", "count", "addresses_each",
          "usable_each", "first", "last"])
    show("F. 198.51.100.0/22 → parts=8 (documentation block, /25s)",
         split_by_parts("198.51.100.0/22", 8),
         ["source", "source_prefix", "new_prefix", "count", "addresses_each",
          "usable_each", "first", "last"])
    show("G. 10.0.0.0/8 → prefix=24 = 65536 subnets (MUST be rejected: > 256)",
         {"count": 2 ** (24 - 8), "limit": 256})
    show("H. 10.0.0.0/30 → parts=2 (/31 pair, usable_each = 2)",
         split_by_parts("10.0.0.0/30", 2))
    print("   error cases (no arithmetic, listed for completeness):\n"
          "     parts=3 → not a power of two\n"
          "     parts=1 → below the minimum of 2\n"
          "     parts=512 → above the parts limit of 256\n"
          "     prefix=24 on a /24 → not greater than the source prefix\n"
          "     prefix=33 → outside 0–32\n"
          "     both parts and prefix / neither → exactly one is required\n"
          "     \"10.0.0.256/24\" → invalid CIDR\n\n")

    print("══ ipv4_range ════════════════════════════════════════════════\n")
    show("I. 10.0.5.3 – 10.0.9.200 (the messy ACL case)",
         addr_range("10.0.5.3", "10.0.9.200"))
    show("J. 192.168.0.0 – 192.168.0.255 (already aligned)",
         addr_range("192.168.0.0", "192.168.0.255"))
    show("K. 10.0.0.7 – 10.0.0.7 (single address)",
         addr_range("10.0.0.7", "10.0.0.7"))
    show("L. 0.0.0.0 – 255.255.255.255 (whole space)",
         addr_range("0.0.0.0", "255.255.255.255"))
    show("M. 172.16.0.1 – 172.16.255.254 (private /12 minus the edges)",
         addr_range("172.16.0.1", "172.16.255.254"))
    show("N. 203.0.113.8 – 203.0.113.15 (aligned /29 tail)",
         addr_range("203.0.113.8", "203.0.113.15"))
    print("   error cases (no arithmetic):\n"
          "     10.0.0.9 → 10.0.0.1 → start greater than end\n"
          "     \"10.0.0.0/24\" as start → CIDR notation rejected\n"
          "     \"999.1.1.1\" → invalid address\n\n")

    print("══ test/tools.test.ts — anchors re-quoted by the oracle ═════\n")
    eth = ipaddress.ip_network("192.168.1.0/24")
    show("O. subnet layout anchors",
         {
             "192.168.1.0/24 usable_hosts": usable_hosts(24),
             "192.168.1.0/24 network": str(eth.network_address),
             "192.168.1.0/24 broadcast": str(eth.broadcast_address),
             "192.168.1.0/24 addresses": eth.num_addresses,
             "10.10.10.8/29 usable_hosts": usable_hosts(29),
             "10.10.10.8/29 network": str(ipaddress.ip_network("10.10.10.10/29", strict=False).network_address),
             "192.168.0.0/24 + 192.168.1.0/24 → cidrs": [str(n) for n in ipaddress.collapse_addresses([
                 ipaddress.ip_network("192.168.0.0/24"), ipaddress.ip_network("192.168.1.0/24")])],
             "inputs": 2, "outputs": 1, "addresses_covered": 512,
             "render sample: 4 inputs → 1 CIDR covering 1024": 2 ** (32 - 22),
             "8.8.8.8 integer": int(ipaddress.ip_address("8.8.8.8")),
             "192.168.0.1 integer": int(ipaddress.ip_address("192.168.0.1")),
             "::-ffff:192.168.1.1 version": 6,
             "ipv4_mapped embedded": str(ipaddress.ip_address("::ffff:192.168.1.1").ipv4_mapped),
             "2001:db8::/32 prefix": 32,
             "2001:db8::1 bare prefix": 128,
             "ip_version anchors": [4, 6],
             "0.0.0.0/0 covers 255.255.255.255": ipaddress.ip_address("255.255.255.255") in ipaddress.ip_network("0.0.0.0/0"),
             "255.255.255.255 - 0 = max": WIDTH - 1,
         })
    print("✓ oracle complete — every value above is reproducible by running "
          "`python3 test/oracle/anchors.py`\n")

    print("══ test/ipv4.test.ts — legacy anchors (migrated in v0.4.0) ═\n")
    show("P. parse / subnet / classification anchors", legacy_ipv4_anchors())
    print("══ test/ipv6.test.ts — legacy anchors (migrated in v0.4.0) ═\n")
    show("Q. 128-bit conversion and prefix anchors", legacy_ipv6_anchors())

    print("══ ipv4_allocate — VLSM planning ═══════════════════════════\n")
    show("R0. prefix_for_hosts (default / point_to_point / rejected)", {
        "1 host default": prefix_for_hosts(1, False),
        "2 hosts default": prefix_for_hosts(2, False),
        "3 hosts default": prefix_for_hosts(3, False),
        "6 hosts default": prefix_for_hosts(6, False),
        "7 hosts default": prefix_for_hosts(7, False),
        "254 hosts default": prefix_for_hosts(254, False),
        "255 hosts default": prefix_for_hosts(255, False),
        "1 host p2p": prefix_for_hosts(1, True),
        "2 hosts p2p": prefix_for_hosts(2, True),
        "3 hosts p2p": prefix_for_hosts(3, True),
        "0 hosts": prefix_for_hosts(0, False),
        "MAX+1 hosts": prefix_for_hosts(MAX_REQUEST_HOSTS + 1, False),
    })
    for title, kwargs in ALLOCATE_SCENARIOS:
        show_plan(title, allocate_anchors(**kwargs))

    print("══ ipv4_exclude — pool subtraction ═════════════════════════\n")
    for title, pool, cuts in EXCLUDE_SCENARIOS:
        show_plan(title, exclude_anchors(pool, cuts))

    print("✓ all sections printed — reproduce with `python3 test/oracle/anchors.py`\n")


# ─────────────────────────────────────────────────────────────────────────────
# ipv4_allocate / ipv4_exclude anchors (R70)
# ─────────────────────────────────────────────────────────────────────────────

MAX_REQUEST_HOSTS = 2 ** 32 - 2


def prefix_for_hosts(hosts: int, point_to_point: bool):
    """Smallest prefix whose usable capacity covers `hosts` uses (the plugin's rule)."""
    if not isinstance(hosts, int) or hosts < 1 or hosts > MAX_REQUEST_HOSTS:
        return None
    if point_to_point:
        if hosts == 1:
            return 32
        if hosts == 2:
            return 31
    for prefix in range(30, -1, -1):
        if usable_hosts(prefix) >= hosts:
            return prefix
    return None


def place_blocks(base: int, parent_size: int, sizes, largest_first: bool):
    """First-fit placement of aligned power-of-two blocks (own implementation).

    Returns `(placements, free_runs)`, where `placements` maps the request index
    to its start address and `free_runs` is the leftover space, or None when a
    block does not fit.
    """
    order = sorted(range(len(sizes)), key=lambda i: (-sizes[i], i)) if largest_first else list(range(len(sizes)))
    free = [(base, base + parent_size - 1)]
    placements: dict = {}
    for index in order:
        size = sizes[index]
        for slot, (start, end) in enumerate(free):
            aligned = -(-start // size) * size
            if aligned + size - 1 > end:
                continue
            replacement = []
            if aligned > start:
                replacement.append((start, aligned - 1))
            if aligned + size <= end:
                replacement.append((aligned + size, end))
            free[slot:slot + 1] = replacement
            placements[index] = aligned
            break
        else:
            return None
    return placements, free


def allocate_anchors(cidr: str, hosts, order: str = "largest_first", point_to_point: bool = False) -> dict:
    """Independent reproduction of the ipv4_allocate result, formatted by the stdlib."""
    pool = ipaddress.ip_network(cidr, strict=False)
    prefixes = [prefix_for_hosts(host, point_to_point) for host in hosts]
    sizes = [2 ** (32 - prefix) for prefix in prefixes]
    packed = place_blocks(int(pool.network_address), pool.num_addresses, sizes, order == "largest_first")
    if packed is None:
        return {
            "error": f"requests need {sum(sizes)} addresses but {pool} only has {pool.num_addresses}",
            "requested_hosts": sum(hosts),
            "needed": sum(sizes),
            "parent_addresses": pool.num_addresses,
        }
    placements, free_runs = packed
    allocations = []
    for index in sorted(placements):
        block = ipaddress.ip_network((placements[index], prefixes[index]))
        allocations.append({
            "request_index": index,
            "requested_hosts": hosts[index],
            "prefix": prefixes[index],
            "cidr": str(block),
            "network": str(block.network_address),
            "last": str(block.broadcast_address),
            "addresses": block.num_addresses,
            "usable_hosts": usable_hosts(prefixes[index]),
            "wasted": block.num_addresses - hosts[index],
        })
    free = [str(block) for (from_, to_) in free_runs
            for block in ipaddress.summarize_address_range(ipaddress.ip_address(from_), ipaddress.ip_address(to_))]
    return {
        "cidr": str(pool),
        "order": order,
        "hosts": list(hosts),
        "count": len(allocations),
        "placement_order": [index + 1 for index in placements],
        "requested_hosts": sum(hosts),
        "allocated_addresses": sum(sizes),
        "allocated_usable": sum(usable_hosts(prefix) for prefix in prefixes),
        "parent_addresses": pool.num_addresses,
        "wasted_addresses": sum(sizes) - sum(hosts),
        "free_count": len(free),
        "free_addresses": sum(to_ - from_ + 1 for (from_, to_) in free_runs),
        "allocations": allocations,
        "free": free,
    }


def exclude_anchors(cidr: str, cuts_text) -> dict:
    """Independent reproduction of ipv4_exclude: the free list comes from
    `ipaddress.address_exclude` (a completely different code path from the
    plugin's interval merge)."""
    pool = ipaddress.ip_network(cidr, strict=False)
    free = [pool]
    entries = []
    outside_addresses = 0
    for text in cuts_text:
        cut = ipaddress.ip_network(text, strict=False)
        removed = 0
        if cut.overlaps(pool):
            start = max(int(cut.network_address), int(pool.network_address))
            end = min(int(cut.broadcast_address), int(pool.broadcast_address))
            removed = end - start + 1
        outside_addresses += cut.num_addresses - removed
        entries.append({
            "input": text,
            "cidr": str(cut),
            "addresses": cut.num_addresses,
            "removed": removed,
            "fully_inside": removed == cut.num_addresses,
        })
        next_free = []
        for block in free:
            if not block.overlaps(cut):
                next_free.append(block)
                continue
            start = max(int(block.network_address), int(cut.network_address))
            end = min(int(block.broadcast_address), int(cut.broadcast_address))
            for piece in ipaddress.summarize_address_range(ipaddress.ip_address(start), ipaddress.ip_address(end)):
                next_free.extend(block.address_exclude(piece))
        free = next_free
    free_addresses = sum(block.num_addresses for block in free)
    # `address_exclude` returns its pieces in an order of its own; sort by address so
    # the printed anchors match the plugin's ascending interval order.
    ordered = sorted(free, key=lambda block: int(block.network_address))
    return {
        "cidr": str(pool),
        "excluded": entries,
        "removed_addresses": pool.num_addresses - free_addresses,
        "outside_addresses": outside_addresses,
        "free_count": len(ordered),
        "free_addresses": free_addresses,
        "free": [str(block) for block in ordered],
    }


ALLOCATE_SCENARIOS = [
    ("R1. 10.0.0.0/16 hosts [100, 50, 20, 20, 5] largest_first (the roadmap case)",
     {"cidr": "10.0.0.0/16", "hosts": [100, 50, 20, 20, 5]}),
    ("R2. 10.0.0.0/24 hosts [5, 100] largest_first (big block placed first)",
     {"cidr": "10.0.0.0/24", "hosts": [5, 100]}),
    ("R3. 10.0.0.0/24 hosts [5, 100] order=given (input sequence)",
     {"cidr": "10.0.0.0/24", "hosts": [5, 100], "order": "given"}),
    ("R4. 10.0.0.0/24 hosts [1, 2] default (a /30 is the smallest subnet)",
     {"cidr": "10.0.0.0/24", "hosts": [1, 2]}),
    ("R5. 10.0.0.0/24 hosts [1, 2] point_to_point (RFC 3021 /31 and /32)",
     {"cidr": "10.0.0.0/24", "hosts": [1, 2], "point_to_point": True}),
    ("R6. 192.168.1.0/24 hosts [120, 60, 30, 14, 2]",
     {"cidr": "192.168.1.0/24", "hosts": [120, 60, 30, 14, 2]}),
    ("R7. capacity error: 10.0.0.0/24 hosts [200, 100]",
     {"cidr": "10.0.0.0/24", "hosts": [200, 100]}),
    ("R8. host bits masked: 10.0.0.7/24 hosts [10]",
     {"cidr": "10.0.0.7/24", "hosts": [10]}),
]

EXCLUDE_SCENARIOS = [
    ("T. 10.0.0.0/16 minus 10.0.0.0/24 and 10.0.8.0/22", "10.0.0.0/16", ["10.0.0.0/24", "10.0.8.0/22"]),
    ("U. overlapping exclusions are removed once", "10.0.0.0/16", ["10.0.0.0/23", "10.0.0.0/24"]),
    ("V. an exclusion outside the pool removes nothing", "10.0.0.0/16", ["192.168.0.0/24"]),
    ("W. pool 10.0.0.0/25 fully covered by a /24 exclusion", "10.0.0.0/25", ["10.0.0.0/24"]),
    ("X. ragged gaps: 10.0.0.0/24 minus a /26 and a /27", "10.0.0.0/24", ["10.0.0.64/26", "10.0.0.192/27"]),
    ("Y. host bits in the pool: 10.0.0.7/24 minus 10.0.0.0/26", "10.0.0.7/24", ["10.0.0.0/26"]),
]


def legacy_ipv4_anchors() -> dict:
    """Anchors quoted in test/ipv4.test.ts (legacy file, oracle marker added in v0.4.0)."""
    eth = ipaddress.ip_network("192.168.1.0/24")
    loop = ipaddress.ip_network("10.10.10.8/29")
    single = ipaddress.ip_network("172.16.5.5/32")
    whole = ipaddress.ip_network("0.0.0.0/0")
    cgnat = ipaddress.ip_network("100.64.0.0/10")

    def from_mask(mask: str) -> int:
        return 32 - (WIDTH - int(ipaddress.ip_address(mask))).bit_length() + 1

    return {
        "192.168.0.1 integer": int(ipaddress.ip_address("192.168.0.1")),
        "0.0.0.0 integer": int(ipaddress.ip_address("0.0.0.0")),
        "255.255.255.255 integer": int(ipaddress.ip_address("255.255.255.255")),
        "192.168.1.0/24 network integer": int(eth.network_address),
        "192.168.1.0/24 broadcast integer": int(eth.broadcast_address),
        "192.168.1.0/24 addresses": eth.num_addresses,
        "192.168.1.0/24 usable_hosts": usable_hosts(24),
        "10.10.10.8/29 addresses": loop.num_addresses,
        "10.10.10.8/29 usable_hosts": usable_hosts(29),
        "10.10.10.8/29 network integer": int(loop.network_address),
        "10.10.10.8/29 broadcast integer": int(loop.broadcast_address),
        "172.16.5.5/32 addresses": single.num_addresses,
        "172.16.5.5/32 usable_hosts": usable_hosts(32),
        "172.16.5.5 integer": int(ipaddress.ip_address("172.16.5.5")),
        "192.168.1.0/31 usable_hosts": usable_hosts(31),
        "0.0.0.0/0 addresses": whole.num_addresses,
        "0.0.0.0/0 usable_hosts": whole.num_addresses - 2,
        "100.64.0.0/10 addresses": cgnat.num_addresses,
        "100.64.0.0/10 usable_hosts": cgnat.num_addresses - 2,
        "dotted masks → prefix": {
            "255.255.255.0": from_mask("255.255.255.0"),
            "255.255.255.248": from_mask("255.255.255.248"),
            "0.0.0.0": from_mask("0.0.0.0"),
            "255.255.255.255": from_mask("255.255.255.255"),
            "255.255.255.254": from_mask("255.255.255.254"),
            "255.192.0.0": from_mask("255.192.0.0"),
        },
        "summarize 192.168.1.1..3": [str(n) for n in ipaddress.summarize_address_range(
            ipaddress.ip_address("192.168.1.1"), ipaddress.ip_address("192.168.1.3"))],
        "rangeToCidrs 192.168.1.1..3 block sizes": [
            n.num_addresses for n in ipaddress.summarize_address_range(
                ipaddress.ip_address("192.168.1.1"), ipaddress.ip_address("192.168.1.3"))],
    }


def legacy_ipv6_anchors() -> dict:
    """Anchors quoted in test/ipv6.test.ts (legacy file, oracle marker added in v0.4.0)."""
    eight = ipaddress.ip_network("::/64")
    single = ipaddress.ip_network("::1/128")
    return {
        "::1 → hextet value": int(ipaddress.ip_address("::1")),
        ":: → hextet value": int(ipaddress.ip_address("::")),
        "all-ones 128-bit value": (1 << 128) - 1,
        "::/64 addresses": eight.num_addresses,
        "::1/128 addresses": single.num_addresses,
        "2001:db8::/64 addresses": ipaddress.ip_network("2001:db8::/64").num_addresses,
        "prefix anchors": [64, 128],
        "2001:db8::1 hex128": format(int(ipaddress.ip_address("2001:db8::1")), "032x"),
        "::ffff:192.168.1.1 embedded": str(ipaddress.ip_address("::ffff:192.168.1.1").ipv4_mapped),
    }


def show_plan(title: str, data: dict) -> None:
    print(f"── {title} " + "─" * max(0, 62 - len(title)))
    for key, value in data.items():
        if key in ("allocations", "free", "excluded"):
            continue
        print(f"   {key} = {value}")
    for entry in data.get("allocations", []):
        print(f"   alloc #{entry['request_index'] + 1}: hosts={entry['requested_hosts']} → {entry['cidr']}"
              f" (last {entry['last']}, usable {entry['usable_hosts']}, wasted {entry['wasted']})")
    for entry in data.get("excluded", []):
        print(f"   cut {entry['input']} → {entry['cidr']} (addresses {entry['addresses']},"
              f" removed {entry['removed']}, fully_inside {entry['fully_inside']})")
    if "free" in data:
        print(f"   free ({data['free_count']}) = {data['free']}")
    print()


# ─────────────────────────────────────────────────────────────────────────────
# Self-check: the oracle's own anchors must satisfy independent rulers (R61/R63)
# ─────────────────────────────────────────────────────────────────────────────

def brute_force_pack(base: int, parent_size: int, sizes) -> bool:
    """True when some assignment of aligned, non-overlapping blocks exists."""
    used: list = []

    def fits(start: int, size: int) -> bool:
        if start % size or start < base or start + size - 1 > base + parent_size - 1:
            return False
        return all(not (start < other_start + other_size and other_start < start + size)
                   for (other_start, other_size) in used)

    def go(position: int) -> bool:
        if position == len(sizes):
            return True
        size = sizes[position]
        for start in range(base, base + parent_size, size):
            if fits(start, size):
                used.append((start, size))
                if go(position + 1):
                    return True
                used.pop()
        return False

    return go(0)


def pack_partition_holds(base: int, parent_size: int, sizes) -> bool:
    """Every placement is aligned, inside and disjoint, and placements + free
    partition the parent exactly."""
    packed = place_blocks(base, parent_size, sizes, largest_first=True)
    if packed is None:
        return False
    placements, free_runs = packed
    blocks = [(placements[index], sizes[index]) for index in sorted(placements)]
    if len(blocks) != len(sizes):
        return False
    for (start, size) in blocks:
        if start % size or start < base or start + size - 1 > base + parent_size - 1:
            return False
    for i, (start, size) in enumerate(blocks):
        for (other_start, other_size) in blocks[i + 1:]:
            if start < other_start + other_size and other_start < start + size:
                return False
    covered = sum(size for _, size in blocks) + sum(end - start + 1 for start, end in free_runs)
    return covered == parent_size


def set_free_addresses(pool: str, cuts) -> set:
    """Free addresses of `pool` after removing the cuts, as a plain Python set."""
    inside = set(range(int(ipaddress.ip_network(pool).network_address),
                       int(ipaddress.ip_network(pool).broadcast_address) + 1))
    for text in cuts:
        cut = ipaddress.ip_network(text, strict=False)
        inside -= set(range(int(cut.network_address), int(cut.broadcast_address) + 1))
    return inside


def self_check() -> int:
    failures: list = []

    def expect(condition: bool, message: str) -> None:
        if not condition:
            failures.append(message)

    # 1) definition-level rulers (RFC 3021 / address-space identities)
    expect(usable_hosts(32) == 1 and usable_hosts(31) == 2 and usable_hosts(30) == 2,
           "/31 must follow RFC 3021 (2 usable) and /32 must be a single host")
    expect(usable_hosts(24) == 2 ** 8 - 2, "a /24 offers 254 usable addresses by definition")
    expect(usable_hosts(0) == WIDTH - 2, "a /0 offers 2^32 - 2 usable addresses by definition")
    expect(prefix_for_hosts(1, False) == 30 and prefix_for_hosts(2, False) == 30,
           "without point_to_point the smallest subnet is a /30")
    expect(prefix_for_hosts(1, True) == 32 and prefix_for_hosts(2, True) == 31,
           "with point_to_point 1 host is a /32 and 2 hosts a /31")
    expect(prefix_for_hosts(254, False) == 24 and prefix_for_hosts(255, False) == 23,
           "host counts must round up to the smallest prefix that fits")
    expect(prefix_for_hosts(0, False) is None and prefix_for_hosts(MAX_REQUEST_HOSTS + 1, False) is None,
           "host counts outside 1..2^32-2 must be rejected")

    # 2) placement: exhaustive bounded family — greedy in ANY order must succeed
    #    exactly when a packing exists (and always when the total fits).
    family = [1, 2, 4, 8]
    checked = 0
    for parent in (8, 16):
        for length in range(1, 4):
            for combo in __import__("itertools").product(family, repeat=length):
                sizes = list(combo)
                if max(sizes) > parent:
                    continue
                checked += 1
                given = place_blocks(0, parent, sizes, largest_first=False)
                desc = place_blocks(0, parent, sizes, largest_first=True)
                fits = sum(sizes) <= parent
                expect((given is not None) == fits, f"given-order packing disagrees with capacity for {sizes} in /{parent}")
                expect((desc is not None) == fits, f"descending packing disagrees with capacity for {sizes} in /{parent}")
                if fits:
                    expect(brute_force_pack(0, parent, sizes), f"no packing exists for {sizes} in /{parent}")
                    expect(pack_partition_holds(0, parent, sizes), f"placement invariant broken for {sizes} in /{parent}")
                else:
                    expect(not brute_force_pack(0, parent, sizes), f"packing exists although total exceeds /{parent} for {sizes}")
    expect(checked > 0, "the bounded placement family must not be empty")

    # the order parameter must actually change the layout somewhere
    differing = 0
    for combo in __import__("itertools").product([1, 2, 4, 8], repeat=3):
        desc = place_blocks(0, 32, list(combo), largest_first=True)
        given = place_blocks(0, 32, list(combo), largest_first=False)
        if desc is not None and given is not None and desc[0] != given[0]:
            differing += 1
    expect(differing > 0, "largest_first and given must be able to produce different layouts")

    # 3) exclusion: the interval arithmetic must agree with `address_exclude`
    #    (stdlib) and with plain set arithmetic on small pools.
    for pool, cuts in [("10.0.0.0/24", ["10.0.0.64/26", "10.0.0.192/27"]),
                       ("10.0.0.0/25", ["10.0.0.0/24"]),
                       ("10.0.0.0/16", ["10.0.0.0/23", "10.0.0.0/24"]),
                       ("10.0.0.0/24", ["192.168.0.0/16"]),
                       ("10.0.0.0/24", ["10.0.0.0/22"])]:
        data = exclude_anchors(pool, cuts)
        free_total = sum(ipaddress.ip_network(block).num_addresses for block in data["free"])
        expect(free_total == data["free_addresses"], f"free list and free_addresses disagree for {pool} − {cuts}")
        expect(data["removed_addresses"] + data["free_addresses"] == ipaddress.ip_network(pool).num_addresses,
               f"removed + free must equal the pool for {pool} − {cuts}")
        for block in data["free"]:
            for text in cuts:
                expect(not ipaddress.ip_network(block).overlaps(ipaddress.ip_network(text)),
                       f"free block {block} still overlaps cut {text}")
        if ipaddress.ip_network(pool).num_addresses <= 1024:
            listed = {address for block in data["free"]
                      for address in range(int(ipaddress.ip_network(block).network_address),
                                           int(ipaddress.ip_network(block).broadcast_address) + 1)}
            expect(listed == set_free_addresses(pool, cuts),
                   f"free addresses disagree with set arithmetic for {pool} − {cuts}")
        expect(data["outside_addresses"] == sum(entry["addresses"] - entry["removed"] for entry in data["excluded"]),
               f"outside_addresses must equal the per-entry outside sum for {pool} − {cuts}")

    # 4) capacity error anchors stay honest
    error = allocate_anchors("10.0.0.0/24", [200, 100])
    expect("error" in error and error["needed"] == 384 and error["parent_addresses"] == 256,
           "the oversized request set must report the real totals")

    if failures:
        print("❌ oracle self-check FAILED")
        for message in failures[:40]:
            print(f"   - {message}")
        print(f"   {len(failures)} problem(s)")
        return 1
    print(f"✅ oracle self-check passed ({checked} placement families, exclude rulers, RFC identities)")
    return 0


def main(argv=None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    if "--check" in args:
        return self_check()
    main_anchors()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

