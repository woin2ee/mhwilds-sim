import { useMemo, type ReactNode } from 'react'
import { SectionTitle } from '../../components/controls'
import { SlotBadge, SlotList } from '../../components/SlotBadge'
import { Badge, Button, ChevronIcon, EmptyState, Panel } from '../../components/ui'
import { isGogmaArtian } from '../../core/gogmaArtian'
import type { CustomTalisman } from '../../core/types'
import { nameOf, otherNamesOf } from '../../data/db'
import { skillName } from '../../data/format'
import { ARMOR_KIND_LABEL, GOGMA_ARTIAN_NAMES, SKILL_KIND_LABEL, SLOT_KIND_LABEL, WEAPON_KIND_LABEL } from '../../data/labels'
import { WEAPON_KINDS, type ArmorPiece, type Skill, type SkillPoint, type WeaponKind } from '../../data/types'
import { cx } from '../../lib/cx'
import { usePersistentState } from '../../lib/storage'
import { useAppState, useDb } from '../../state/context'
import { useToast } from '../../state/toast'
import { addRequiredSkill, removeRequiredSkill } from '../search/conditions'
import { useSearchConditions } from '../search/conditionsContext'
import { bonusRankLabel } from '../search/format'
import {
  isBonusSkill,
  skillSources,
  type ArmorSetSource,
  type DecorationSource,
  type TalismanSource,
  type WeaponKindSource,
} from './skillLookup'
import type { DictionaryEntry } from './dictionarySearch'

const isWeaponKindOrNull = (v: unknown): v is WeaponKind | null => v === null || WEAPON_KINDS.includes(v as WeaponKind)
const isBoolean = (v: unknown): v is boolean => typeof v === 'boolean'

/** 원하는 스킬 레벨 표시: Lv5, 시리즈·그룹 스킬은 '4부위 (Ⅱ)'·'3부위' */
const levelLabel = (skill: Skill, level: number) => (isBonusSkill(skill) ? bonusRankLabel(skill, level) : `Lv${level}`)

/** 사전 오른쪽(휴대폰은 '상세') 열의 스킬: 스킬 설명·레벨 효과와 그 스킬을 얻는 곳. onOpen 은 방어구 세트를 사전에서 연다 */
export function SkillDetail({ skill, onOpen }: { skill: Skill; onOpen: (entry: DictionaryEntry) => void }) {
  const { db, customTalismans } = useAppState()
  const sources = useMemo(() => skillSources(db, skill), [db, skill])
  const myTalismans = useMemo(
    () => customTalismans.filter((t) => t.skills.some((p) => p.skillId === skill.id)),
    [customTalismans, skill],
  )
  const none =
    sources.decorations.length +
      sources.weapons.length +
      sources.armorSets.length +
      sources.talismans.length +
      myTalismans.length ===
    0
  return (
    <>
      <SkillOverview skill={skill} />
      {sources.decorations.length > 0 && <DecorationPanel skill={skill} decorations={sources.decorations} />}
      {sources.weapons.length > 0 && <WeaponPanel skill={skill} groups={sources.weapons} />}
      {sources.armorSets.length > 0 && <ArmorPanel skill={skill} sets={sources.armorSets} onOpen={onOpen} />}
      {(sources.talismans.length > 0 || myTalismans.length > 0) && (
        <TalismanPanel skill={skill} fixed={sources.talismans} mine={myTalismans} />
      )}
      {none && <EmptyState>이 스킬이 붙은 장비를 데이터에서 찾지 못했어요.</EmptyState>}
    </>
  )
}

function PanelTitle({ title, count }: { title: string; count: string }) {
  return (
    <span>
      {title} <span className="font-normal text-muted">{count}</span>
    </span>
  )
}

/** 장비에 붙은 스킬. 지금 보는 스킬을 앞에 진하게 두고 나머지는 흐리게 */
function PointsText({ points, skillId }: { points: readonly SkillPoint[]; skillId: number }) {
  const db = useDb()
  const sorted = [...points].sort((a, b) => Number(b.skillId === skillId) - Number(a.skillId === skillId))
  return (
    <span>
      {sorted.map((p, i) => (
        <span key={p.skillId}>
          {i > 0 && <span className="text-muted"> · </span>}
          <span className={p.skillId === skillId ? 'font-medium text-fg' : 'text-muted'}>
            {skillName(db, p.skillId)} <span className="tabular-nums">{p.level}</span>
          </span>
        </span>
      ))}
    </span>
  )
}

function SkillOverview({ skill }: { skill: Skill }) {
  const bonus = isBonusSkill(skill)
  const others = otherNamesOf(skill.name)
  // 레벨 효과가 스킬 설명과 똑같은 1레벨 스킬은 효과 줄을 빼고, 시리즈·그룹 스킬은 스킬 설명이 없고 단계마다 이름·효과가 있다
  const ranks = skill.ranks.filter((r) => bonus || r.description !== skill.description)
  return (
    <Panel>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 className="text-lg leading-snug font-bold">{nameOf(skill.name)}</h2>
          <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted">
            <span>
              {SKILL_KIND_LABEL[skill.kind]} ·{' '}
              {bonus ? `${skill.ranks.map((r) => r.pieces).join('·')}부위` : `최대 Lv${skill.maxLevel}`}
            </span>
            {others.length > 0 && (
              <span>
                {others.map(({ locale, name }, i) => (
                  <span key={locale} lang={locale}>
                    {i > 0 && ' · '}
                    {name}
                  </span>
                ))}
              </span>
            )}
          </p>
        </div>
        <RequiredAction skill={skill} />
      </div>
      {skill.description && <p className="mt-3 text-sm leading-relaxed">{skill.description}</p>}
      {ranks.length > 0 && (
        <ol className="mt-3 divide-y divide-line rounded-md border border-line text-sm">
          {ranks.map((rank) => (
            <li key={rank.level} className="flex items-baseline gap-3 px-3 py-2">
              <span className="w-10 shrink-0 text-xs font-semibold text-accent tabular-nums">
                {bonus ? `${rank.pieces}부위` : `Lv${rank.level}`}
              </span>
              <span className="min-w-0">
                {rank.name && <span className="block font-medium">{nameOf(rank.name)}</span>}
                {rank.description}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  )
}

/** 스킬 검색의 원하는 스킬에 넣기. 이미 원하는 스킬이나 비선호 스킬이면 그렇다고 보여 주고 스킬 검색으로 잇는다 */
function RequiredAction({ skill }: { skill: Skill }) {
  const { db, setTab } = useAppState()
  const { cond, update } = useSearchConditions()
  const toast = useToast()
  const required = cond.required.find((r) => r.skillId === skill.id)
  const excluded = cond.excluded.includes(skill.id)

  if (required || excluded) {
    return (
      <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
        <span className={cx('text-xs', required ? 'text-good' : 'text-bad')}>
          {required
            ? `✓ 원하는 스킬에 있어요 · ${levelLabel(skill, required.level)}${required.off ? ' (꺼 둠)' : ''}`
            : '비선호 스킬에 있어요'}
        </span>
        <Button size="sm" variant="ghost" onClick={() => setTab('search')}>
          스킬 검색 보기
        </Button>
      </div>
    )
  }
  const add = () => {
    update((current) => addRequiredSkill(db, current, skill))
    toast(`원하는 스킬에 넣었어요 · ${nameOf(skill.name)} ${levelLabel(skill, skill.maxLevel)}`, {
      label: '되돌리기',
      onClick: () => update((current) => removeRequiredSkill(db, current, skill.id)),
    })
  }
  return (
    <Button size="sm" onClick={add} title="스킬 검색의 원하는 스킬에 최대 레벨로 넣어요. 레벨은 스킬 검색에서 바꿔요.">
      + 원하는 스킬에 추가
    </Button>
  )
}

function DecorationPanel({ skill, decorations }: { skill: Skill; decorations: DecorationSource[] }) {
  return (
    <Panel title={<PanelTitle title="장식주" count={`${decorations.length}개`} />}>
      <ul className="-my-1.5 divide-y divide-line">
        {decorations.map(({ decoration }) => (
          <li key={decoration.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 py-1.5">
            <span className="flex min-w-0 items-center gap-1.5 text-sm">
              <SlotBadge
                slot={{ kind: decoration.kind, level: decoration.size }}
                size="sm"
                filled
                title={`${SLOT_KIND_LABEL[decoration.kind]} 슬롯 Lv${decoration.size} 이상`}
              />
              <span className="truncate">{nameOf(decoration.name)}</span>
            </span>
            <span className="ml-auto text-xs">
              <PointsText points={decoration.skills} skillId={skill.id} />
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

/** 무기 종류를 골라 그 종류 무기만 보인다 (고른 종류는 브라우저에 기억해 다른 스킬에서도 그 종류부터) */
function WeaponPanel({ skill, groups }: { skill: Skill; groups: WeaponKindSource[] }) {
  const [chosen, setChosen] = usePersistentState<WeaponKind | null>(
    'dictionary-weapon-kind:v1',
    null,
    isWeaponKindOrNull,
  )
  const group = groups.find((g) => g.kind === chosen) ?? groups[0]
  const total = groups.reduce((sum, g) => sum + g.weapons.length, 0)
  return (
    <Panel title={<PanelTitle title="무기" count={`${total}개`} />}>
      <div role="radiogroup" aria-label="무기 종류" className="flex flex-wrap gap-1 pointer-coarse:gap-1.5">
        {groups.map((g) => (
          <button
            key={g.kind}
            type="button"
            role="radio"
            aria-checked={g === group}
            onClick={() => setChosen(g.kind)}
            className={cx(
              'rounded-md border px-2 py-1 text-xs whitespace-nowrap pointer-coarse:px-2.5 pointer-coarse:py-1.5 pointer-coarse:text-sm',
              g === group
                ? 'border-accent bg-accent/10 font-semibold text-accent'
                : 'border-line bg-surface-2 text-muted hover:text-fg',
            )}
          >
            {WEAPON_KIND_LABEL[g.kind]} <span className="tabular-nums opacity-70">{g.weapons.length}</span>
          </button>
        ))}
      </div>
      <ul className="mt-2 -mb-1.5 divide-y divide-line">
        {group.weapons.map(({ weapon }) => (
          <li key={weapon.id} className="py-1.5">
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm">{nameOf(weapon.name)}</span>
              <SlotList slots={weapon.slots.map((level) => ({ kind: 'weapon', level }))} size="sm" empty="" />
              <span className="shrink-0 text-xs text-muted">레어도 {weapon.rarity}</span>
            </div>
            <div className="text-xs">
              {isGogmaArtian(weapon) && <span className="text-muted">{nameOf(GOGMA_ARTIAN_NAMES)} · </span>}
              <PointsText points={weapon.skills} skillId={skill.id} />
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

/** 방어구는 세트로 묶어 보이고, 눌러서 부위마다 슬롯·다른 스킬을 펼친다. 하위 랭크는 눌러야 보인다 */
function ArmorPanel({
  skill,
  sets,
  onOpen,
}: {
  skill: Skill
  sets: ArmorSetSource[]
  onOpen: (entry: DictionaryEntry) => void
}) {
  const [showLow, setShowLow] = usePersistentState('dictionary-low-rank:v1', false, isBoolean)
  const high = sets.filter((s) => !s.lowRank)
  const lowCount = sets.length - high.length
  // 하위 랭크에만 있는 스킬은 그냥 보인다
  const visible = showLow || high.length === 0 ? sets : high
  const pieces = visible.reduce((sum, s) => sum + s.pieces.length, 0)
  return (
    <Panel title={<PanelTitle title="방어구" count={`${visible.length}세트 · ${pieces}부위`} />}>
      <ul className="-my-1.5 divide-y divide-line">
        {visible.map((source) => (
          <ArmorSetRow key={source.set.id} skill={skill} source={source} onOpen={onOpen} />
        ))}
      </ul>
      {lowCount > 0 && high.length > 0 && (
        <Button size="sm" variant="ghost" className="mt-2.5 -ml-2" onClick={() => setShowLow(!showLow)}>
          {showLow ? '하위 랭크 숨기기' : `하위 랭크 ${lowCount}세트 더 보기`}
        </Button>
      )}
      {isBonusSkill(skill) && (
        <p className="mt-2.5 text-xs text-muted">거극 아티어 무기에 이 스킬이 붙어 있으면 무기도 1부위로 세요.</p>
      )}
    </Panel>
  )
}

function ArmorSetRow({
  skill,
  source,
  onOpen,
}: {
  skill: Skill
  source: ArmorSetSource
  onOpen: (entry: DictionaryEntry) => void
}) {
  const bonus = isBonusSkill(skill)
  const parts = source.pieces
    .map(({ piece, level }) => (bonus ? ARMOR_KIND_LABEL[piece.kind] : `${ARMOR_KIND_LABEL[piece.kind]} ${level}`))
    .join(' · ')
  return (
    <li>
      <details className="group">
        <summary className="-mx-1 flex cursor-pointer list-none items-center gap-2 rounded px-1 py-1.5 hover:bg-surface-2 pointer-coarse:py-2.5 [&::-webkit-details-marker]:hidden">
          <ChevronIcon className="size-3.5 shrink-0 -rotate-90 text-muted transition-transform group-open:rotate-0" />
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
              <span className="text-sm font-medium">{nameOf(source.set.name)}</span>
              <span className="text-xs text-muted">레어도 {source.rarity}</span>
              {source.hr100 && <Badge>HR 100</Badge>}
              {source.lowRank && <Badge>하위 랭크</Badge>}
            </span>
            <span className="block text-xs text-muted">{parts}</span>
          </span>
          <span className="shrink-0 text-xs text-muted">
            {bonus ? (
              <>
                <span className="text-sm font-semibold text-fg tabular-nums">{source.total}</span>부위
              </>
            ) : (
              <>
                합 <span className="text-sm font-semibold text-fg tabular-nums">{source.total}</span>
              </>
            )}
          </span>
        </summary>
        <ul className="mt-0.5 mb-2 ml-1.5 space-y-1.5 border-l-2 border-line pl-3">
          {source.pieces.map(({ piece }) => (
            <ArmorPieceLine key={piece.id} piece={piece} skillId={skill.id} />
          ))}
          <li>
            {/* 한 부위만 붙었으면 그 방어구를 강조해서 연다 */}
            <button
              type="button"
              onClick={() =>
                onOpen({
                  kind: 'armor',
                  id: source.set.id,
                  ...(source.pieces.length === 1 ? { pieceId: source.pieces[0].piece.id } : {}),
                })
              }
              className="-ml-1 rounded px-1 text-xs text-accent hover:bg-surface-2 pointer-coarse:py-1.5 pointer-coarse:text-sm"
            >
              세트 전체 보기 →
            </button>
          </li>
        </ul>
      </details>
    </li>
  )
}

function ArmorPieceLine({ piece, skillId }: { piece: ArmorPiece; skillId: number }) {
  const db = useDb()
  return (
    <li className="text-xs">
      <div className="flex items-center gap-2">
        <span className="w-7 shrink-0 text-muted">{ARMOR_KIND_LABEL[piece.kind]}</span>
        <span className="min-w-0 flex-1 truncate text-sm">{nameOf(piece.name)}</span>
        <SlotList slots={piece.slots.map((level) => ({ kind: 'armor', level }))} size="sm" empty="" />
      </div>
      <div className="pl-9">
        {piece.skills.length > 0 ? (
          <PointsText points={piece.skills} skillId={skillId} />
        ) : (
          <span className="text-muted">스킬 없음</span>
        )}
        {piece.bonusSkillIds.map((id) => (
          <span key={id} className={cx('text-accent', id === skillId && 'font-medium')}>
            {' · '}
            {skillName(db, id)}
          </span>
        ))}
      </div>
    </li>
  )
}

function TalismanPanel({
  skill,
  fixed,
  mine,
}: {
  skill: Skill
  fixed: TalismanSource[]
  mine: CustomTalisman[]
}) {
  return (
    <Panel title="호석">
      <div className="space-y-4">
        {fixed.length > 0 && (
          <TalismanSection title="제작 호석" count={fixed.length}>
            {fixed.map(({ talisman, hr100 }) => (
              <li key={talisman.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 py-1.5">
                <span className="text-sm">{nameOf(talisman.name)}</span>
                {hr100 && <Badge>HR 100</Badge>}
                <span className="ml-auto text-xs">
                  <PointsText points={talisman.skills} skillId={skill.id} />
                </span>
              </li>
            ))}
          </TalismanSection>
        )}
        {mine.length > 0 && (
          <TalismanSection title="내 호석" count={mine.length}>
            {mine.map((talisman) => (
              <li key={talisman.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 py-1.5">
                <span className="text-sm">{talisman.name || '내 호석'}</span>
                <SlotList slots={talisman.slots} size="sm" empty="" />
                <span className="ml-auto text-xs">
                  <PointsText points={talisman.skills} skillId={skill.id} />
                </span>
              </li>
            ))}
          </TalismanSection>
        )}
      </div>
    </Panel>
  )
}

function TalismanSection({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <section>
      <SectionTitle aside={`${count}개`}>{title}</SectionTitle>
      <ul className="divide-y divide-line">{children}</ul>
    </section>
  )
}
