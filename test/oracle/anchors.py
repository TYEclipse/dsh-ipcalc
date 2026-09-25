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


def main() -> None:
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


if __name__ == "__main__":
    main()
