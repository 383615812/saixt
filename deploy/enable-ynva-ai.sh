#!/usr/bin/env bash
# ============================================================================
# 为职教（/opt/ynva）配置 DeepSeek AI 密钥 —— 【默认不执行，待确认后再跑】
#
# 背景（2026-10-08 实测发现）：
#   /opt/ynva/.env 的 DEEPSEEK_API_KEY 与 DASHSCOPE_API_KEY 均为**空值**，应用自报
#   GET /api/system/ai-models → {"deepseek":{"configured":false}, "qwen":{"configured":false}}。
#   后果：POST /api/users/{id}/agent 直接返回 "AI 服务暂时不可用:" ——
#   职教高考「AI Agent 学习系统」的**核心能力实际是死的**，站点却处处 200、巡检全绿。
#   这属于典型的「绿得发亮但功能全废」，只能靠配置态判断，HTTP 码永远看不出来。
#
#   对照：同机的春招（/opt/saixt/server/.env）DEEPSEEK_API_KEY **已配置**（35 字符）。
#   同一家公司、同一个 DeepSeek 账号，key 可直接复用。
#
# ⚠️ 为什么需要人工确认：填入 key 会让职教开始真实调用大模型 = **产生费用**。
#    是否复用春招的 key（共担额度）、还是单独申请一个 key，属于预算决策，不擅自决定。
#
# 用法（确认后）：
#   bash enable-ynva-ai.sh            # 从春招 .env 复制 key
#   bash enable-ynva-ai.sh <你自己的key>
# ============================================================================
set -uo pipefail
cd /tmp || exit 2

YNVA_ENV=/opt/ynva/.env
SAIXT_ENV=/opt/saixt/server/.env
TS=$(date +%s)

KEY="${1:-}"
if [ -z "$KEY" ]; then
  echo "未传参 → 尝试复用春招的 DEEPSEEK_API_KEY"
  KEY=$(sudo grep -E '^DEEPSEEK_API_KEY=' "$SAIXT_ENV" | head -1 | cut -d= -f2- | tr -d '\r\n ')
fi
if [ -z "$KEY" ]; then
  echo "✗ 没拿到有效 key（春招 .env 里也是空的？）。请显式传入：bash $0 <key>"
  exit 2
fi
echo "待写入 key 长度: ${#KEY}  （不打印内容）"

echo "=== [1] 备份 .env ==="
sudo cp -p "$YNVA_ENV" "$YNVA_ENV.bak.aikey.$TS"
echo "  $YNVA_ENV.bak.aikey.$TS"

echo "=== [2] 写入 DEEPSEEK_API_KEY ==="
sudo python3 - "$YNVA_ENV" "$KEY" <<'PY'
import io, re, sys
p, key = sys.argv[1], sys.argv[2]
s = io.open(p, encoding='utf-8').read()
if re.search(r'^DEEPSEEK_API_KEY=', s, re.M):
    s = re.sub(r'^DEEPSEEK_API_KEY=.*$', 'DEEPSEEK_API_KEY=' + key, s, count=1, flags=re.M)
else:
    s = s.rstrip('\n') + '\nDEEPSEEK_API_KEY=' + key + '\n'
io.open(p, 'w', encoding='utf-8').write(s)
print('  WROTE')
PY
sudo chmod 600 "$YNVA_ENV"

echo "=== [3] 重启职教服务 ==="
sudo systemctl restart yn-vocational-agent
sleep 6
systemctl is-active yn-vocational-agent

echo "=== [4] 验证模型配置态（应为 configured=true）==="
curl -s -m 10 http://127.0.0.1:8000/api/system/ai-models; echo

echo "=== [5] 端到端验证（真实调用一次，会产生少量费用）==="
curl -s -m 60 -X POST http://127.0.0.1:8000/api/users/1/agent \
  -H 'Content-Type: application/json' -d '{"message":"你好，请用一句话介绍你自己"}' | head -c 500; echo

echo "=== [6] 清理验证产生的测试对话（仅删本条测试消息，不动真实数据）==="
sudo -u postgres psql -d yunzhixue -tAc "DELETE FROM agent_interactions WHERE user_message = '你好，请用一句话介绍你自己';" 2>/dev/null || echo "（清理跳过：无 postgres 权限时请手动删 agent_interactions 中本条测试行）"

echo
echo "回滚： sudo cp $YNVA_ENV.bak.aikey.$TS $YNVA_ENV && sudo systemctl restart yn-vocational-agent"
