# CHANGELOG · dsh-ipcalc

> 版本口径：patch 修 bug/补测试｜minor 新增用户可见功能｜major 破坏性变更。安装：`dsh plugin --profile web add github:TYEclipse/dsh-ipcalc`

## [0.3.0] — 2026-09-26
### Minor · R50
- **新增 `ipv4_split`** — 把一个 IPv4 CIDR 等分成网络对齐的子网：按份数（2 的幂，≤256）或按目标前缀；先掩掉主机位，目标前缀必须长于源前缀。输出每个子网的 CIDR、每子网地址数/可用主机数、首末子网，并遵循 RFC 3021（/31 两地址可用）与单主机 /32 约定。用于 VLSM 规划 / 网段切分。
- **新增 `ipv4_range`** — 把任意地址区间（`start` … `end`，裸地址）转成**最小覆盖 CIDR 列表**（summarize 的逆运算），输出覆盖块数、精确覆盖地址数与首末块；起止倒序、CIDR 写法、非法地址均明确报因。用于把「10.0.5.3 到 10.0.9.200」这类区间变成精确 ACL 规则。
- 测试 155 → 186（新增 `test/split.test.ts` 16 例、`test/range.test.ts` 15 例，含与 `ipv4_summarize`/`ipv4_subnet` 的跨工具不变量）；覆盖率 94.25% → 95.40%（基线随之上调）；期望值全部由随仓 oracle（`test/oracle/anchors.py`，stdlib `ipaddress` 独立实现）产出。
- 文档：README.md / README.zh.md 工具表、示例与语义小节同步（五工具 → 七工具）。

## [0.2.3] — 2026-09-11
### Patch · R31
- [自主进化] 接入版本与覆盖率门禁（工具链）

## [0.2.2] — 2026-09-11
### Patch · R31
- [自主进化] 接入版本与覆盖率门禁（工具链）

## [0.2.1] — 2026-09-11
### Patch · R31
- [自主进化] 接入版本与覆盖率门禁（工具链）

