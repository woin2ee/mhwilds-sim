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
  onClick,
  expanded,
  children,
}: {
  name: string
  level?: number
  maxLevel?: number
  tone?: SkillTone
  title?: string
  onRemove?: () => void
  /** 주면 칩 전체가 버튼이 된다. 버튼 안에 버튼을 둘 수 없으므로 onRemove 와 함께 쓰지 않는다 */
  onClick?: () => void
  /** onClick 으로 여닫는 내용이 열려 있는지 (aria-expanded) */
  expanded?: boolean
  children?: ReactNode
}) {
  const className = cx(
    'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs whitespace-nowrap',
    // 지울 수 있는 칩은 터치 기기에서 누르기 쉽게 키운다 (칩 사이 간격은 쓰는 쪽에서 pointer-coarse:gap-2)
    onRemove && 'pointer-coarse:py-1 pointer-coarse:text-sm',
    // 누르는 칩은 누르지 않는 칩과 나란히 놓이므로 글자 크기는 그대로 두고 높이만 키운다. 열려 있으면 테두리를 진하게
    onClick &&
      'cursor-pointer hover:border-current aria-expanded:border-current aria-expanded:ring-1 aria-expanded:ring-current pointer-coarse:py-1.5',
    TONE[tone],
  )
  const content = (
    <>
      <span>{name}</span>
      {level !== undefined && (
        <span className="font-semibold tabular-nums">
          {level}
          {maxLevel !== undefined && <span className="font-normal opacity-60">/{maxLevel}</span>}
        </span>
      )}
      {children}
    </>
  )
  if (onClick) {
    return (
      <button type="button" title={title} aria-expanded={expanded} onClick={onClick} className={className}>
        {content}
      </button>
    )
  }
  return (
    <span title={title} className={className}>
      {content}
      {onRemove && (
        <button
          type="button"
          aria-label={`${name} 제거`}
          onClick={onRemove}
          // after: 로 보이는 크기는 그대로 두고 누르는 영역만 넓힌다
          className="relative -mr-0.5 opacity-60 after:absolute after:-inset-1.5 hover:opacity-100"
        >
          ×
        </button>
      )}
    </span>
  )
}
