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
import { skillName, skillPointsText, talismanName } from '../../data/format'
import { ARMOR_KIND_LABEL } from '../../data/labels'
import { ARMOR_KINDS, type ArmorKind, type SkillPoint } from '../../data/types'
import { cx } from '../../lib/cx'
import { useAppState } from '../../state/context'
import { SaveBuildDialog } from '../saved/SaveBuildDialog'
import { bonusRankLabel, formatCount } from './format'

type Variant = Partial<Record<ArmorKind, number>> & { talismanIndex?: number }
type Expandable = ArmorKind | 'talisman'

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
      title: bonus ? bonusRankLabel(skill, level) : skill.ranks.find((x) => x.level === level)?.description,
    })
  }
  const unwantedChips: ChipInfo[] = []
  const extra: ChipInfo[] = []
  for (const s of summary.skills) {
    if (requiredIds.has(s.skillId) || s.level === 0) continue
    const chip: ChipInfo = { skillId: s.skillId, name: skillName(db, s.skillId), level: s.level, maxLevel: s.maxLevel, tone: 'extra' }
    if (unwanted.has(s.skillId)) unwantedChips.push({ ...chip, tone: 'unwanted' })
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

function EquipRow({
  label,
  name,
  rarity,
  equipKey,
  summary,
  alternatives,
  open,
  onToggle,
}: {
  label: string
  name: string
  rarity?: number
  equipKey: EquipKey
  summary: BuildSummary
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

export function ResultCard({
  item,
  request,
  index,
  deprioritized = false,
}: {
  item: SearchResultItem
  request: SearchRequest
  index: number
  deprioritized?: boolean
}) {
  const { db, customTalismans, openInManual } = useAppState()
  const [variant, setVariant] = useState<Variant>({})
  const [open, setOpen] = useState<Expandable | null>(null)
  const [saving, setSaving] = useState(false)

  const build = useMemo(() => resultToBuild(db, item, request, variant), [db, item, request, variant])
  const summary = useMemo(() => computeBuild(db, build, customTalismans), [db, build, customTalismans])
  const chips = useMemo(() => skillChips(db, summary, request), [db, summary, request])
  // 남는 슬롯: 무기 슬롯 먼저, 레벨 내림차순
  const freeSlots = useMemo(
    () =>
      [...summary.freeSlots].sort((a, b) => (a.kind === b.kind ? b.level - a.level : a.kind === 'weapon' ? -1 : 1)),
    [summary],
  )

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
    <article
      className={cx('space-y-2.5 rounded-lg border bg-surface p-3', deprioritized ? 'border-bad/40' : 'border-line')}
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="text-xs font-semibold text-muted">#{index}</span>
        <span className="text-sm">
          방어력 <span className="font-semibold tabular-nums">{summary.defense.max}</span>
        </span>
        <span className="inline-flex items-center gap-1 text-xs text-muted">
          남는 슬롯 <SlotList slots={freeSlots} size="sm" empty="없음" />
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
            <span key={deco.id} className="inline-flex items-center gap-1" title={skillPointsText(db, deco.skills)}>
              <SlotBadge slot={{ kind: deco.kind, level: deco.size }} size="sm" filled />
              {nameOf(deco.name)}
              {count > 1 && <span className="text-muted">×{count}</span>}
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-1">
        {chips.map((chip) => (
          <SkillChip
            key={chip.skillId}
            name={chip.name}
            level={chip.level}
            maxLevel={chip.maxLevel}
            tone={chip.tone}
            title={chip.title}
          />
        ))}
      </div>

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
