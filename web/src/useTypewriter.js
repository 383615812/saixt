import { ref } from 'vue'

export function useTypewriter(speed = 22, chunk = 2) {
  const text = ref('')
  const typing = ref(false)
  let timer = null

  function type(full) {
    stop()
    text.value = ''
    typing.value = true
    let i = 0
    timer = setInterval(() => {
      i += chunk
      text.value = full.slice(0, i)
      if (i >= full.length) {
        clearInterval(timer)
        timer = null
        typing.value = false
      }
    }, speed)
  }

  function stop() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
    typing.value = false
  }

  return { text, typing, type, stop }
}
