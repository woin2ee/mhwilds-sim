import { Fragment, useMemo, type ReactNode } from 'react'
import { Dialog } from '../../components/Dialog'
import { LevelPips } from '../../components/controls'
import { SlotBadge, SlotList } from '../../components/SlotBadge'
import { Badge, Button, Toggle } from '../../components/ui'
import { computeBuild, unwantedSkillsOf, type BuildSummary, type SlotUsage } from '../../core/calc'
import type { CustomTalisman, EquipKey, Slot } from '../../core/types'
import { nameOf, type GameDb } from '../../data/db'
import { signed, skillName, skillPointsText, skillTooltip, talismanName } from '../../data/format'
import { ARMOR_KIND_LABEL, ELEMENT_LABEL, SLOT_KIND_LABEL } from '../../data/labels'
import { ARMOR_KINDS, ELEMENTS, type Skill } from '../../data/types'
import { cx } from '../../lib/cx'
import { usePersistentState } from '../../lib/storage'
import { useAppState } from '../../state/context'
import {
  allSame,
  COMPARE_MAX,
  decorationRows,
  equipmentKey,
  skillRows,
  type CompareColumn,
  type CompareItem,
  type SkillCell,
  type SkillRowGroup,
} from './compareRows'

// 칸 수(1 ~ COMPARE_MAX)별 클래스. Tailwind 가 찾을 수 있게 클래스 이름을 통째로 적는다.
/** sm 이상은 왼쪽에 행 이름 칸을 두고, 휴대폰은 행 이름을 값 위 한 줄에 따로 둔다 */
const GRID: Record<number, string> = {
  1: 'grid-cols-1 sm:grid-cols-[7rem_minmax(0,1fr)]',
  2: 'grid-cols-2 sm:grid-cols-[7rem_repeat(2,minmax(0,1fr))]',
  3: 'grid-cols-3 sm:grid-cols-[7rem_repeat(3,minmax(0,1fr))]',
}
/** 대화상자 폭 (휴대폰은 화면 아래 시트라 꽉 찬다) */
const WIDTH: Record<number, string | undefined> = {
  2: 'sm:w-[min(48rem,calc(100vw-2rem))]',
  3: 'sm:w-[min(64rem,calc(100vw-2rem))]',
}

interface Column {
  item: CompareItem
  summary: BuildSummary
}

interface RowModel {
  key: string
  label: ReactNode
  /** 행 이름 툴팁 */
  title?: string
  cells: ReactNode[]
  /** 모든 칸이 같은 행: 흐리게 두고 '다른 점만 보기'면 숨긴다 */
  same: boolean
}

interface SectionModel {
  title: string
  rows: RowModel[]
}

const isBoolean = (v: unknown): v is boolean => typeof v === 'boolean'

/**
 * 세팅 비교: 고른 세팅을 칸으로 나란히 놓고 요약·부위별 장비·장식주·스킬·내성을 행으로 맞춰 보여 준다.
 * 스킬 검색 결과와 내 세팅이 함께 쓴다. renderActions 는 칸 맨 아래 버튼 (수동 세팅에서 열기 등).
 */
export function CompareDialog({
  open,
  onClose,
  title,
  items,
  onRemove,
  onClear,
  renderActions,
}: {
  open: boolean
  onClose: () => void
  title: string
  items: readonly CompareItem[]
  onRemove: (key: string) => void
  onClear: () => void
  renderActions?: (item: CompareItem) => ReactNode
}) {
  const [diffOnly, setDiffOnly] = usePersistentState('compare-diff-only:v1', false, isBoolean)
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`${title} (${items.length}/${COMPARE_MAX})`}
      className={WIDTH[items.length]}
      footer={
        <>
          <div className="mr-auto self-center">
            <Toggle checked={diffOnly} onChange={setDiffOnly} label="다른 점만 보기" />
          </div>
          <Button variant="ghost" onClick={onClear}>
            모두 빼기
          </Button>
        </>
      }
    >
      <CompareTable items={items} diffOnly={diffOnly} onRemove={onRemove} renderActions={renderActions} />
    </Dialog>
  )
}

function CompareTable({
  items,
  diffOnly,
  onRemove,
  renderActions,
}: {
  items: readonly CompareItem[]
  diffOnly: boolean
  onRemove: (key: string) => void
  renderActions?: (item: CompareItem) => ReactNode
}) {
  const { db, customTalismans } = useAppState()
  const columns = useMemo(
    () => items.map((item): Column => ({ item, summary: computeBuild(db, item.build, customTalismans) })),
    [db, items, customTalismans],
  )
  const sections = useMemo(() => compareSections(db, columns, customTalismans), [db, columns, customTalismans])
  const count = columns.length

  return (
    <div>
      {/* 스크롤해도 어느 칸이 어느 세팅인지 보이게 위에 붙인다. 대화상자 본문의 p-4 를 음수 여백으로 덮고,
          sticky 는 스크롤 영역의 안쪽 여백 안에서 붙으므로 -top-4 로 본문 맨 위에 맞춘다 */}
      <div className="sticky -top-4 z-10 -mx-4 -mt-4 border-b border-line bg-surface px-4 pt-3 pb-2">
        <div className={cx('grid gap-x-3', GRID[count])}>
          <div className="max-sm:hidden" />
          {columns.map(({ item }) => (
            <ColumnHeader key={item.key} item={item} onRemove={() => onRemove(item.key)} />
          ))}
        </div>
      </div>

      {count === 1 && (
        <p className="mt-3 rounded-md border border-line bg-surface-2 px-3 py-2 text-xs text-muted">
          ‘비교’를 눌러 하나 더 고르면 나란히 비교해요 (최대 {COMPARE_MAX}개).
        </p>
      )}

      {sections.map((section) => {
        const rows = diffOnly ? section.rows.filter((row) => !row.same) : section.rows
        return (
          <section key={section.title} className="mt-4">
            <h3 className="mb-1 text-xs font-semibold tracking-wide text-muted">{section.title}</h3>
            {rows.length > 0 ? (
              rows.map((row) => <CompareRow key={row.key} row={row} count={count} />)
            ) : (
              <p className="border-t border-line py-1.5 text-xs text-muted">모두 같아요.</p>
            )}
          </section>
        )
      })}
      {renderActions && (
        <div className="mt-4">
          <CompareRow
            row={{
              key: 'actions',
              label: null,
              same: false,
              cells: columns.map(({ item }) => <Fragment key={item.key}>{renderActions(item)}</Fragment>),
            }}
            count={count}
          />
        </div>
      )}
    </div>
  )
}

function ColumnHeader({ item, onRemove }: { item: CompareItem; onRemove: () => void }) {
  return (
    <div className="flex min-w-0 items-center gap-1">
      <div className="min-w-0 flex-1">
        {/* 내 세팅 이름은 길 수 있어 두 줄까지 */}
        <p className="line-clamp-2 text-sm font-semibold break-keep wrap-anywhere" title={item.title}>
          {item.title}
        </p>
        {item.badges && item.badges.length > 0 && (
          <div className="mt-0.5 flex flex-wrap gap-1">
            {item.badges.map((badge) => (
              <Badge key={badge}>{badge}</Badge>
            ))}
          </div>
        )}
      </div>
      <button
        type="button"
        aria-label={`${item.title} 비교에서 빼기`}
        title="비교에서 빼기"
        onClick={onRemove}
        className="inline-flex size-7 shrink-0 items-center justify-center rounded text-base leading-none text-muted hover:bg-surface-2 hover:text-fg pointer-coarse:size-9"
      >
        ×
      </button>
    </div>
  )
}

function CompareRow({ row, count }: { row: RowModel; count: number }) {
  return (
    <div className={cx('grid items-start gap-x-3 gap-y-0.5 border-t border-line py-1.5', GRID[count])}>
      {row.label === null ? (
        <div className="max-sm:hidden" />
      ) : (
        <div
          title={row.title}
          className={cx(
            'col-span-full min-w-0 text-xs break-keep sm:col-span-1 sm:pt-0.5',
            row.same ? 'text-muted' : 'font-medium text-fg',
          )}
        >
          {row.label}
        </div>
      )}
      {row.cells.map((cell, i) => (
        <div key={i} className={cx('min-w-0 text-sm', row.same && 'text-muted')}>
          {cell}
        </div>
      ))}
    </div>
  )
}

const Dash = () => <span className="text-muted">—</span>

/** 무기 슬롯 먼저·레벨 높은 순으로 같은지 비교하는 키 */
const slotsKey = (slots: readonly Slot[]) =>
  slots
    .map((s) => `${s.kind === 'weapon' ? 0 : 1}${4 - s.level}`)
    .sort()
    .join(',')

const toCompareColumn = ({ item, summary }: Column): CompareColumn => ({
  summary,
  required: item.required ?? [],
  excludedSkills: item.excludedSkills ?? [],
})

function compareSections(
  db: GameDb,
  columns: readonly Column[],
  customTalismans: readonly CustomTalisman[],
): SectionModel[] {
  const summaries = columns.map((c) => c.summary)
  const sections: SectionModel[] = []

  const defense = summaries.map((s) => s.defense.max)
  const defenseSame = allSame(defense)
  const bestDefense = Math.max(...defense)
  sections.push({
    title: '요약',
    rows: [
      {
        key: 'defense',
        label: '방어력',
        same: defenseSame,
        cells: defense.map((value, i) => (
          <span key={i} className="tabular-nums">
            <span className={cx('font-semibold', !defenseSame && value === bestDefense && 'text-good')}>{value}</span>
            {!defenseSame && value < bestDefense && (
              <span className="ml-1 text-xs text-muted">−{bestDefense - value}</span>
            )}
          </span>
        )),
      },
      {
        key: 'free-slots',
        label: '남는 슬롯',
        same: allSame(summaries.map((s) => slotsKey(s.freeSlots))),
        cells: summaries.map((s, i) => <SlotList key={i} slots={s.freeSlots} size="sm" empty="없음" sorted />),
      },
    ],
  })

  const equipKeys: EquipKey[] = [
    ...(summaries.some((s) => s.equipment.weapon) ? (['weapon'] as const) : []),
    ...ARMOR_KINDS,
    'talisman',
  ]
  sections.push({
    title: '장비',
    rows: equipKeys.map((key) => ({
      key: `equip-${key}`,
      label: key === 'weapon' ? '무기' : key === 'talisman' ? '호석' : ARMOR_KIND_LABEL[key],
      same: allSame(columns.map((c) => equipmentKey(c.item.build, c.summary, key))),
      cells: columns.map((c) => (
        <EquipCell key={c.item.key} db={db} column={c} equipKey={key} customTalismans={customTalismans} />
      )),
    })),
  })

  const decorations = decorationRows(db, columns.map(toCompareColumn))
  if (decorations.length > 0) {
    sections.push({
      title: '장식주',
      rows: decorations.map((row) => {
        const deco = db.decorations.get(row.decorationId)!
        return {
          key: `deco-${row.decorationId}`,
          label: (
            <span className="inline-flex items-center gap-1">
              <SlotBadge slot={{ kind: deco.kind, level: deco.size }} size="sm" filled />
              <span className="min-w-0">{nameOf(deco.name)}</span>
            </span>
          ),
          title: skillPointsText(db, deco.skills),
          same: allSame(row.counts),
          cells: row.counts.map((n, c) =>
            n > 0 ? (
              <span key={c} className={cx('tabular-nums', row.unwanted[c] && 'text-bad')}>
                ×{n}
              </span>
            ) : (
              <Dash key={c} />
            ),
          ),
        }
      }),
    })
  }

  // 원하는 스킬이 없는 비교(내 세팅)는 나머지가 '추가'가 아니라 그냥 발동 스킬이다
  const hasRequired = columns.some((c) => (c.item.required?.length ?? 0) > 0)
  const groupTitle: Record<SkillRowGroup, string> = {
    required: '원하는 스킬',
    unwanted: '비선호 스킬',
    bonus: '시리즈 · 그룹 스킬',
    extra: hasRequired ? '추가 스킬' : '발동 스킬',
  }
  const skills = skillRows(db, columns.map(toCompareColumn))
  for (const group of Object.keys(groupTitle) as SkillRowGroup[]) {
    const rows = skills.filter((row) => row.group === group)
    if (rows.length === 0) continue
    sections.push({
      title: groupTitle[group],
      rows: rows.map((row) => {
        const skill = db.skill(row.skillId)
        const same = allSame(row.cells.map((c) => `${c.level}:${c.pieces}`))
        return {
          key: `skill-${row.skillId}`,
          label: nameOf(skill.name),
          title: skill.description,
          same,
          cells: row.cells.map((cell, i) => <SkillLevel key={i} skill={skill} cell={cell} same={same} />),
        }
      }),
    })
  }

  sections.push({
    title: '내성',
    rows: ELEMENTS.map((element) => {
      const values = summaries.map((s) => s.resistances[element])
      const same = allSame(values)
      return {
        key: `resist-${element}`,
        label: `${ELEMENT_LABEL[element]} 내성`,
        same,
        cells: values.map((value, i) => (
          <span
            key={i}
            className={cx('tabular-nums', !same && value > 0 && 'text-good', !same && value < 0 && 'text-bad')}
          >
            {signed(value)}
          </span>
        )),
      }
    }),
  })
  return sections
}

function slotTitle(db: GameDb, usage: SlotUsage): string {
  const deco = usage.decorationId !== null ? db.decorations.get(usage.decorationId) : undefined
  return `${SLOT_KIND_LABEL[usage.slot.kind]} 슬롯 Lv${usage.slot.level} · ${deco ? nameOf(deco.name) : '비어 있음'}`
}

/** 부위 칸: 장비 이름·레어도, 슬롯(장식주가 들었으면 채움, 툴팁에 장식주 이름), 장비 자체 스킬(비선호는 빨강) */
function EquipCell({
  db,
  column,
  equipKey,
  customTalismans,
}: {
  db: GameDb
  column: Column
  equipKey: EquipKey
  customTalismans: readonly CustomTalisman[]
}) {
  const { item, summary } = column
  const equipment = summary.equipment[equipKey]
  if (!equipment) return <span className="text-muted">{equipKey === 'talisman' ? '없음' : '미장착'}</span>
  const choice = equipKey === 'weapon' || equipKey === 'talisman' ? null : item.build.armor[equipKey]
  const piece = choice ? db.armor.get(choice.id) : undefined
  const name = piece
    ? nameOf(piece.name)
    : equipKey === 'talisman'
      ? talismanName(db, item.build.talisman, customTalismans)
      : equipment.name
  const slots = summary.slots.filter((s) => s.key === equipKey)
  // 무기 자체 스킬은 비선호로 세지 않는다 (unwantedSkillsOf)
  const unwanted = new Set(equipKey === 'weapon' ? [] : unwantedSkillsOf(summary, item.excludedSkills ?? []))
  // 거극 아티어 무기에 붙은 시리즈·그룹 스킬 (같은 무기라도 붙은 스킬이 다르면 다른 장비로 비교한다)
  const bonusSkills = equipKey === 'weapon' ? equipment.bonusSkillIds : []
  return (
    <div className="space-y-0.5">
      <p className="break-keep">
        {name}
        {piece && <span className="ml-1 text-[11px] text-muted">R{piece.rarity}</span>}
        {equipKey === 'talisman' && item.build.talisman?.type === 'inline' && (
          <span className="ml-1 text-[11px] text-muted">세팅 전용</span>
        )}
      </p>
      {slots.length > 0 && (
        <span className="flex flex-wrap gap-0.5">
          {slots.map((s) => (
            <SlotBadge key={s.index} slot={s.slot} size="sm" filled={s.decorationId !== null} title={slotTitle(db, s)} />
          ))}
        </span>
      )}
      {equipment.skills.length > 0 && (
        <p className="text-xs text-muted">
          {equipment.skills.map((p, i) => (
            <Fragment key={p.skillId}>
              {i > 0 && ' · '}
              <span className={cx(unwanted.has(p.skillId) && 'text-bad')}>
                {skillName(db, p.skillId)} {p.level}
              </span>
            </Fragment>
          ))}
        </p>
      )}
      {bonusSkills.length > 0 && (
        <p className="text-xs text-accent">{bonusSkills.map((id) => skillName(db, id)).join(' · ')}</p>
      )}
    </div>
  )
}

/** 스킬 칸: 레벨/최대(+ 막대), 시리즈·그룹 스킬은 발동 단계 이름과 부위 수 */
function SkillLevel({ skill, cell, same }: { skill: Skill; cell: SkillCell; same: boolean }) {
  if (cell.level === 0) return <Dash />
  // 모두 같은 행은 흐리게 두되 비선호는 계속 빨강으로
  const tone = cell.unwanted
    ? 'text-bad'
    : !same && cell.required !== null && (cell.level >= cell.required ? 'text-good' : 'text-warn')
  if (skill.kind === 'set' || skill.kind === 'group') {
    const rank = skill.ranks.find((r) => r.level === cell.level)
    return (
      <span className={cx('text-xs', tone)} title={rank?.description}>
        {rank?.name ? nameOf(rank.name) : `${cell.level}단계`}
        <span className="text-muted"> · {cell.pieces}부위</span>
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5" title={skillTooltip(skill, cell.level)}>
      <span className={cx('tabular-nums', tone)}>
        <span className="font-semibold">{cell.level}</span>
        <span className="opacity-60">/{skill.maxLevel}</span>
      </span>
      <span className="max-sm:hidden">
        <LevelPips level={cell.level} max={skill.maxLevel} />
      </span>
    </span>
  )
}
