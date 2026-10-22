// 화면 테마. 고른 값에 따라 <html data-theme="light|dark"> 를 붙이고, 색상은 index.css 의 토큰이 바꾼다.
// 첫 화면 깜빡임을 막으려고 index.html 의 인라인 스크립트가 같은 저장 키·규칙으로 먼저 적용하므로 바꿀 때는 함께 고친다.
import { useEffect } from 'react'
import { usePersistentState } from './storage'

/** system 은 운영체제(브라우저) 설정을 따른다 */
export type ThemePreference = 'system' | 'light' | 'dark'

const isThemePreference = (v: unknown): v is ThemePreference => v === 'system' || v === 'light' || v === 'dark'

/** 고른 테마와 변경 함수. system 이면 운영체제 설정이 바뀔 때도 바로 따라간다. */
export function useTheme() {
  const [preference, setPreference] = usePersistentState<ThemePreference>('theme:v1', 'system', isThemePreference)

  useEffect(() => {
    const root = document.documentElement
    if (preference !== 'system') {
      root.dataset.theme = preference
      return
    }
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      root.dataset.theme = query.matches ? 'dark' : 'light'
    }
    apply()
    query.addEventListener('change', apply)
    return () => query.removeEventListener('change', apply)
  }, [preference])

  return [preference, setPreference] as const
}
