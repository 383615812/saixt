#!/usr/bin/env bash
# fix-ynva-model-retry.sh
# 职教(ynva) model_router 增加「重试 + 指数退避」，抗 DeepSeek 免费额度瞬时限流/超时。
# 根因：原 _call_single 只试一次，DeepSeek 免费档偶发 429/超时即失败；Qwen 备用模型未配 key（死备），
#       导致 fleeting 限流窗口内整段 AI 不可用（00:36-00:41 实测 5 分钟集体失败）。
# 修复：对 429/5xx/超时做最多 2 次重试（共 3 次），尊重 Retry-After，退避 1s/2s；
#       并把故障恢复冷却从 300s 降到 120s，使限流窗口过后更快自愈。
# 零成本：不新增任何 key，仅强化既有调用的韧性。
set -euo pipefail

YNVA=/opt/ynva
MR=$YNVA/model_router.py
TS=$(date +%s)

echo "=== [1] 备份 ==="
sudo cp "$MR" "$MR.bak.retry.$TS"
echo "  backup: $MR.bak.retry.$TS"

echo "=== [2] 注入重试退避（幂等）==="
sudo python3 - <<'PYEOF'
import sys
P = "/opt/ynva/model_router.py"
s = open(P, encoding="utf-8").read()
orig = s

if "MAX_RETRIES" in s:
    print("SKIP: 已注入重试逻辑，无需重复打补丁")
    sys.exit(0)

OLD = '''def _call_single(config: Dict, messages: List[Dict],
                  temperature: float = 0.5, max_tokens: int = 1500,
                  timeout: int = 45) -> Tuple[bool, str, Optional[Dict]]:
    """调用单个模型 API"""
    if not config["available"]:
        return False, f"{config['name']} API Key 未配置", None

    try:
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {config['api_key']}",
        }
        payload = {
            "model": config["model"],
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }

        resp = requests.post(
            config["base_url"],
            headers=headers,
            json=payload,
            timeout=timeout,
        )

        if resp.status_code == 200:
            data = resp.json()
            content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
            if content:
                # 标记模型健康
                _model_health[config["provider"]]["healthy"] = True
                _model_health[config["provider"]]["fail_count"] = 0
                return True, content, {
                    "model": config["model"],
                    "provider": config["name"],
                    "usage": data.get("usage", {}),
                }
            else:
                return False, f"{config['name']} 返回空内容", None
        else:
            error_msg = f"{config['name']} HTTP {resp.status_code}: {resp.text[:100]}"
            logger.warning(error_msg)
            return False, error_msg, None

    except requests.exceptions.Timeout:
        return False, f"{config['name']} 请求超时", None
    except Exception as e:
        return False, f"{config['name']} 异常: {str(e)[:100]}", None'''

NEW = '''def _call_single(config: Dict, messages: List[Dict],
                  temperature: float = 0.5, max_tokens: int = 1500,
                  timeout: int = 30) -> Tuple[bool, str, Optional[Dict]]:
    """调用单个模型 API（带重试与退避，抗 DeepSeek 免费额度瞬时限流/超时）"""
    if not config["available"]:
        return False, f"{config['name']} API Key 未配置", None

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {config['api_key']}",
    }
    payload = {
        "model": config["model"],
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }

    MAX_RETRIES = 2                      # 含首试共 3 次
    BACKOFF = (1.0, 2.0)                 # 退避秒数
    last_err = f"{config['name']} 未发起调用"
    for attempt in range(MAX_RETRIES + 1):
        try:
            resp = requests.post(
                config["base_url"],
                headers=headers,
                json=payload,
                timeout=timeout,
            )
            if resp.status_code == 200:
                data = resp.json()
                content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
                if content:
                    _model_health[config["provider"]]["healthy"] = True
                    _model_health[config["provider"]]["fail_count"] = 0
                    return True, content, {
                        "model": config["model"],
                        "provider": config["name"],
                        "usage": data.get("usage", {}),
                    }
                # 空内容不重试，直接失败
                return False, f"{config['name']} 返回空内容", None
            # 限流/服务端错误：可重试
            retryable = resp.status_code in (429, 500, 502, 503, 504)
            last_err = f"{config['name']} HTTP {resp.status_code}: {resp.text[:100]}"
            if not retryable or attempt >= MAX_RETRIES:
                return False, last_err, None
            ra = resp.headers.get("Retry-After")
            try:
                wait = min(float(ra), 5.0) if ra is not None else BACKOFF[min(attempt, len(BACKOFF) - 1)]
            except (ValueError, TypeError):
                wait = BACKOFF[min(attempt, len(BACKOFF) - 1)]
            logger.warning(f"{last_err} — 第{attempt + 1}次重试，{wait:.1f}s 后退避")
            time.sleep(wait)
        except requests.exceptions.Timeout:
            last_err = f"{config['name']} 请求超时"
            if attempt >= MAX_RETRIES:
                return False, last_err, None
            wait = BACKOFF[min(attempt, len(BACKOFF) - 1)]
            logger.warning(f"{last_err} — 第{attempt + 1}次重试，{wait:.1f}s 后退避")
            time.sleep(wait)
        except Exception as e:
            return False, f"{config['name']} 异常: {str(e)[:100]}", None
    return False, last_err, None'''

if OLD not in s:
    print("ERR: _call_single 锚点未命中，可能代码已变更，放弃以免破坏文件")
    sys.exit(2)
s = s.replace(OLD, NEW, 1)

# call_ai 默认 timeout 45 -> 30（与 _call_single 对齐，限制单模型最坏耗时）
if "timeout: int = 45) -> Tuple[str, Dict]:" in s:
    s = s.replace("timeout: int = 45) -> Tuple[str, Dict]:", "timeout: int = 30) -> Tuple[str, Dict]:", 1)

# 故障恢复冷却 300 -> 120s（限流窗口过后更快自愈）
if "RECOVERY_COOLDOWN = 300" in s:
    s = s.replace("RECOVERY_COOLDOWN = 300", "RECOVERY_COOLDOWN = 120", 1)

if s == orig:
    print("NO CHANGES MADE")
    sys.exit(0)

open(P, "w", encoding="utf-8").write(s)
print("PATCHED OK: 重试退避 + 冷却120s + timeout30")
PYEOF

echo "=== [3] 语法校验 ==="
sudo -u ubuntu "$YNVA/.venv/bin/python3" -m py_compile "$MR" && echo "COMPILE_OK"

echo "=== [4] 重启服务 ==="
sudo systemctl restart yn-vocational-agent
sleep 3
echo "  active: $(systemctl is-active yn-vocational-agent)"

echo "=== [5] 验证 ==="
echo -n "  ai-models deepseek healthy: "
curl -s -k --resolve www.xlxzb.com:443:127.0.0.1 https://www.xlxzb.com/ynva/api/system/ai-models \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['deepseek']['healthy'], d['deepseek']['configured'])"
echo -n "  agent 真实调用: "
curl -s -m 60 -X POST http://127.0.0.1:8000/api/users/1/agent \
  -H 'Content-Type: application/json' \
  -d '{"message":"你好，请用一句话介绍你自己，以便我确认模型已联通"}' \
  | head -c 120; echo
echo "  (随后清理本次测试产生的对话残留)"

echo
echo "回滚： sudo cp $MR.bak.retry.$TS $MR && sudo systemctl restart yn-vocational-agent"
