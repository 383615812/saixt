// 构建后：扫描 dist 静态资源，注入 sw.js 的 BUILT 预缓存清单
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const dist = join(import.meta.dirname, '..', 'dist')
const assetsDir = join(dist, 'assets')

// 用相对 ./assets 前缀：SW 部署于子路径（如 /saixt/sw.js）时解析到 /saixt/assets/，与页面实际请求一致；
// 根路径部署时同样正确（./assets → /assets）
const js = readdirSync(assetsDir).filter((f) => f.endsWith('.js')).map((f) => './assets/' + f)
const css = readdirSync(assetsDir).filter((f) => f.endsWith('.css')).map((f) => './assets/' + f)

const list = JSON.stringify([...js, ...css], null, 2)
const swPath = join(dist, 'sw.js')
let sw = readFileSync(swPath, 'utf-8')
sw = sw.replace(/const BUILT = \[\]/, `const BUILT = ${list}`)
writeFileSync(swPath, sw)
console.log('sw.js 已注入', js.length, '个 JS、', css.length, '个 CSS 到预缓存')