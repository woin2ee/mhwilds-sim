// 헤더의 화면 테마 선택. 아이콘은 직접 그린 단순한 도형이다.
import type { ReactNode } from 'react'
import { useTheme } from '../lib/theme'
import { Segmented } from './ui'

const OPTIONS = [
  { value: 'system', label: '시스템 설정 따르기', icon: <SystemIcon /> },
  { value: 'light', label: '라이트 모드', icon: <SunIcon /> },
  { value: 'dark', label: '다크 모드', icon: <MoonIcon /> },
] as const

export function ThemeSelect({ className }: { className?: string }) {
  const [theme, setTheme] = useTheme()
  return (
    <Segmented
      size="sm"
      ariaLabel="화면 테마"
      value={theme}
      options={OPTIONS}
      onChange={setTheme}
      className={className}
    />
  )
}

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="size-3.5"
    >
      {children}
    </svg>
  )
}

function SystemIcon() {
  return (
    <Icon>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </Icon>
  )
}

function SunIcon() {
  return (
    <Icon>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </Icon>
  )
}

function MoonIcon() {
  return (
    <Icon>
      <path d="M10.9 4.1A8 8 0 1 0 19.9 13.1A6.5 6.5 0 0 1 10.9 4.1z" />
    </Icon>
  )
}
