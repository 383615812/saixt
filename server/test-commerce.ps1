$ErrorActionPreference = 'Stop'
$base = 'http://localhost:3000/api'

# 每次运行使用唯一手机号，保证可重复执行且互不干扰
$ts = (Get-Date -Format 'MMddHHmmss')
$phoneA = '139' + $ts.Substring(2)
$phoneB = '137' + $ts.Substring(2)
$phoneC = '136' + $ts.Substring(2)
$pass = '123456'

function Post($path, $body) {
  return Invoke-RestMethod -Uri ($base + $path) -Method Post -ContentType 'application/json' -Body ($body | ConvertTo-Json -Depth 6)
}
function Get($path, $token) {
  $h = @{ Authorization = "Bearer $token" }
  return Invoke-RestMethod -Uri ($base + $path) -Method Get -Headers $h
}
function PostAuth($path, $body, $token) {
  $h = @{ Authorization = "Bearer $token" }
  return Invoke-RestMethod -Uri ($base + $path) -Method Post -ContentType 'application/json' -Headers $h -Body ($body | ConvertTo-Json -Depth 6)
}

Write-Host "=== 1. 注册用户 A（邀请人）==="
$ra = Post '/auth/register' @{ phone = $phoneA; password = $pass; nickname = '邀请人A' }
$tokenA = $ra.data.token
Write-Host "A 注册成功"

Write-Host "`n=== 2. 获取 A 的邀请码 ==="
$ia = Get '/invite/me' $tokenA
$code = $ia.data.code
Write-Host "A 邀请码: $code"

Write-Host "`n=== 3. 注册用户 B（使用 A 的邀请码）==="
$rb = Post '/auth/register' @{ phone = $phoneB; password = $pass; nickname = '被邀请B'; invite_code = $code }
$tokenB = $rb.data.token
Write-Host "B 注册成功"

Write-Host "`n=== 4. 验证邀请奖励（A +50，B +20+20=40）==="
$pa = Get '/points/me' $tokenA
$pb = Get '/points/me' $tokenB
Write-Host "A 积分: $($pa.data.balance) (期望 50)"
Write-Host "B 积分: $($pb.data.balance) (期望 40 = 注册20 + 邀请码20)"
$ia2 = Get '/invite/me' $tokenA
Write-Host "A 邀请人数: $($ia2.data.count), 累计奖励: $($ia2.data.totalReward)"

Write-Host "`n=== 5. B 每日打卡 +10 ==="
$ck = PostAuth '/checkin' @{} $tokenB
Write-Host "打卡奖励: $($ck.data.reward), B 当前积分: $((Get '/points/me' $tokenB).data.balance)"

Write-Host "`n=== 6. 注册用户 C（使用 B 的邀请码，B 获 +50）==="
$ib = Get '/invite/me' $tokenB
$codeB = $ib.data.code
Write-Host "B 邀请码: $codeB"
$rc = Post '/auth/register' @{ phone = $phoneC; password = $pass; nickname = '被邀请C'; invite_code = $codeB }
$tokenC = $rc.data.token
$pb2 = Get '/points/me' $tokenB
Write-Host "B 当前积分: $($pb2.data.balance) (期望 100 = 40 + 10打卡 + 50邀请)"
$pc = Get '/points/me' $tokenC
Write-Host "C 积分: $($pc.data.balance) (期望 40)"

Write-Host "`n=== 7. B 用积分兑换 AI 次数包（AI 答疑 5 次，100 积分）==="
$ex = PostAuth '/points/exchange' @{ product = 'ai_chat_5' } $tokenB
Write-Host "兑换结果: $($ex.data.message), 剩余积分: $($ex.data.balance)"

Write-Host "`n=== 8. B 查询 AI 配额（应含兑换次数包）==="
$q = Get '/ai/quota' $tokenB
Write-Host "vip=$($q.data.vip) chat剩余=$($q.data.quota.chat.left) (免费10+兑换5=15) topup=$($q.data.quota.chat.topup)"

Write-Host "`n=== 9. B 创建 VIP 订单并支付 ==="
$order = PostAuth '/membership/order' @{ product_code = 'vip_month' } $tokenB
$orderNo = $order.data.order_no
Write-Host "订单号: $orderNo, 金额: ¥$($order.data.product.price)"
$pay = PostAuth "/membership/pay/notify/wechat" @{ order_no = $orderNo } $tokenB
Write-Host "支付回调: $($pay.message)"

Write-Host "`n=== 10. 验证 B 会员状态与订单 ==="
$me = Get '/membership/me' $tokenB
Write-Host "VIP=$($me.data.vip), 到期=$($me.data.membership.expire_at)"
$orders = Get '/membership/orders' $tokenB
Write-Host "订单数: $($orders.data.Count), 第一笔状态: $($orders.data[0].status)"

Write-Host "`n=== 11. B 成为 VIP 后 AI 配额应无限 ==="
$q2 = Get '/ai/quota' $tokenB
Write-Host "vip=$($q2.data.vip) chat unlimited=$($q2.data.quota.chat.unlimited)"

Write-Host "`n=== 12. 订单状态查询接口 ==="
$os = Get "/membership/order/$orderNo" $tokenB
Write-Host "订单状态: $($os.data.status), 支付方式: $($os.data.pay_method)"

Write-Host "`n=== 13. 管理员接口（未配置 ADMIN_PHONES 应返回 403）==="
try {
  $null = Get '/admin/overview' $tokenA
  Write-Host "管理员接口: 意外成功"
} catch {
  Write-Host "管理员接口: $($_.Exception.Response.StatusCode.value__) - 符合预期（未配置管理员）"
}

Write-Host "`n=== 14. 重复使用邀请码（B 已绑定，应报错）==="
try {
  $null = PostAuth '/invite/redeem' @{ code = $code } $tokenB
  Write-Host "重复绑定: 意外成功"
} catch {
  Write-Host "重复绑定: $($_.Exception.Response.StatusCode.value__) - 符合预期"
}

Write-Host "`n=== 15. 积分不足兑换（C 仅 40 积分，兑换 360 积分商品应报错）==="
try {
  $null = PostAuth '/points/exchange' @{ product = 'ai_chat_20' } $tokenC
  Write-Host "积分不足兑换: 意外成功"
} catch {
  Write-Host "积分不足兑换: $($_.Exception.Response.StatusCode.value__) - 符合预期"
}

Write-Host "`n=== 全部测试完成 ==="
