# dsh-ipcalc

IP & subnet math toolbox for [DeepSeek Harness (dsh)](https://github.com/deepseek-ai/deepseek-harness).
Eleven pure-math tools — **zero runtime dependencies, no network I/O** — so agents stop doing
subnet arithmetic in their heads (where they frequently get it wrong).

## Tools

| Tool | What it does |
|------|--------------|
| `ipv4_subnet` | Full subnet layout for an IPv4 CIDR: network, broadcast, netmask, wildcard, host range, address counts, integer forms and IANA classes |
| `ipv4_summarize` | Reduce a list of IPv4 addresses/ranges to the minimal covering CIDR list (merge + supernet) |
| `ipv4_split` | Split an IPv4 CIDR into equal network-aligned subnets — by part count (power of two) or by target prefix |
| `ipv4_allocate` | **VLSM allocation**: give a parent block plus the host count each subnet needs, get one aligned subnet per request, the placement order, the free blocks left over and the waste |
| `ipv4_exclude` | **Pool subtraction**: carve reserved subnets out of a pool, get the remaining free CIDR list, the exact free address count and per-entry details |
| `ipv4_range` | Turn an arbitrary address range (`start` … `end`) into the minimal covering CIDR list — the inverse of summarizing |
| `ip_parse` | Validate, normalize (RFC 5952) and classify any IPv4/IPv6 address, including embedded IPv4-in-IPv6 forms |
| `ipv6_subnet` | Full subnet layout for an IPv6 CIDR: network, first/last host, exact address counts (128-bit BigInt math) and IANA class |
| `ipv6_summarize` | Reduce a list of IPv6 addresses/prefixes to the minimal covering IPv6 CIDR list (BigInt merge + supernet), with exact decimal-string counts and a total for addresses listed twice |
| `ip_overlaps` | **Conflict check**: compare IPv4 and/or IPv6 CIDRs pairwise and report every overlapping pair with its relation (duplicate / containment) and the exact overlap size |
| `ip_match` | Membership test: is a bare IP (IPv4 or IPv6) inside a CIDR range? Reports the normalized range too |

## Install

```bash
dsh plugin --profile <your-profile> add github:TYEclipse/dsh-ipcalc
```

## Usage

```
ipv4_subnet("192.168.1.25/24")
→ network 192.168.1.0/24
  netmask 255.255.255.0  wildcard 0.0.0.255  broadcast 192.168.1.255
  host range 192.168.1.1 – 192.168.1.254  (254 usable of 256)
  classes: network=private  host=private

ipv4_subnet("10.10.10.10/255.255.255.248")   # dotted-mask input works too
→ network 10.10.10.8/29  (6 usable hosts)

ipv4_summarize(["10.0.0.0/24", "10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"])
→ ["10.0.0.0/22"]

ipv4_split("10.0.0.0/24", parts=4)
→ 4 × /26 subnets, 62 usable hosts each
  10.0.0.0/26   10.0.0.64/26   10.0.0.128/26   10.0.0.192/26

ipv4_split("192.168.0.0/22", prefix=24)
→ 4 × /24 subnets, 254 usable hosts each

ipv4_allocate("10.0.0.0/16", hosts=[100, 50, 20, 20, 5])
→ 5 subnet(s) placed, 264 of 65536 address(es) used, 69 beyond the requests
  #1 needs 100 → 10.0.0.0/25 (126 usable, 28 wasted)
  #2 needs 50 → 10.0.0.128/26 (62 usable, 14 wasted)
  #3 needs 20 → 10.0.0.192/27 (30 usable, 12 wasted)
  #4 needs 20 → 10.0.0.224/27 (30 usable, 12 wasted)
  #5 needs 5 → 10.0.1.0/29 (6 usable, 3 wasted)
  free: 12 block(s), 65272 address(es)

ipv4_allocate("10.0.0.0/24", hosts=[1, 2], point_to_point=True)   # RFC 3021 shortcuts
→ #1 needs 1 → 10.0.0.2/32 (1 usable, 0 wasted) — single host
  #2 needs 2 → 10.0.0.0/31 (2 usable, 0 wasted) — RFC 3021 point-to-point pair

ipv4_exclude("10.0.0.0/16", exclude=["10.0.0.0/24", "10.0.8.0/22"])
→ 10.0.0.0/16 minus 2 exclusion(s) → 8 free block(s) covering 64256 address(es)
  10.0.1.0/24  10.0.2.0/23  10.0.4.0/22  10.0.12.0/22
  10.0.16.0/20  10.0.32.0/19  10.0.64.0/18  10.0.128.0/17

ipv4_range("10.0.5.3", "10.0.9.200")
→ 13 CIDR(s) covering 1222 address(es)
  10.0.5.3/32  10.0.5.4/30  10.0.5.8/29  …  10.0.9.192/29  10.0.9.200/32

ip_parse("::ffff:192.168.1.1")
→ IPv6, class ipv4_mapped, normalized ::ffff:c0a8:101 (embeds 192.168.1.1)

ipv6_subnet("2001:db8:1234:5678::1/64")
→ network 2001:db8:1234:5678::/64
  range 2001:db8:1234:5678::1 – 2001:db8:1234:5678:ffff:ffff:ffff:fffe
  (18446744073709551614 usable of 18446744073709551616)
  class documentation  full 2001:0db8:1234:5678:0000:0000:0000:0000

ipv6_subnet("::/0")
→ network ::/0
  range ::1 – ffff:ffff:ffff:ffff:ffff:ffff:ffff:fffe
  (340282366920938463463374607431768211454 usable of 340282366920938463463374607431768211456)
  class unspecified  full 0000:0000:0000:0000:0000:0000:0000:0000

ipv6_subnet("fe80::1/127")
→ network fe80::/127
  range fe80:: – fe80::1  (2 usable of 2)
  class link_local  full fe80:0000:0000:0000:0000:0000:0000:0000
  note: RFC 6164: both addresses are usable on point-to-point links

ip_match("192.168.1.5", "192.168.1.0/24")
→ 192.168.1.5 is INSIDE 192.168.1.0/24 (IPv4)
  network 192.168.1.0 – 192.168.1.255

ip_match("2001:db8::5", "2001:db8::/32")
→ 2001:db8::5 is INSIDE 2001:db8::/32 (IPv6)
  network 2001:db8:: – 2001:db8:ffff:ffff:ffff:ffff:ffff:ffff

ipv6_summarize(["2001:db8::/33", "2001:db8:8000::/33"])
→ 2 input(s) → 1 IPv6 CIDR(s) covering 79228162514264337593543950336 address(es)
  2001:db8::/32

ip_overlaps(["10.0.0.0/24", "10.0.0.128/25", "2001:db8::/32"])
→ 1 conflicting pair(s) of 1 same-family pair(s):
  #1 10.0.0.0/24 vs 10.0.0.128/25 (#2) — a_contains_b, 128 address(es) overlapping
```

## Semantics

- **Exact arithmetic** — IPv4 math uses plain double arithmetic on 32-bit integers
  (values up to 2³² are exactly representable), so there is no bitwise-overflow risk.
  IPv6 subnet math uses 128-bit `BigInt`, so every boundary and count is exact;
  address counts are returned as decimal strings because they exceed `Number.MAX_SAFE_INTEGER`.
- **/31 follows RFC 3021** — both addresses are reported as usable (point-to-point links).
- **/32 is a single host** — first/last host equal the address itself.
- **IPv6 /127 follows RFC 6164** — both addresses usable on point-to-point links;
  **IPv6 /128 is a single host**.
- **Bare addresses** are treated as `/32` (IPv4) or `/128` (IPv6); dotted netmasks
  (`/255.255.255.248`) are accepted anywhere an IPv4 prefix length is; non-contiguous
  masks are rejected.
- **RFC 5952 canonicalization** — IPv6 is lowercased, leading zeros stripped, and the
  longest (leftmost on ties) run of two or more zero hextets compressed to `::`.
- **Classification** follows the IANA special-purpose registries:
  IPv4 `unspecified / broadcast / loopback / private (10/8, 172.16/12, 192.168/16) /
  cgnat (100.64/10) / link_local (169.254/16) / documentation (192.0.2/24,
  198.51.100/24, 203.0.113/24) / multicast (224/4) / reserved (240/4) / global`;
  IPv6 `unspecified / loopback / ipv4_mapped / ipv4_compatible / documentation
  (2001:db8::/32) / link_local (fe80::/10) / multicast (ff00::/8) /
  unique_local (fc00::/7) / global`.
  Classification is best-effort for the common registry entries, not a full
  CIDR-overlap engine.
- **`ip_match` rejects mixed versions** — testing an IPv4 address against an IPv6
  CIDR (or vice versa) returns `valid: false` with an explanatory reason instead
  of a silently wrong answer.
- **Prefix blocks are nested or disjoint — never "partly" overlapping** — so
  `ip_overlaps` reports `duplicate`, `a_contains_b` or `b_contains_a`, and a pair
  either conflicts or it does not. Two CIDRs that only *look* separate can still be
  the same block once host bits are masked (`2001:db8:0:1::/48` is `2001:db8::/48`:
  a /48 cannot tell the 4th hextet apart), which is why every input is normalized
  before comparison and the answer says how many entries were rewritten.
- **IPv6 summarization returns exact counts as strings** — the union of two /64s is
  36893488147419103232 addresses, which no JavaScript number can hold; `ipv6_summarize`
  reports `addresses_covered`, `input_addresses` and `overlapping_addresses` as decimal
  strings so the answer stays exact, and its block list is minimal (no two neighbours
  could be merged).
- **`ipv4_split` stays aligned and bounded** — host bits are masked away first, the
  target prefix must be longer than the source prefix, and one call returns at most
  256 subnets (ask for a shorter prefix, or split the sub-ranges in turn). `/31`
  subnets report 2 usable hosts per RFC 3021, `/32` subnets report 1.
- **`ipv4_allocate` plans a real VLSM layout** — every request gets the smallest
  prefix that can hold its host count (`1–2 hosts → /30` by default, so a subnet is
  never silently a point-to-point pair), placed network-aligned with no overlap.
  `order: "largest_first"` (default) puts the biggest subnets lowest in the block and
  `"given"` keeps your sequence; either way all requests are placed whenever they fit,
  because aligned power-of-two blocks cannot be fragmented by placement order — so a
  failure always means the requests genuinely do not fit, and the error says by how
  much. Results stay in request order and carry a `placement` list of the request
  indices in the order they were laid out; `point_to_point: true` opts into the RFC 3021
  shortcuts (`1 host → /32`, `2 hosts → /31`). Up to 64 requests per call.
- **`ipv4_exclude` reports the space that survives** — the free list is minimal
  (adjacent blocks merged), overlapping exclusions are removed once, and an exclusion
  that reaches outside the pool is reported as such (`outside_addresses`, per-entry
  `removed`) instead of being silently clipped. Up to 64 exclusions per call.
- **`ipv4_range` covers exactly the requested range** — the block list is minimal
  (no oversized approximation), `start` must not be greater than `end`, and both ends
  must be bare addresses (CIDR notation is rejected with a reason).

## Development

```bash
pnpm install
pnpm build
pnpm test
pnpm lint
```

## License

MIT

---

# dsh-ipcalc（中文简介）

面向 DeepSeek Harness 的 IP 与子网数学工具箱，十一个纯本地计算工具，零运行时依赖、无任何网络访问：

- `ipv4_subnet`：给定 CIDR（支持 `a.b.c.d/前缀`、点分掩码、裸地址）输出完整子网布局——网络号、广播地址、子网掩码、反掩码、可用主机范围与数量、整数形式、IANA 分类（私网/环回/链路本地/CGNAT/文档段/组播/保留段等）。
- `ipv4_summarize`：把一组 IPv4 地址/网段归并成最小覆盖 CIDR 列表（相邻合并 + 对齐超网）。
- `ipv4_split`：把 IPv4 CIDR 等分成网络对齐的子网——按份数（必须是 2 的幂）或按目标前缀；输出每个子网的 CIDR 与地址/可用主机数（单次上限 256 个子网）。子网大小需要不同时用 `ipv4_allocate`。
- `ipv4_allocate`：**VLSM 分配**——给定父网段与「每个子网需要多少主机」（如 `hosts=[100, 50, 20, 20, 5]`），逐条给出对齐、互不重叠、容量刚好够的子网，并附放置顺序、剩余空闲块与「超出需求分配掉的地址数」；默认每个子网不小于 /30（`point_to_point=true` 才允许 /31、/32 这类 RFC 3021 点对点形态）；单次上限 64 条请求，放不下时如实报差多少，不返回半个方案。
- `ipv4_exclude`：**地址池扣除**——给定父网段与要挖掉的保留网段，给出剩余空闲空间的最小 CIDR 列表、精确空闲地址数，以及每条例外「实际扣掉多少 / 是否完全在池内」；重叠例外只扣一次，挖到池外的如实标注而不是静默裁掉。
- `ipv4_range`：把任意地址区间（起始地址到结束地址）转成**最小覆盖 CIDR 列表**——summarize 的逆运算，用于把「10.0.5.3 到 10.0.9.200」这类区间变成精确的 ACL 规则，而不是用一条过大的网段近似。
- `ip_parse`：校验、规范化（RFC 5952）并分类任意 IPv4/IPv6 地址，识别 `::ffff:a.b.c.d` 内嵌 IPv4 形式。
- `ipv6_subnet`：IPv6 子网计算——128 位 BigInt 精确算术，输出网络地址、首末可用主机、精确地址数（十进制字符串，超出 2⁵³ 不失真）、RFC 5952 规范形与 IANA 分类；/127 遵循 RFC 6164（点对点两地址均可用）、/128 视为单主机。
- `ipv6_summarize`：把一组 IPv6 地址/前缀归并为最小覆盖 CIDR 列表（相邻合并 + 对齐超网），地址数以十进制字符串精确返回，并报出「被重复列出的地址数」——IPv6 的地址数早已超出 2⁵³，用数字返回必然失真。
- `ip_overlaps`：把 IPv4 与/或 IPv6 网段两两比对，逐对给出冲突关系（完全相同 / 一方包含另一方）与精确重叠地址数；输入先规范化（`10.0.0.5/24` 会按 `10.0.0.0/24` 比较），跨网族对只计数不比较——IPv4 与 IPv6 永远不可能重叠。
- `ip_match`：判定裸 IP（v4/v6）是否属于某 CIDR 网段，并给出规范化网段范围；版本错配（v4 对 v6）明确报因，绝不静默出错。

专门解决大模型心算子网边界常出错的问题；/31 遵循 RFC 3021，/32 视为单主机。
