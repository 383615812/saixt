/**
 * 图片加载错误处理 composable
 * 用法：
 *   import { useImgError } from './useImgError'
 *   const { onImgError } = useImgError()
 *   <img :src="..." @error="onImgError" />
 */
export function useImgError(mode = 'hide') {
  function onImgError(e) {
    const img = e.target
    if (!img || img.dataset.errorHandled) return
    img.dataset.errorHandled = '1'
    if (mode === 'hide') {
      img.style.display = 'none'
    } else if (mode === 'placeholder') {
      img.style.visibility = 'hidden'
      const wrap = img.parentElement
      if (wrap && !wrap.querySelector('.img-err-ph')) {
        const ph = document.createElement('div')
        ph.className = 'img-err-ph'
        ph.textContent = '图片加载失败'
        wrap.appendChild(ph)
      }
    }
  }
  return { onImgError }
}
