import { useMemo, useState } from 'react'
import { SkillChip, type SkillTone } from '../../components/SkillChip'
import { SlotBadge, SlotList } from '../../components/SlotBadge'
import { Badge, Button } from '../../components/ui'
import { activeSkillLevels, computeBuild, unwantedSkillsOf, type BuildSummary } from '../../core/calc'
import { resolveTalisman } from '../../core/equipment'
import { suggestName } from '../../core/savedBuilds'
import { resultToBuild } from '../../core/search/toBuild'
import type { SearchRequest, SearchResultItem } from '../../core/search/types'
import { armorDefense, armorSlots, canTranscend } from '../../core/transcend'
import type { EquipKey } from '../../core/types'
import { nameOf, type GameDb } from '../../data/db'
import { skillName, skillPointsText, talismanName } from '../../data/format'
import { ARMOR_KIND_LABEL } from '../../data/labels'
import { ARMOR_KINDS, type ArmorKind, type Skill, type SkillPoint } from '../../data/types'
import { cx } from '../../lib/cx'
import { useAppState } from '../../state/context'
import { useToast } from '../../state/toast'
import { COMPARE_MAX } from '../compare/compareRows'
import { SaveBuildDialog } from '../saved/SaveBuildDialog'
import { buildKey, isAlternative, selectArmor, type CompareEntry, type ResultVariant } from './compareList'
import { chipLevel, formatCount, shortfallLabel } from './format'

type Expandable = ArmorKind | 'talisman'

/** 결과 카드에서 비선호 스킬을 바로 넣고 빼는 데 쓰는 지금 검색 조건 (결과를 만든 요청과 다를 수 있다) */
export interface ExcludeControl {
  /** 지금 조건의 비선호 스킬 */
  excluded: readonly number[]
  /** 지금 조건의 원하는 스킬 (꺼 둔 것 포함). 비선호로 넣을 수 없다 */
  required: readonly SkillPoint[]
  onChange: (excluded: number[]) => void
}

/** 결과 카드를 비교 목록에 넣고 빼기. 카드는 지금 보이는 세팅(대체 방어구 선택 포함)을 넣는다 */
export interface CompareControl {
  /** 이 세팅(buildKey)이 비교 목록에 있는지 */
  has: (key: string) => boolean
  /** 비교 목록이 꽉 찼는지 (COMPARE_MAX) */
  full: boolean
  /** 몇 번째 검색인지(seq)는 검색 화면이 채운다 */
  add: (entry: Omit<CompareEntry, 'seq'>) => void
  remove: (key: string) => void
}

interface ChipInfo {
  skillId: number
  name: string
  /** 레벨. 시리즈·그룹 스킬은 단계 */
  level: number
  /** 칩의 숫자 (chipLevel: 시리즈·그룹 스킬은 단계의 부위 수) */
  shown: number
  maxLevel?: number
  tone: SkillTone
  /** 시리즈·그룹 스킬의 부위 수 */
  pieces?: number
  /** 원하는 레벨보다 모자라면 (가장 가까운 조합) 칩 글자·설명. 색이 시리즈·그룹 칩과 비슷해서 글자로도 보인다 */
  short?: { mark: string; text: string }
}

/** 요구 스킬 → 비선호 → 시리즈/그룹 → 그 외 순서의 스킬 칩 */
function skillChips(db: GameDb, summary: BuildSummary, request: SearchRequest): ChipInfo[] {
  const levels = activeSkillLevels(summary)
  const pieces = new Map(summary.bonuses.map((b) => [b.skillId, b.pieces]))
  const requiredIds = new Set(request.required.map((r) => r.skillId))
  const unwanted = new Set(unwantedSkillsOf(summary, request.excludedSkills))
  const required: ChipInfo[] = []
  for (const r of request.required) {
    const skill = db.skills.get(r.skillId)
    if (!skill) continue
    const level = levels.get(r.skillId) ?? 0
    const bonus = skill.kind === 'set' || skill.kind === 'group'
    required.push({
      skillId: r.skillId,
      name: nameOf(skill.name),
      level,
      shown: chipLevel(skill, level),
      maxLevel: bonus ? undefined : skill.maxLevel,
      tone: level >= r.level ? 'required' : 'missing',
      pieces: pieces.get(r.skillId),
      short: level < r.level ? shortfallLabel(skill, level, r.level) : undefined,
    })
  }
  const unwantedChips: ChipInfo[] = []
  const extra: ChipInfo[] = []
  for (const s of summary.skills) {
    if (requiredIds.has(s.skillId) || s.level === 0) continue
    const chip: ChipInfo = {
      skillId: s.skillId,
      name: skillName(db, s.skillId),
      level: s.level,
      shown: s.level,
      maxLevel: s.maxLevel,
      tone: 'extra',
    }
    if (unwanted.has(s.skillId)) unwantedChips.push({ ...chip, tone: 'unwanted' })
    else extra.push(chip)
  }
  const bonuses: ChipInfo[] = []
  for (const b of summary.bonuses) {
    if (requiredIds.has(b.skillId) || b.level === 0) continue
    bonuses.push({
      skillId: b.skillId,
      name: skillName(db, b.skillId),
      level: b.level,
      shown: chipLevel(db.skill(b.skillId), b.level),
      tone: 'bonus',
      pieces: b.pieces,
    })
  }
  return [...required, ...unwantedChips, ...bonuses, ...extra]
}

/** 비선호 스킬이 붙은 곳: 방어구·호석 자체 스킬은 부위별로, 장식주는 id 로 (무기 자체 스킬은 세지 않는다) */
function unwantedSources(summary: BuildSummary, excluded: readonly number[]) {
  const skillIds = new Set(unwantedSkillsOf(summary, excluded))
  const byEquip = new Map<EquipKey, SkillPoint[]>()
  const decorationIds = new Set<number>()
  for (const s of summary.skills) {
    if (!skillIds.has(s.skillId)) continue
    for (const c of s.contributions) {
      if (c.decorationId !== null) {
        decorationIds.add(c.decorationId)
      } else if (c.from !== 'weapon') {
        byEquip.set(c.from, [...(byEquip.get(c.from) ?? []), { skillId: s.skillId, level: c.level }])
      }
    }
  }
  return { byEquip, decorationIds }
}

function EquipRow({
  label,
  name,
  rarity,
  equipKey,
  summary,
  unwanted,
  alternatives,
  open,
  onToggle,
}: {
  label: string
  name: string
  rarity?: number
  equipKey: EquipKey
  summary: BuildSummary
  /** 이 장비 자체에 붙은 비선호 스킬 (예: '체술 1') */
  unwanted?: string
  alternatives: number
  open: boolean
  onToggle: () => void
}) {
  const slots = summary.slots.filter((s) => s.key === equipKey)
  return (
    <div className="flex min-w-0 items-center gap-2 text-sm">
      <span className="w-7 shrink-0 text-xs text-muted">{label}</span>
      <span className="min-w-0 truncate" title={name}>
        {name}
      </span>
      {rarity !== undefined && <span className="shrink-0 text-[11px] text-muted">R{rarity}</span>}
      {slots.length > 0 && (
        <span className="inline-flex shrink-0 items-center gap-0.5">
          {slots.map((s) => (
            <SlotBadge key={s.index} slot={s.slot} size="sm" filled={s.decorationId !== null} />
          ))}
        </span>
      )}
      {unwanted && (
        <span
          title="비선호 스킬"
          className="shrink-0 rounded border border-bad/40 bg-bad/10 px-1 text-[11px] whitespace-nowrap text-bad"
        >
          {unwanted}
        </span>
      )}
      {alternatives > 0 && (
        <button
          type="button"
          aria-expanded={open}
          onClick={onToggle}
          className="shrink-0 rounded px-1 text-xs text-accent hover:bg-surface-2 pointer-coarse:px-2 pointer-coarse:py-1.5 pointer-coarse:text-sm"
        >
          외 {alternatives} {open ? '▴' : '▾'}
        </button>
      )}
    </div>
  )
}

function AlternativeList({
  options,
  selectedIndex,
  onSelect,
}: {
  options: { key: string; name: string; detail: string; meta?: string }[]
  selectedIndex: number
  onSelect: (index: number) => void
}) {
  return (
    <ul className="max-h-56 overflow-auto rounded-md border border-line bg-surface-2 py-1">
      {options.map((o, i) => (
        <li key={o.key}>
          <button
            type="button"
            onClick={() => onSelect(i)}
            className={cx(
              'flex w-full items-start gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-surface pointer-coarse:py-2.5',
              i === selectedIndex && 'text-accent',
            )}
          >
            <span className="w-3 shrink-0">{i === selectedIndex ? '●' : '○'}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">{o.name}</span>
              <span className="block truncate text-muted">{o.detail || '추가 스킬 없음'}</span>
            </span>
            {o.meta && <span className="shrink-0 text-muted">{o.meta}</span>}
          </button>
        </li>
      ))}
    </ul>
  )
}

/** 스킬 칩을 누르면 칩 목록 아래에 뜨는 스킬 효과. 추가 스킬(회색)이면 비선호 스킬 넣기/빼기가 아래에 붙는다 */
function SkillDetail({
  chip,
  skill,
  request,
  exclude,
}: {
  chip: ChipInfo
  skill: Skill
  request: SearchRequest
  exclude: ExcludeControl
}) {
  const rank = skill.ranks.find((r) => r.level === chip.level)
  const bonus = skill.kind === 'set' || skill.kind === 'group'
  return (
    <div className="space-y-1.5 rounded-md border border-line bg-surface-2 px-2.5 py-1.5 text-xs">
      {bonus ? (
        // 시리즈·그룹 스킬은 스킬 설명이 없고 단계마다 이름·효과가 있다
        <div className="space-y-0.5">
          <p>
            <span className="font-medium">{chip.name}</span>
            <span className="text-muted"> · </span>
            {rank ? (rank.name ? nameOf(rank.name) : `${chip.level}단계`) : '미발동'}
            {chip.pieces !== undefined && <span className="text-muted"> ({chip.pieces}부위)</span>}
          </p>
          {rank?.description && <p>{rank.description}</p>}
        </div>
      ) : (
        // 레벨 효과만으로는 뜻이 안 통하는 스킬이 많아(예: 완충 'Lv1 스킬 효과 발동') 스킬 설명을 먼저 둔다
        <div className="space-y-0.5">
          <p>
            <span className="font-medium">{chip.name}</span>
            {skill.description && <span className="text-muted"> · </span>}
            {skill.description}
          </p>
          {rank?.description && rank.description !== skill.description && (
            <p>
              <span className="text-muted">Lv{chip.level}</span> {rank.description}
            </p>
          )}
        </div>
      )}
      {chip.short && <p className="text-warn">{chip.short.text}.</p>}
      {chip.tone === 'unwanted' && <p className="text-muted">비선호 스킬이에요.</p>}
      {chip.tone === 'extra' && <UnwantedAction skillId={chip.skillId} request={request} exclude={exclude} />}
    </div>
  )
}

/** 추가 스킬의 효과 아래에 붙는 비선호 스킬 넣기/빼기 */
function UnwantedAction({
  skillId,
  request,
  exclude,
}: {
  skillId: number
  request: SearchRequest
  exclude: ExcludeControl
}) {
  const required = exclude.required.some((r) => r.skillId === skillId)
  const excluded = exclude.excluded.includes(skillId)
  // 검색할 때부터 비선호였는데 회색이면 무기 자체에 붙은 스킬이다 (unwantedSkillsOf)
  const searched = request.excludedSkills.includes(skillId)
  let message = '이 스킬이 붙은 조합을 원하지 않으면 비선호 스킬에 넣으세요.'
  if (required) message = '원하는 스킬 목록에 있어 비선호로 넣을 수 없어요.'
  else if (excluded && searched) message = '비선호 스킬이지만 무기 자체에 붙은 스킬은 비선호로 세지 않아요.'
  else if (excluded) message = '비선호 스킬에 넣었어요. 다시 검색하면 반영돼요.'
  const add = () => exclude.onChange([...exclude.excluded, skillId])
  const remove = () => exclude.onChange(exclude.excluded.filter((id) => id !== skillId))
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-line pt-1.5">
      <p className="min-w-0 flex-1 text-muted">{message}</p>
      {!required &&
        (excluded ? (
          <Button size="sm" variant="ghost" onClick={remove}>
            {searched ? '비선호에서 빼기' : '되돌리기'}
          </Button>
        ) : (
          <Button size="sm" variant="danger" onClick={add}>
            비선호 스킬에 추가
          </Button>
        ))}
    </div>
  )
}

export function ResultCard({
  item,
  request,
  index,
  exclude,
  compare,
  onHide,
}: {
  item: SearchResultItem
  request: SearchRequest
  index: number
  exclude: ExcludeControl
  compare: CompareControl
  /** 목록에서 이 카드를 숨긴다 (다시 검색하면 다시 보인다) */
  onHide: () => void
}) {
  const { db, customTalismans, openInManual } = useAppState()
  const toast = useToast()
  const [variant, setVariant] = useState<ResultVariant>({})
  const [open, setOpen] = useState<Expandable | null>(null)
  const [saving, setSaving] = useState(false)
  /** 효과를 연 스킬 칩 */
  const [picked, setPicked] = useState<number | null>(null)

  const build = useMemo(() => resultToBuild(db, item, request, variant), [db, item, request, variant])
  const summary = useMemo(() => computeBuild(db, build, customTalismans), [db, build, customTalismans])
  // 대체 방어구를 바꾸면 다른 세팅이라 비교 목록에 없는 것으로 보인다 (대체 방어구끼리도 비교할 수 있다)
  const compareKey = useMemo(() => buildKey(build), [build])
  const compared = compare.has(compareKey)
  const toggleCompare = () => {
    if (compared) compare.remove(compareKey)
    else if (compare.full) toast(`비교는 ${COMPARE_MAX}개까지 할 수 있어요. 비교 목록에서 하나를 빼 주세요.`)
    else compare.add({ key: compareKey, build, request, index, variant: isAlternative(item, variant) })
  }
  const chips = useMemo(() => skillChips(db, summary, request), [db, summary, request])
  // 대체 방어구로 바꿔 그 스킬이 없어지면 닫힌 것으로 본다
  const pickedChip = chips.find((c) => c.skillId === picked)
  const pickedSkill = pickedChip && db.skills.get(pickedChip.skillId)
  const unwanted = useMemo(() => unwantedSources(summary, request.excludedSkills), [summary, request.excludedSkills])
  const unwantedText = (key: EquipKey) => {
    const points = unwanted.byEquip.get(key)
    return points ? skillPointsText(db, points) : undefined
  }

  const decorations = useMemo(() => {
    const counts = new Map<number, number>()
    for (const s of summary.slots) if (s.decorationId !== null) counts.set(s.decorationId, (counts.get(s.decorationId) ?? 0) + 1)
    return [...counts]
      .flatMap(([id, count]) => {
        const deco = db.decorations.get(id)
        return deco ? [{ deco, count }] : []
      })
      .sort((a, b) => b.deco.size - a.deco.size || a.deco.name.ko.localeCompare(b.deco.name.ko, 'ko'))
  }, [db, summary])

  const toggle = (key: Expandable) => setOpen((current) => (current === key ? null : key))
  const requiredIds = new Set(request.required.map((r) => r.skillId))
  const extraSkillsText = (points: readonly SkillPoint[]) =>
    skillPointsText(
      db,
      points.filter((p) => !requiredIds.has(p.skillId)),
    )

  const alternativeOptions = (key: Expandable) => {
    if (key === 'talisman') {
      return item.talismans.map((ref) => {
        const resolved = resolveTalisman(db, ref, customTalismans)
        return {
          key: `${ref.type}:${ref.id}`,
          name: talismanName(db, ref, customTalismans),
          detail: resolved ? skillPointsText(db, resolved.skills) : '',
          meta: resolved && resolved.slots.length > 0 ? `슬롯 ${resolved.slots.map((s) => s.level).join('-')}` : undefined,
        }
      })
    }
    // 시리즈/그룹 스킬이 후보마다 다르면 다른 것만 보인다 (모두 같은 것은 빼고)
    const pieces = item.armor[key].flatMap((id) => db.armor.get(id) ?? [])
    const common = pieces.reduce<number[]>(
      (ids, piece, i) => (i === 0 ? [...piece.bonusSkillIds] : ids.filter((id) => piece.bonusSkillIds.includes(id))),
      [],
    )
    return item.armor[key].flatMap((id) => {
      const piece = db.armor.get(id)
      if (!piece) return []
      const transcend = request.transcend && canTranscend(piece)
      const slots = armorSlots(piece, transcend)
      const notes = [`슬롯 ${slots.length > 0 ? slots.join('-') : '없음'}`, `방어 ${armorDefense(piece, transcend).max}`]
      // α/β: 대표에 넣은 장식주 대신 그 스킬을 방어구가 갖고 있어 그 장식주를 빼면 결과가 같다
      const jewels = item.swaps[id]?.jewels ?? []
      if (jewels.length > 0) notes.unshift(`${jewelsText(jewels)} 없이`)
      // 이 결과에서는 발동이 같지만 어느 시리즈/그룹 스킬이 붙었는지는 다르다
      const bonus = piece.bonusSkillIds
        .filter((skillId) => !common.includes(skillId))
        .map((skillId) => skillName(db, skillId))
        .join(' · ')
      const detail = [extraSkillsText(piece.skills), bonus].filter(Boolean).join(' · ')
      return [{ key: String(id), name: nameOf(piece.name), detail, meta: notes.join(' · ') }]
    })
  }
  const jewelsText = (ids: readonly number[]) => {
    const counts = new Map<number, number>()
    for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1)
    return [...counts]
      .flatMap(([id, count]) => {
        const deco = db.decorations.get(id)
        return deco ? [`${nameOf(deco.name)}${count > 1 ? `×${count}` : ''}`] : []
      })
      .join(', ')
  }
  const selectedIndex = (key: Expandable) => {
    if (key === 'talisman') return variant.talismanIndex ?? 0
    const id = build.armor[key]?.id
    return Math.max(0, item.armor[key].findIndex((x) => x === id))
  }
  const selectAlternative = (key: Expandable, i: number) => {
    if (key === 'talisman') {
      setVariant((v) => ({ ...v, talismanIndex: i }))
      return
    }
    const next = selectArmor(item, variant, key, item.armor[key][i])
    setVariant(next.variant)
    if (next.reset.length > 0) {
      const kinds = next.reset.map((k) => ARMOR_KIND_LABEL[k]).join('·')
      toast(`함께 바꾸면 시리즈·그룹 스킬이 달라져서 다른 부위(${kinds})는 대표로 되돌렸어요`)
    }
  }

  const weapon = summary.equipment.weapon
  return (
    // 비선호 스킬이 든 결과도 카드 자체는 똑같이 두고, 그 스킬 칩·붙은 부위·장식주에만 표시한다. 비교 목록에 넣은 카드는 강조 테두리
    <article
      className={cx(
        'space-y-2.5 rounded-lg border bg-surface p-3',
        compared ? 'border-accent ring-1 ring-accent' : 'border-line',
      )}
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="text-xs font-semibold text-muted">#{index}</span>
        <span className="text-sm">
          방어력 <span className="font-semibold tabular-nums">{summary.defense.max}</span>
        </span>
        <span className="inline-flex items-center gap-1 text-xs text-muted">
          남는 슬롯 <SlotList slots={summary.freeSlots} size="sm" empty="없음" sorted />
        </span>
        {item.variantCount > 1 && <Badge>방어구 조합 {formatCount(item.variantCount)}개</Badge>}
        <div className="ml-auto flex gap-1.5">
          {/* 늘 누르던 '수동 세팅에서 열기' 자리가 그대로이게 맨 앞에 둔다 */}
          <Button size="sm" variant="ghost" title="목록에서 숨기기 · 다시 검색하면 다시 보여요" onClick={onHide}>
            숨기기
          </Button>
          <Button
            size="sm"
            variant={compared ? 'primary' : 'ghost'}
            aria-pressed={compared}
            title={compared ? '비교 목록에서 빼기' : '비교 목록에 넣기'}
            onClick={toggleCompare}
          >
            {compared ? '✓ 비교' : '비교'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSaving(true)}>
            저장
          </Button>
          <Button size="sm" onClick={() => openInManual(build)}>
            {/* 휴대폰 폭에는 버튼 넷이 다 안 들어가서 줄인다 (버튼 안 gap 때문에 글자를 둘로 나누지 않는다) */}
            <span className="sm:hidden">수동 세팅</span>
            <span className="max-sm:hidden">수동 세팅에서 열기</span>
          </Button>
        </div>
      </header>

      <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
        {ARMOR_KINDS.map((kind) => {
          const choice = build.armor[kind]
          const piece = choice ? db.armor.get(choice.id) : undefined
          return (
            <EquipRow
              key={kind}
              label={ARMOR_KIND_LABEL[kind]}
              name={piece ? nameOf(piece.name) : '미장착'}
              rarity={piece?.rarity}
              equipKey={kind}
              summary={summary}
              unwanted={unwantedText(kind)}
              alternatives={Math.max(0, item.armor[kind].length - 1)}
              open={open === kind}
              onToggle={() => toggle(kind)}
            />
          )
        })}
        <EquipRow
          label="호석"
          name={talismanName(db, build.talisman, customTalismans)}
          equipKey="talisman"
          summary={summary}
          unwanted={unwantedText('talisman')}
          alternatives={Math.max(0, item.talismans.length - 1)}
          open={open === 'talisman'}
          onToggle={() => toggle('talisman')}
        />
        {weapon && weapon.slots.length > 0 && (
          <EquipRow
            label="무기"
            name={weapon.name}
            equipKey="weapon"
            summary={summary}
            alternatives={0}
            open={false}
            onToggle={() => {}}
          />
        )}
      </div>

      {open && (
        <AlternativeList
          options={alternativeOptions(open)}
          selectedIndex={selectedIndex(open)}
          onSelect={(i) => selectAlternative(open, i)}
        />
      )}

      {decorations.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
          <span className="text-muted">장식주</span>
          {decorations.map(({ deco, count }) => (
            <span
              key={deco.id}
              className={cx('inline-flex items-center gap-1', unwanted.decorationIds.has(deco.id) && 'text-bad')}
              title={skillPointsText(db, deco.skills)}
            >
              <SlotBadge slot={{ kind: deco.kind, level: deco.size }} size="sm" filled />
              {nameOf(deco.name)}
              {count > 1 && <span className="text-muted">×{count}</span>}
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-1 pointer-coarse:gap-1.5">
        {chips.map((chip) => {
          // 칩을 누르면 아래에 스킬 효과가 열린다 (툴팁은 휴대폰에서 못 본다). 추가 스킬(회색)은 거기서 비선호 스킬에
          // 넣고 빼며, 넣은 칩은 다시 검색할 때까지 빨강으로 둔다
          const extra = chip.tone === 'extra'
          const pending =
            extra && exclude.excluded.includes(chip.skillId) && !request.excludedSkills.includes(chip.skillId)
          return (
            <SkillChip
              key={chip.skillId}
              name={chip.name}
              level={chip.shown}
              maxLevel={chip.maxLevel}
              tone={pending ? 'unwanted' : chip.tone}
              title={
                chip.short
                  ? `${chip.short.text} · 눌러서 스킬 효과 보기`
                  : extra
                    ? '눌러서 스킬 효과 보기 · 비선호 스킬에 넣거나 빼기'
                    : '눌러서 스킬 효과 보기'
              }
              onClick={() => setPicked((id) => (id === chip.skillId ? null : chip.skillId))}
              expanded={picked === chip.skillId}
            >
              {chip.short && <span className="font-semibold">{chip.short.mark}</span>}
            </SkillChip>
          )
        })}
      </div>

      {pickedChip && pickedSkill && (
        <SkillDetail chip={pickedChip} skill={pickedSkill} request={request} exclude={exclude} />
      )}

      {saving && (
        <SaveBuildDialog
          open
          onClose={() => setSaving(false)}
          build={build}
          defaultName={suggestName(db, request.required)}
        />
      )}
    </article>
  )
}
