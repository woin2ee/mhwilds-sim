import type { ReactNode } from 'react'
import { cx } from '../lib/cx'

/**
 * required: 원하는 스킬 (충족) / missing: 원하는 스킬 (미달) / unwanted: 비선호 스킬
 * bonus: 시리즈·그룹 스킬 / extra: 그 외 추가 스킬 / neutral: 기본
 */
export type SkillTone = 'required' | 'missing' | 'unwanted' | 'bonus' | 'extra' | 'neutral'

const TONE: Record<SkillTone, string> = {
  required: 'border-good/50 bg-good/10 text-good',
  missing: 'border-warn/50 bg-warn/10 text-warn',
  unwanted: 'border-bad/50 bg-bad/10 text-bad',
  bonus: 'border-accent/50 bg-accent/10 text-accent',
  extra: 'border-line bg-surface-2 text-muted',
  neutral: 'border-line bg-surface-2 text-fg',
}

export function SkillChip({
  name,
  level,
  maxLevel,
  tone = 'neutral',
  title,
  onRemove,
  children,
}: {
  name: string
  level?: number
  maxLevel?: number
  tone?: SkillTone
  title?: string
  onRemove?: () => void
  children?: ReactNode
}) {
  return (
    <span
      title={title}
      className={cx('inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs whitespace-nowrap', TONE[tone])}
    >
      <span>{name}</span>
      {level !== undefined && (
        <span className="font-semibold tabular-nums">
          {level}
          {maxLevel !== undefined && <span className="font-normal opacity-60">/{maxLevel}</span>}
        </span>
      )}
      {children}
      {onRemove && (
        <button type="button" aria-label={`${name} 제거`} onClick={onRemove} className="-mr-0.5 opacity-60 hover:opacity-100">
          ×
        </button>
      )}
    </span>
  )
}
