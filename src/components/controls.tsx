// 수동 세팅·내 호석 화면에서 함께 쓰는 작은 입력 요소
import type { ReactNode, SelectHTMLAttributes } from 'react'
import { cx } from '../lib/cx'

export function SelectBox({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <select
      className={cx(
        'h-9 rounded-md border border-line bg-surface-2 px-2 text-sm text-fg focus:border-accent focus:outline-none pointer-coarse:h-10',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  )
}

/** 슬롯 레벨 선택 (allowEmpty 면 0 = 없음 포함) */
export function SlotLevelSelect({
  value,
  onChange,
  allowEmpty = false,
  ariaLabel,
  className,
}: {
  value: number
  onChange: (level: number) => void
  allowEmpty?: boolean
  ariaLabel: string
  className?: string
}) {
  return (
    <SelectBox
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className={cx('w-20', className)}
    >
      {allowEmpty && <option value={0}>없음</option>}
      {[1, 2, 3].map((level) => (
        <option key={level} value={level}>
          Lv{level}
        </option>
      ))}
    </SelectBox>
  )
}

/** 스킬 레벨 막대 */
export function LevelPips({ level, max }: { level: number; max: number }) {
  return (
    <span className="inline-flex gap-0.5" aria-hidden>
      {Array.from({ length: max }, (_, i) => (
        <span
          key={i}
          className={cx('h-2 w-2.5 rounded-[2px]', i < level ? 'bg-accent' : 'border border-line bg-surface-2')}
        />
      ))}
    </span>
  )
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between gap-2">
      <h3 className="text-xs font-semibold tracking-wide text-muted">{children}</h3>
      {aside && <span className="text-xs text-muted">{aside}</span>}
    </div>
  )
}
