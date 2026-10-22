---
kind: upgrade-guide
description: W1 用量账本改为固定人民币金额与精确渠道的版本化价目，不再使用可变美元目录估算。
---

# W1 人民币计价与历史记录

[English](guide.md) | 中文

## 变更

W1 本地用量账本的金额基准由美元改为人民币。价格与汇率通过 `config.prices.book` 中带生效时间的记录，仅影响之后调用。旧币种、匹配及价格表设置不能覆盖版本化价目。OpenRouter 价格仅用于精确的 OpenRouter 渠道；其他渠道仅绑定实际收费来源，包括独立的 VX Default、High、Enterprise 分组，或保留手填锁定。删除归档价格版本，保留过去消费。

## 迁移

1. 完成 Test 验证，再通过日用启动器在日用退出后应用冻结候选。不热替换运行中的日用账本。
2. 首次启动将 `DSH_HOME/storages/cost-meter-custom/ledger.json` 备份至相邻的 `pricing-backups/before-cny-*.json`，转换旧金额字段、导入手填价格并记录 `prices.book.version = 1`。外层账本版本仍为 1，价格簿标记用于识别人民币基准。
3. 消费凭据升级另存 `pricing-backups/before-billing-receipts-*.json` 备份。保留先前已核实修正，其余历史金额统一固定为已保存账本合计，明细不足的显示历史汇总。新凭据与聚合金额同时提交；用量缺失保持未定价。重启后核对会话明细、模型合计与侧栏费用一致，详见[调用编号记录](../../../persistence-changes/2026-10-21-w1-call-receipts.zh.md)。
4. 核对各 Provider 分组与来源状态。未修改的导入 VX 记录跟随分组；手动改价保持锁定。未知规则保留旧价并提示。缓存写入、一小时写入及实际思考强度倍率进入调用统计；不猜测历史缺失的时长或参数，详见 [V4 可选用量字段记录](../../../persistence-changes/2026-10-21-w1-billing-usage.zh.md)。
5. 在模型价格页选择手动或自动美元兑人民币汇率，确认新美元调用采用保存汇率、历史人民币金额保持固定。不同计费模式配置独立渠道，不自动推断 Batch/Flex 折扣。
6. 回退时先停止应用，另存当前账本，再同时恢复匹配的人民币迁移前账本备份和旧应用产物。旧程序不能读取人民币账本。备份之后产生的调用需要单独核对；只恢复旧程序不是有效回退。
7. 仅在明确授权的一次性历史纠错中，停止目标应用，运行 `node packages/w1/usage/scripts/reprice-history.mjs --ledger <私有账本.json> --sessions <会话目录> --plan <私有方案.json> --preview`，随后使用相同 `--ledger`、`--plan` 及 `--apply` 应用该方案。核对 `prices.book.audit.status = repriced`、私有差额报告和备份。方案按已记录规则估算缺失细节，只改旧消费金额；当前价格、Token 总数和已有凭据不变。回退本次纠错时停止应用并恢复对应 `*-before.json`。模型价格和峰谷设置统一在“用量”维护。
