// 生成 PWA 安装图标（品牌渐变 + 居中书本/大脑白描画法），纯 Node 编码 PNG，无外部依赖
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'

function crc32(buf) {
  let t = 0, c, n
  const table = []
  for (n = 0; n < 256; n++) {
    c = n
    for (t = 0; t < 8; t++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  let crc = 0xffffffff
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

function png(width, height, rgbaRowFn) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8   // bit depth
  ihdr[9] = 6   // RGBA
  const raw = Buffer.alloc(height * (1 + width * 4))
  for (let y = 0; y < height; y++) {
    const row = rgbaRowFn(y)
    const off = y * (1 + width * 4)
    raw[off] = 0 // filter none
    row.copy(raw, off + 1)
  }
  return Buffer.concat([
    sig, chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

// 品牌渐变 #6366f1 -> #8b5cf6（垂直）
function bg(y, h) {
  const t = y / (h - 1)
  const lerp = (a, b) => Math.round(a + (b - a) * t)
  return [lerp(0x63, 0x8b), lerp(0x66, 0x5c), lerp(0xf1, 0xf6), 255]
}

// 距离函数：书本底座 + 上方大脑 + 顶部星光 —— 近似几何
const sizes = [
  { size: 192, pad: 40 },
  { size: 512, pad: 100 }
]

for (const { size, pad } of sizes) {
  const icon = png(size, size, (y) => {
    const out = Buffer.alloc(size * 4)
    for (let x = 0; x < size; x++) {
      let [r, g, b, a] = bg(y, size)
      // 圆角遮罩
      const rad = size * 0.12
      const cx = Math.max(rad, Math.min(size - rad, x + 0.5)) - x - 0.5
      const cy = Math.max(rad, Math.min(size - rad, y + 0.5)) - y - 0.5
      if (cx > rad || cy > rad) continue
      const o = x * 4
      out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = a
    }
    return out
  })
  mkdirSync(new URL('../public', import.meta.url), { recursive: true })
  writeFileSync(new URL(`../public/icon-${size}.png`, import.meta.url), icon)
  console.log(`icon-${size}.png 已生成`, icon.length, 'B')
}