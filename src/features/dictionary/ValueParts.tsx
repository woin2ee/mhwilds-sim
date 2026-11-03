import { Fragment, type ReactNode } from 'react'
import { ChevronIcon } from '../../components/ui'
import type { TermFact } from '../../core/gameTerms'
import { valueColumns, type SkillValues, type ValueRow } from '../../core/skillValues'
import { WEAPON_KIND_LABEL } from '../../data/labels'
import { WEAPON_KINDS, type Skill } from '../../data/types'
import { cx } from '../../lib/cx'
import { isBonusSkill } from './skillLookup'

/**
 * 눌러서 펼치는 한 줄 (처음엔 접혀 있다). 스킬 상세의 '상세 설명'·용어처럼 궁금할 때만 여는 내용에 쓴다.
 * 접고 편 상태는 기억하지 않아서 다른 항목을 열면 다시 접혀 있다
 */
export function Disclosure({ title, aside, children }: { title: ReactNode; aside?: ReactNode; children: ReactNode }) {
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm hover:bg-surface-2 pointer-coarse:py-2.5 [&::-webkit-details-marker]:hidden">
        <ChevronIcon className="size-3.5 shrink-0 -rotate-90 text-muted transition-transform group-open:rotate-0" />
        <span className="min-w-0 flex-1 font-medium">{title}</span>
        {aside && <span className="shrink-0 text-xs text-muted">{aside}</span>}
      </summary>
      <div className="border-t border-line px-3 py-3">{children}</div>
    </details>
  )
}

/** 값 칸: 그 레벨에 없는 값은 줄표 */
function Cells({ values, columns }: { values: readonly string[]; columns: number }) {
  return (
    <>
      {Array.from({ length: columns }, (_, i) => (
        <td
          key={i}
          className="px-1 py-1.5 text-right align-baseline text-[13px] font-semibold break-keep tabular-nums sm:px-2 sm:text-sm"
        >
          {values[i] || <span className="font-normal text-muted">—</span>}
        </td>
      ))}
    </>
  )
}

/** 무기 종류에 따라 다른 줄: 이름 줄 아래에 무기 종류마다 한 줄, 나머지 무기 종류는 '그 밖' */
function WeaponRows({ row, columns }: { row: ValueRow; columns: number }) {
  const groups = row.weapons ?? []
  const rest = WEAPON_KINDS.some((kind) => !groups.some((g) => g.kinds.includes(kind)))
  const sub =
    'min-w-22 py-1.5 pr-1 pl-4 text-left align-baseline text-xs leading-snug font-normal break-keep wrap-anywhere text-muted sm:pr-2'
  return (
    <>
      <tr>
        <th scope="rowgroup" colSpan={columns + 1} className="px-2 pt-2 pb-0.5 text-left font-normal break-keep">
          {row.label}
        </th>
      </tr>
      {groups.map((group) => (
        <tr key={group.kinds.join()}>
          <th scope="row" className={sub}>
            {group.kinds.map((kind) => WEAPON_KIND_LABEL[kind]).join('·')}
          </th>
          <Cells values={group.values} columns={columns} />
        </tr>
      ))}
      {rest && (
        <tr>
          <th scope="row" className={sub}>
            그 밖
          </th>
          <Cells values={row.values} columns={columns} />
        </tr>
      )}
    </>
  )
}

/**
 * 스킬의 상세 설명: 레벨(시리즈·그룹 스킬은 단계)이 열인 수치 표 + 효과 시간·조건 + 출처마다 다른 점.
 * 무기 종류에 따라 다른 값은 그 줄 아래에 무기 종류마다 한 줄씩
 */
export function SkillValuesBody({ skill, values }: { skill: Skill; values: SkillValues }) {
  const rows = values.rows ?? []
  const columns = valueColumns(values)
  const bonus = isBonusSkill(skill)
  return (
    <>
      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-line">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-surface-2 text-xs">
                <th scope="col" className="px-2 py-1.5 text-left font-normal text-muted">
                  수치
                </th>
                {skill.ranks.slice(0, columns).map((rank) => (
                  <th
                    key={rank.level}
                    scope="col"
                    className="px-1 py-1.5 text-right font-semibold whitespace-nowrap text-accent tabular-nums sm:px-2"
                  >
                    {bonus ? `${rank.pieces}부위` : `Lv${rank.level}`}
                  </th>
                ))}
              </tr>
            </thead>
            {rows.map((row) => (
              <tbody key={row.label} className="border-b border-line last:border-b-0">
                {row.weapons ? (
                  <WeaponRows row={row} columns={columns} />
                ) : (
                  <tr>
                    <th
                      scope="row"
                      className="min-w-22 py-1.5 pr-1 pl-2 text-left align-baseline leading-snug font-normal break-keep wrap-anywhere sm:pr-2"
                    >
                      {row.label}
                    </th>
                    <Cells values={row.values} columns={columns} />
                  </tr>
                )}
              </tbody>
            ))}
          </table>
        </div>
      )}
      <ValueNotes notes={values.notes} caveats={values.caveats} className={cx(rows.length > 0 && 'mt-2')} />
    </>
  )
}

/** 레벨과 상관없는 수치(효과 시간·조건)와 출처마다 다른 점 */
export function ValueNotes({
  notes = [],
  caveats = [],
  className,
}: {
  notes?: readonly string[]
  caveats?: readonly string[]
  className?: string
}) {
  if (notes.length + caveats.length === 0) return null
  return (
    <ul className={cx('space-y-1 text-sm leading-snug', className)}>
      {notes.map((note) => (
        <li key={note} className="flex gap-1.5">
          <span aria-hidden className="text-muted">
            ·
          </span>
          <span>{note}</span>
        </li>
      ))}
      {caveats.map((caveat) => (
        <li key={caveat} className="flex gap-1.5 text-xs text-warn">
          <span aria-hidden>※</span>
          <span>{caveat}</span>
        </li>
      ))}
    </ul>
  )
}

/** 용어의 수치: 이름 | 값 두 칸 (좁은 화면은 위아래) */
export function TermFactList({ facts, className }: { facts: readonly TermFact[]; className?: string }) {
  return (
    <dl className={cx('grid gap-x-3 gap-y-1 text-sm leading-snug sm:grid-cols-[auto_minmax(0,1fr)]', className)}>
      {facts.map((fact) => (
        <Fragment key={fact.label}>
          <dt className="text-muted max-sm:text-xs">{fact.label}</dt>
          <dd className="max-sm:mb-1">{fact.value}</dd>
        </Fragment>
      ))}
    </dl>
  )
}
