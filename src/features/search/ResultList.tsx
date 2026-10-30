import { useMemo, useState } from 'react'
import { SkillChip } from '../../components/SkillChip'
import { Button, EmptyState, Segmented } from '../../components/ui'
import { hr100ArmorIds } from '../../core/hunterRank'
import type { SearchRequest, SearchResponse, SearchResultItem, SearchSort } from '../../core/search/types'
import { nameOf, type GameDb } from '../../data/db'
import { useDb } from '../../state/context'
import { useToast } from '../../state/toast'
import { chipLevel, formatCount, shortfallLabel } from './format'
import { ResultCard, type CompareControl, type ExcludeControl } from './ResultCard'

const PAGE_SIZE = 30
const SORT_OPTIONS: { value: SearchSort; label: string }[] = [
  { value: 'slots', label: '남는 슬롯' },
  { value: 'defense', label: '방어력' },
]

function formatElapsed(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}초`
}

/** 목록에 보이는 결과. index 는 검색 결과 안의 순위(#N)라 앞의 카드를 숨겨도 그대로다 */
interface ShownItem {
  item: SearchResultItem
  index: number
}

function PagedCards({
  entries,
  request,
  exclude,
  compare,
  onHide,
}: {
  entries: ShownItem[]
  request: SearchRequest
  exclude: ExcludeControl
  compare: CompareControl
  onHide: (entry: ShownItem) => void
}) {
  const [shown, setShown] = useState(PAGE_SIZE)
  return (
    <div className="space-y-2.5">
      {entries.slice(0, shown).map((entry) => (
        <ResultCard
          key={entry.item.id}
          item={entry.item}
          request={request}
          index={entry.index}
          exclude={exclude}
          compare={compare}
          onHide={() => onHide(entry)}
        />
      ))}
      {entries.length > shown && (
        <Button className="w-full" onClick={() => setShown((n) => n + PAGE_SIZE)}>
          더 보기 ({formatCount(entries.length - shown)}건 남음)
        </Button>
      )}
    </div>
  )
}

/** 제외할 방어구로 직접 뺀 방어구가 있는지 (HR 100 장비 제외로만 빠진 것은 빼고) */
function hasOwnExcludedArmor(db: GameDb, request: SearchRequest): boolean {
  const hr100 = hr100ArmorIds(db)
  const excluded = new Set(request.excludedArmorIds)
  return hr100.every((id) => excluded.has(id)) ? excluded.size > hr100.length : excluded.size > 0
}

/** 결과가 없을 때 조건별로 해 볼 만한 것. lowering = '원하는 스킬을 낮추기'도 넣을지 (가까운 조합을 보여 줄 땐 뺀다) */
function emptyHints(db: GameDb, request: SearchRequest, hasWeaponSkill: boolean, lowering = true): string[] {
  const hints = lowering ? ['원하는 스킬의 레벨을 낮추거나 스킬 수를 줄여 보세요.'] : []
  // 고정한 스킬 때문에 가장 가까운 조합도 못 찾은 경우
  if (lowering && request.lockedSkills.length > 0 && request.maxShortfall > 0) {
    hints.unshift('원하는 스킬의 고정을 풀면 그 스킬도 낮춘 가장 가까운 조합을 찾아요.')
  }
  if (!request.useDecorations) hints.unshift('‘장식주 없이 찾기’를 끄면 모자란 스킬을 장식주로 채워요.')
  // 여유분은 원하는 스킬을 낮춰도 그대로 남기므로, 가까운 조합을 보여 줄 때도 넣는다
  if (request.spareSlots.length > 0) hints.push('장식주 여유분을 줄여 보세요.')
  // 내성 조건도 원하는 스킬을 낮출 때 그대로 둔다
  if (request.minResistances.length > 0) hints.push('내성 조건을 낮추거나 빼 보세요.')
  if (request.excludedSkills.length > 0 && request.excludeMode === 'exclude') {
    hints.push('비선호 스킬을 ‘표시만’으로 바꾸거나 줄여 보세요.')
  }
  if (hasOwnExcludedArmor(db, request)) hints.push('제외할 방어구를 줄여 보세요.')
  if (!request.includeLowRank) hints.push('‘하위 랭크 방어구 포함’을 켜 보세요.')
  // 초월·무기 슬롯은 장식주를 넣을 자리만 늘리므로 장식주 없이 찾을 때는 도움이 안 된다
  if (!request.transcend && request.useDecorations) hints.push('초월한 방어구가 있다면 ‘방어구 초월 적용’을 켜 보세요.')
  if (request.talismans.length === 0) hints.push('호석을 ‘자동’으로 바꿔 보세요.')
  if (hasWeaponSkill && request.weapon.slots.length === 0 && request.useDecorations) {
    hints.push('무기 스킬은 무기 슬롯이 있어야 장식주로 채울 수 있어요. 무기를 지정해 보세요.')
  }
  return hints
}

/** 결과 카드에서 모자란 원하는 스킬 칩의 모양 (첫 결과에서 처음 모자란 스킬, ResultCard 의 칩과 같게) */
function shortChipOf(db: GameDb, request: SearchRequest, item: SearchResultItem | undefined) {
  if (!item) return null
  for (const r of request.required) {
    const skill = db.skills.get(r.skillId)
    const level = item.skillLevels.find((s) => s.skillId === r.skillId)?.level ?? 0
    if (!skill || level >= r.level) continue
    const bonus = skill.kind === 'set' || skill.kind === 'group'
    return (
      <SkillChip
        name={nameOf(skill.name)}
        level={chipLevel(skill, level)}
        maxLevel={bonus ? undefined : skill.maxLevel}
        tone="missing"
      >
        <span className="font-semibold">{shortfallLabel(skill, level, r.level).mark}</span>
      </SkillChip>
    )
  }
  return null
}

/** 조건을 모두 채우는 조합이 없어 원하는 스킬이 가장 적게 모자란 조합을 보여 줄 때의 안내 */
function ShortfallNotice({
  request,
  response,
  hasWeaponSkill,
}: {
  request: SearchRequest
  response: SearchResponse
  hasWeaponSkill: boolean
}) {
  const db = useDb()
  const sample = shortChipOf(db, request, response.items[0])
  const hints = emptyHints(db, request, hasWeaponSkill, false)
  const amount = response.shortfall === 1 ? '1레벨' : `모두 합쳐 ${response.shortfall}레벨`
  const locked = request.lockedSkills.flatMap((id) => {
    const skill = db.skills.get(id)
    return skill ? [nameOf(skill.name)] : []
  })
  return (
    <div className="space-y-1.5 rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-xs">
      <p className="text-sm font-medium text-warn">조건을 모두 채우는 조합이 없어요.</p>
      <p>
        원하는 스킬이 {amount} 모자란, 가장 가까운 조합을 대신 보여 드려요.
        {sample && <> 모자란 스킬은 {sample} 처럼 표시돼요.</>}{' '}
        {locked.length > 0
          ? `고정한 스킬(${locked.join('·')})은 낮추지 않았어요.`
          : '낮추고 싶지 않은 스킬은 원하는 스킬 목록에서 자물쇠로 고정하세요.'}
      </p>
      {hints.length > 0 && (
        <ul className="space-y-0.5 text-muted">
          {hints.map((hint) => (
            <li key={hint}>· {hint}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function ResultList({
  request,
  response,
  onSortChange,
  exclude,
  compare,
}: {
  request: SearchRequest
  response: SearchResponse
  onSortChange: (sort: SearchSort) => void
  /** 추가 스킬 칩에서 비선호 스킬을 넣고 뺄 때 쓰는 지금 검색 조건 */
  exclude: ExcludeControl
  compare: CompareControl
}) {
  const db = useDb()
  const toast = useToast()
  const { items } = response
  const variantTotal = useMemo(() => items.reduce((n, item) => n + item.variantCount, 0), [items])
  // 숨긴 결과 id. 이 목록은 검색할 때마다 새로 그려지므로(SearchPage 의 key) 다시 검색하면 모두 다시 보인다
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set())
  const entries = useMemo(
    () => items.flatMap((item, i) => (hidden.has(item.id) ? [] : [{ item, index: i + 1 }])),
    [items, hidden],
  )
  const hide = ({ item, index }: ShownItem) => {
    setHidden((prev) => new Set(prev).add(item.id))
    toast(`#${index} 결과를 숨겼어요`, {
      label: '되돌리기',
      onClick: () =>
        setHidden((prev) => {
          const next = new Set(prev)
          next.delete(item.id)
          return next
        }),
    })
  }
  const hasWeaponSkill = request.required.some((r) => db.skills.get(r.skillId)?.kind === 'weapon')
  // 탐색 상한에 걸리면 전체 개수는 '최소' 개수다
  const atLeast = response.truncated ? ' 이상' : ''

  if (items.length === 0) {
    return (
      <EmptyState>
        <p className="mb-2 font-medium text-fg">조건을 만족하는 조합이 없어요.</p>
        <ul className="space-y-0.5 text-xs">
          {emptyHints(db, request, hasWeaponSkill).map((hint) => (
            <li key={hint}>· {hint}</li>
          ))}
        </ul>
      </EmptyState>
    )
  }

  return (
    <div className="space-y-3">
      {response.shortfall > 0 && <ShortfallNotice request={request} response={response} hasWeaponSkill={hasWeaponSkill} />}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm">
          <span className="font-semibold">결과 {formatCount(items.length)}건</span>
          {response.total > items.length && (
            <span className="text-muted">
              {' '}
              (전체 {formatCount(response.total)}건{atLeast} 중 상위)
            </span>
          )}
          <span className="ml-2 text-xs text-muted">
            {!request.useDecorations && '장식주 없이 · '}대체 방어구 포함 {formatCount(variantTotal)}개 조합 ·{' '}
            {formatElapsed(response.elapsedMs)}
          </span>
        </div>
        <Segmented size="sm" value={request.sort} options={SORT_OPTIONS} onChange={onSortChange} />
      </div>

      {hidden.size > 0 && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          <span>숨긴 결과 {formatCount(hidden.size)}건 · 다시 검색하면 다시 보여요.</span>
          <Button size="sm" onClick={() => setHidden(new Set())}>
            모두 다시 보기
          </Button>
        </div>
      )}

      {response.truncated && (
        <p className="rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
          조합이 너무 많아 일부만 탐색했어요. 유망한 조합부터 찾기 때문에 상위 결과는 대부분 좋은 조합이지만 놓친 조합이 있을
          수 있어요. 스킬을 추가하거나 레벨을 올리면 범위가 좁혀져요.
        </p>
      )}

      <PagedCards entries={entries} request={request} exclude={exclude} compare={compare} onHide={hide} />
    </div>
  )
}
