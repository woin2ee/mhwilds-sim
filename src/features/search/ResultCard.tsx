import { useMemo, useState } from 'react'
import { SkillChip, type SkillTone } from '../../components/SkillChip'
import { SlotBadge, SlotList } from '../../components/SlotBadge'
import { Badge, Button } from '../../components/ui'
import { activeSkillLevels, computeBuild, unwantedSkillsOf, type BuildSummary } from '../../core/calc'
import { resolveTalisman } from '../../core/equipment'
import { suggestName } from '../../core/savedBuilds'
import { resultToBuild } from '../../core/search/toBuild'
import type { SearchRequest, SearchResultItem } from '../../core/search/types'
import { armorDefense, canTranscend } from '../../core/transcend'
import type { EquipKey } from '../../core/types'
import { nameOf, type GameDb } from '../../data/db'
import { skillName, skillPointsText, skillTooltip, talismanName } from '../../data/format'
import { ARMOR_KIND_LABEL } from '../../data/labels'
import { ARMOR_KINDS, type ArmorKind, type SkillPoint } from '../../data/types'
import { cx } from '../../lib/cx'
import { useAppState } from '../../state/context'
import { SaveBuildDialog } from '../saved/SaveBuildDialog'
import { bonusRankLabel, formatCount } from './format'

type Variant = Partial<Record<ArmorKind, number>> & { talismanIndex?: number }
type Expandable = ArmorKind | 'talisman'

/** 결과 카드에서 비선호 스킬을 바로 넣고 빼는 데 쓰는 지금 검색 조건 (결과를 만든 요청과 다를 수 있다) */
export interface ExcludeControl {
  /** 지금 조건의 비선호 스킬 */
  excluded: readonly number[]
  /** 지금 조건의 원하는 스킬 (꺼 둔 것 포함). 비선호로 넣을 수 없다 */
  required: readonly SkillPoint[]
  onChange: (excluded: number[]) => void
}

interface ChipInfo {
  skillId: number
  name: string
  level: number
  maxLevel?: number
  tone: SkillTone
  title?: string
}

/** 요구 스킬 → 비선호 → 시리즈/그룹 → 그 외 순서의 스킬 칩 */
function skillChips(db: GameDb, summary: BuildSummary, request: SearchRequest): ChipInfo[] {
  const levels = activeSkillLevels(summary)
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
      maxLevel: bonus ? undefined : skill.maxLevel,
      tone: level >= r.level ? 'required' : 'missing',
      title: bonus ? bonusRankLabel(skill, level) : skillTooltip(skill, level),
    })
  }
  const unwantedChips: ChipInfo[] = []
  const extra: ChipInfo[] = []
  for (const s of summary.skills) {
    if (requiredIds.has(s.skillId) || s.level === 0) continue
    const chip: ChipInfo = { skillId: s.skillId, name: skillName(db, s.skillId), level: s.level, maxLevel: s.maxLevel, tone: 'extra' }
    if (unwanted.has(s.skillId)) unwantedChips.push({ ...chip, tone: 'unwanted', title: '비선호 스킬' })
    else extra.push(chip)
  }
  const bonuses: ChipInfo[] = []
  for (const b of summary.bonuses) {
    if (requiredIds.has(b.skillId) || b.level === 0) continue
    const rank = db.skills.get(b.skillId)?.ranks.find((r) => r.level === b.level)
    bonuses.push({
      skillId: b.skillId,
      name: skillName(db, b.skillId),
      level: b.level,
      tone: 'bonus',
      title: rank?.name ? `${nameOf(rank.name)} (${b.pieces}부위)` : undefined,
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

/** 추가 스킬 칩을 누르면 칩 목록 아래에 뜨는 비선호 스킬 넣기/빼기 */
function UnwantedAction({
  skillId,
  name,
  request,
  exclude,
}: {
  skillId: number
  name: string
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
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border border-line bg-surface-2 px-2.5 py-1.5 text-xs">
      <p className="min-w-0 flex-1">
        <span className="font-medium">{name}</span>
        <span className="text-muted"> · {message}</span>
      </p>
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
}: {
  item: SearchResultItem
  request: SearchRequest
  index: number
  exclude: ExcludeControl
}) {
  const { db, customTalismans, openInManual } = useAppState()
  const [variant, setVariant] = useState<Variant>({})
  const [open, setOpen] = useState<Expandable | null>(null)
  const [saving, setSaving] = useState(false)
  /** 비선호 넣기/빼기를 연 추가 스킬 칩 */
  const [picked, setPicked] = useState<number | null>(null)

  const build = useMemo(() => resultToBuild(db, item, request, variant), [db, item, request, variant])
  const summary = useMemo(() => computeBuild(db, build, customTalismans), [db, build, customTalismans])
  const chips = useMemo(() => skillChips(db, summary, request), [db, summary, request])
  // 대체 방어구로 바꿔 그 스킬이 없어지면 닫힌 것으로 본다
  const pickedChip = chips.find((c) => c.skillId === picked && c.tone === 'extra')
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
    return item.armor[key].flatMap((id) => {
      const piece = db.armor.get(id)
      if (!piece) return []
      const defense = armorDefense(piece, request.transcend && canTranscend(piece)).max
      return [{ key: String(id), name: nameOf(piece.name), detail: extraSkillsText(piece.skills), meta: `방어 ${defense}` }]
    })
  }
  const selectedIndex = (key: Expandable) => {
    if (key === 'talisman') return variant.talismanIndex ?? 0
    const id = build.armor[key]?.id
    return Math.max(0, item.armor[key].findIndex((x) => x === id))
  }
  const selectAlternative = (key: Expandable, i: number) => {
    if (key === 'talisman') setVariant((v) => ({ ...v, talismanIndex: i }))
    else setVariant((v) => ({ ...v, [key]: item.armor[key][i] }))
  }

  const weapon = summary.equipment.weapon
  return (
    // 비선호 스킬이 든 결과도 카드 자체는 똑같이 두고, 그 스킬 칩·붙은 부위·장식주에만 표시한다
    <article className="space-y-2.5 rounded-lg border border-line bg-surface p-3">
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
          <Button size="sm" variant="ghost" onClick={() => setSaving(true)}>
            저장
          </Button>
          <Button size="sm" onClick={() => openInManual(build)}>
            수동 세팅에서 열기
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
          // 추가 스킬(회색)은 눌러서 비선호 스킬에 넣고 뺀다. 넣은 칩은 다시 검색할 때까지 빨강으로 둔다
          const extra = chip.tone === 'extra'
          const pending =
            extra && exclude.excluded.includes(chip.skillId) && !request.excludedSkills.includes(chip.skillId)
          return (
            <SkillChip
              key={chip.skillId}
              name={chip.name}
              level={chip.level}
              maxLevel={chip.maxLevel}
              tone={pending ? 'unwanted' : chip.tone}
              title={extra ? '눌러서 비선호 스킬에 넣거나 빼기' : chip.title}
              onClick={extra ? () => setPicked((id) => (id === chip.skillId ? null : chip.skillId)) : undefined}
              expanded={extra ? picked === chip.skillId : undefined}
            />
          )
        })}
      </div>

      {pickedChip && (
        <UnwantedAction skillId={pickedChip.skillId} name={pickedChip.name} request={request} exclude={exclude} />
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
