#!/usr/bin/env bash
# ============================================================================
# 告警外发分发器 —— 把巡检异常推送到运维可感知的通道（补齐"最后一公里"）
# ----------------------------------------------------------------------------
# 背景(2026-10-09 事件)：探针 06:10 已抓到「网关 21 个服务全挂」，但告警只写进
#   /home/ubuntu/health-probe-alerts.log（本地文件、无人看）⇒ 故障空转 2 小时
#   直到人工发现。本脚本把同一条告警**外发**到群机器人/邮件，让故障第一时间触达。
#
# 设计要点：
#   * 配置驱动：读 $ALERT_CONF（默认 /home/ubuntu/.xlxzb-alert.conf，600）。
#     **未配置任何通道时静默退出(dormant)**，零副作用、不影响现有 cron。
#   * 多通道可并存：WECOM_WEBHOOK_URL / DINGTALK_WEBHOOK_URL / GENERIC_WEBHOOK_URL /
#     SMTP_* + MAIL_TO。配哪个发哪个。
#   * 发送失败只落日志，不阻断上游、不做重试风暴（每通道单次尝试 + 10s 超时）。
#   * JSON 由 python3 生成，避免手工转义踩坑（换行/引号/中文）。
#
# 用法：
#   notify-dispatch.sh "<标题>" [正文文件]      # 省略正文则从 stdin 读
# 退出码：恒 0（告警外发不得反过来影响巡检/业务）。
# ============================================================================
set -uo pipefail

CONF="${ALERT_CONF:-/home/ubuntu/.xlxzb-alert.conf}"
LOG="${ALERT_LOG:-/home/ubuntu/notify-dispatch.log}"
SUBJECT="${1:-xlxzb 告警}"

BODY=""
if [ -n "${2:-}" ] && [ -f "${2:-}" ]; then
  BODY=$(cat "$2")
else
  BODY=$(cat 2>/dev/null || true)
fi

# 读取配置（若存在）。600 权限，仅本机 ubuntu 可读。
# shellcheck disable=SC1090
[ -f "$CONF" ] && . "$CONF" 2>/dev/null || true
: "${WECOM_WEBHOOK_URL:=}"
: "${DINGTALK_WEBHOOK_URL:=}"
: "${GENERIC_WEBHOOK_URL:=}"
: "${SMTP_HOST:=}"
: "${SMTP_PORT:=465}"
: "${SMTP_USER:=}"
: "${SMTP_PASS:=}"
: "${SMTP_FROM:=}"
: "${MAIL_TO:=}"
: "${ALERT_SUBJECT_PREFIX:=}"

HOSTN=$(hostname)
TS=$(date '+%F %T')
log() { printf '[%s] %s\n' "$(date '+%F %T')" "$*" >> "$LOG"; }

# 文本正文：标题 + 主机 + 时间 + 详情
TXT="${ALERT_SUBJECT_PREFIX}[$SUBJECT] $HOSTN @ $TS
$BODY"

sent=0

# ---------------------------------------------------------------------------
_post() { # url payload -> http_code
  curl -sS -m 10 -H 'Content-Type: application/json' -X POST -d "$2" "$1" -o /dev/null -w '%{http_code}' 2>/dev/null
}

# 1) 企业微信群机器人
if [ -n "$WECOM_WEBHOOK_URL" ]; then
  payload=$(printf '%s' "$TXT" | python3 -c 'import json,sys; print(json.dumps({"msgtype":"text","text":{"content":sys.stdin.read()}}))' 2>/dev/null)
  code=$(_post "$WECOM_WEBHOOK_URL" "$payload")
  case "$code" in 200) log "wecom ok"; sent=$((sent+1));; *) log "wecom FAIL http=$code";; esac
fi

# 2) 钉钉群机器人
if [ -n "$DINGTALK_WEBHOOK_URL" ]; then
  payload=$(printf '%s' "$TXT" | python3 -c 'import json,sys; print(json.dumps({"msgtype":"text","text":{"content":sys.stdin.read()}}))' 2>/dev/null)
  code=$(_post "$DINGTALK_WEBHOOK_URL" "$payload")
  case "$code" in 200) log "dingtalk ok"; sent=$((sent+1));; *) log "dingtalk FAIL http=$code";; esac
fi

# 3) 通用 webhook（自建/其他平台）
if [ -n "$GENERIC_WEBHOOK_URL" ]; then
  payload=$(SUBJECT="$SUBJECT" BODY="$BODY" HOSTN="$HOSTN" TS="$TS" python3 -c \
    'import json,os; print(json.dumps({"title":os.environ["SUBJECT"],"body":os.environ["BODY"],"host":os.environ["HOSTN"],"ts":os.environ["TS"]}))' 2>/dev/null)
  code=$(_post "$GENERIC_WEBHOOK_URL" "$payload")
  case "$code" in 200|201|202|204) log "generic ok http=$code"; sent=$((sent+1));; *) log "generic FAIL http=$code";; esac
fi

# 4) 邮件（python3 smtplib + SSL）
if [ -n "$SMTP_HOST" ] && [ -n "$MAIL_TO" ] && [ -n "$SMTP_USER" ]; then
  SMTP_HOST="$SMTP_HOST" SMTP_PORT="$SMTP_PORT" SMTP_USER="$SMTP_USER" SMTP_PASS="$SMTP_PASS" \
  SMTP_FROM="${SMTP_FROM:-$SMTP_USER}" MAIL_TO="$MAIL_TO" SUBJ="[xlxzb]$SUBJECT" TXT="$TXT" \
  python3 - <<'PY' 2>>"$LOG" && { log "smtp ok"; sent=$((sent+1)); } || log "smtp FAIL"
import os, ssl, smtplib
from email.mime.text import MIMEText
host=os.environ["SMTP_HOST"]; port=int(os.environ["SMTP_PORT"])
user=os.environ["SMTP_USER"]; pw=os.environ["SMTP_PASS"]
frm=os.environ["SMTP_FROM"]; to=os.environ["MAIL_TO"].split(",")
msg=MIMEText(os.environ["TXT"], "plain", "utf-8")
msg["Subject"]=os.environ["SUBJ"]; msg["From"]=frm; msg["To"]=",".join(to)
ctx=ssl.create_default_context()
with (smtplib.SMTP_SSL(host,port,context=ctx,timeout=10) if port==465 else smtplib.SMTP(host,port,timeout=10)) as s:
    if port!=465: s.starttls(context=ctx)
    s.login(user,pw); s.sendmail(frm,to,msg.as_string())
PY
fi

# 未配置任何通道：静默（dormant），但记一行便于确认脚本被调用过
if [ "$sent" -eq 0 ] && [ -z "$WECOM_WEBHOOK_URL$DINGTALK_WEBHOOK_URL$GENERIC_WEBHOOK_URL$SMTP_HOST" ]; then
  log "dormant: 无通道配置，仅记录(未外发)"
fi
exit 0
