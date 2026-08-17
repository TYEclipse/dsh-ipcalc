# dsh-ipcalc

IP & subnet math toolbox for [DeepSeek Harness (dsh)](https://github.com/deepseek-ai/deepseek-harness).
Three pure-math tools — **zero runtime dependencies, no network I/O** — so agents stop doing
subnet arithmetic in their heads (where they frequently get it wrong).

## Tools

| Tool | What it does |
|------|--------------|
| `ipv4_subnet` | Full subnet layout for an IPv4 CIDR: network, broadcast, netmask, wildcard, host range, address counts, integer forms and IANA classes |
| `ipv4_summarize` | Reduce a list of IPv4 addresses/ranges to the minimal covering CIDR list (merge + supernet) |
| `ip_parse` | Validate, normalize (RFC 5952) and classify any IPv4/IPv6 address, including embedded IPv4-in-IPv6 forms |

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

ip_parse("::ffff:192.168.1.1")
→ IPv6, class ipv4_mapped, normalized ::ffff:c0a8:101 (embeds 192.168.1.1)
```

## Semantics

- **Exact arithmetic** — all math uses plain double arithmetic on 32-bit integers
  (values up to 2³² are exactly representable), so there is no bitwise-overflow risk.
- **/31 follows RFC 3021** — both addresses are reported as usable (point-to-point links).
- **/32 is a single host** — first/last host equal the address itself.
- **Bare addresses** are treated as `/32`; dotted netmasks (`/255.255.255.248`) are
  accepted anywhere a prefix length is; non-contiguous masks are rejected.
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

面向 DeepSeek Harness 的 IP 与子网数学工具箱，三个纯本地计算工具，零运行时依赖、无任何网络访问：

- `ipv4_subnet`：给定 CIDR（支持 `a.b.c.d/前缀`、点分掩码、裸地址）输出完整子网布局——网络号、广播地址、子网掩码、反掩码、可用主机范围与数量、整数形式、IANA 分类（私网/环回/链路本地/CGNAT/文档段/组播/保留段等）。
- `ipv4_summarize`：把一组 IPv4 地址/网段归并成最小覆盖 CIDR 列表（相邻合并 + 对齐超网）。
- `ip_parse`：校验、规范化（RFC 5952）并分类任意 IPv4/IPv6 地址，识别 `::ffff:a.b.c.d` 内嵌 IPv4 形式。

专门解决大模型心算子网边界常出错的问题；/31 遵循 RFC 3021，/32 视为单主机。
