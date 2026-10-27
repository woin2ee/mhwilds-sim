import { useMemo } from 'react'
import { SectionTitle } from '../../components/controls'
import { SkillChip } from '../../components/SkillChip'
import { SlotList } from '../../components/SlotBadge'
import { Badge, Panel, Toggle } from '../../components/ui'
import { setArmor } from '../../core/buildUpdates'
import { computeBuild, type BonusTotal } from '../../core/calc'
import { armorDefense, armorSlots, canTranscend, TRANSCEND_DEFENSE_BONUS } from '../../core/transcend'
import { emptyBuild } from '../../core/types'
import { nameOf, otherNamesOf } from '../../data/db'
import { signed, skillName } from '../../data/format'
import { ARMOR_KIND_LABEL, ELEMENT_LABEL } from '../../data/labels'
import { ELEMENTS, type ArmorPiece, type SlotLevel } from '../../data/types'
import { cx } from '../../lib/cx'
import { usePersistentState } from '../../lib/storage'
import { useDb } from '../../state/context'
import type { ArmorSetEntry } from './armorLookup'
import type { DictionaryEntry } from './dictionarySearch'

const isBoolean = (v: unknown): v is boolean => typeof v === 'boolean'
const toArmorSlots = (levels: readonly SlotLevel[]) => levels.map((level) => ({ kind: 'armor' as const, level }))

/**
 * 사전의 방어구 세트: 부위마다 스킬·슬롯·방어력·내성, 세트 전체를 꼈을 때의 합계(computeBuild).
 * 스킬 칩을 누르면 그 스킬을 사전에서 연다. highlightId 는 방어구 이름으로 찾은 그 방어구
 */
export function ArmorSetDetail({
  entry,
  highlightId,
  onOpen,
}: {
  entry: ArmorSetEntry
  highlightId?: number
  onOpen: (entry: DictionaryEntry) => void
}) {
  const db = useDb()
  // 초월은 HR 100 부터라 처음엔 끄고, 켜 두면 다른 세트에서도 켠 채로 본다
  const [transcend, setTranscend] = usePersistentState('dictionary-transcend:v1', false, isBoolean)
  const transcendable = entry.pieces.some(canTranscend)
  const applied = transcend && transcendable
  const summary = useMemo(() => {
    let build = emptyBuild()
    for (const piece of entry.pieces) {
      build = setArmor(build, piece.kind, { id: piece.id, transcend: applied && canTranscend(piece) })
    }
    return computeBuild(db, build)
  }, [db, entry, applied])
  const openSkill = (id: number) => onOpen({ kind: 'skill', id })
  const others = otherNamesOf(entry.set.name)
  const slotsChange = entry.pieces.some((p) => armorSlots(p, true).join() !== p.slots.join())

  return (
    <>
      <Panel>
        <h2 className="text-lg leading-snug font-bold">{nameOf(entry.set.name)}</h2>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          <span>
            방어구 · 레어도 {entry.rarity} · {entry.lowRank ? '하위' : '상위'} 랭크
          </span>
          {entry.hr100 && <Badge>HR 100</Badge>}
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
        {transcendable && (
          <div className="mt-3">
            <Toggle
              checked={transcend}
              onChange={setTranscend}
              label="초월 적용"
              description={`${slotsChange ? '슬롯이 늘고 ' : '슬롯은 그대로, '}최대 방어력 +${TRANSCEND_DEFENSE_BONUS[entry.rarity]} (HR 100 부터)`}
            />
          </div>
        )}
      </Panel>

      <Panel
        title={
          <span>
            부위 <span className="font-normal text-muted">{entry.pieces.length}개</span>
          </span>
        }
      >
        <ul className="-my-2.5 divide-y divide-line">
          {entry.pieces.map((piece) => (
            <PieceRow
              key={piece.id}
              piece={piece}
              transcend={applied}
              highlighted={piece.id === highlightId}
              onOpenSkill={openSkill}
            />
          ))}
        </ul>
      </Panel>

      {entry.pieces.length > 1 && (
        <Panel
          title={
            <span>
              세트 전체 <span className="font-normal text-muted">{entry.pieces.length}부위를 모두 꼈을 때</span>
            </span>
          }
        >
          <div className="space-y-4">
            <section>
              <SectionTitle>스킬</SectionTitle>
              <div className="flex flex-wrap gap-1 pointer-coarse:gap-1.5">
                {summary.skills.map((s) => (
                  <SkillChip
                    key={s.skillId}
                    name={skillName(db, s.skillId)}
                    level={s.level}
                    maxLevel={s.maxLevel}
                    title="눌러서 스킬 보기"
                    onClick={() => openSkill(s.skillId)}
                  />
                ))}
                {summary.skills.length === 0 && <span className="text-xs text-muted">없음</span>}
              </div>
            </section>
            {summary.bonuses.length > 0 && (
              <section>
                <SectionTitle>시리즈 · 그룹 스킬</SectionTitle>
                <ul className="space-y-1.5">
                  {summary.bonuses.map((bonus) => (
                    <BonusLine key={bonus.skillId} bonus={bonus} onOpenSkill={openSkill} />
                  ))}
                </ul>
              </section>
            )}
            <section className="grid grid-cols-2 gap-3">
              <div>
                <SectionTitle>방어력</SectionTitle>
                <p className="text-sm tabular-nums">
                  <span className="font-semibold">{summary.defense.max}</span>
                  <span className="text-xs text-muted"> (기본 {summary.defense.base})</span>
                </p>
              </div>
              <div className="min-w-0">
                <SectionTitle aside={`${summary.freeSlots.length}칸`}>슬롯</SectionTitle>
                <SlotList slots={summary.freeSlots} empty="없음" sorted />
              </div>
            </section>
            <section>
              <SectionTitle>내성</SectionTitle>
              <div className="grid grid-cols-5 gap-1 text-center">
                {ELEMENTS.map((element) => {
                  const value = summary.resistances[element]
                  return (
                    <div key={element} className="rounded-md bg-surface-2 py-1.5">
                      <div className="text-[11px] text-muted">{ELEMENT_LABEL[element]}</div>
                      <div
                        className={cx(
                          'text-sm font-semibold tabular-nums',
                          value > 0 && 'text-good',
                          value < 0 && 'text-bad',
                        )}
                      >
                        {signed(value)}
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          </div>
        </Panel>
      )}
    </>
  )
}

function PieceRow({
  piece,
  transcend,
  highlighted,
  onOpenSkill,
}: {
  piece: ArmorPiece
  transcend: boolean
  highlighted: boolean
  onOpenSkill: (skillId: number) => void
}) {
  const db = useDb()
  const applied = transcend && canTranscend(piece)
  const defense = armorDefense(piece, applied)
  const resistances = ELEMENTS.filter((e) => piece.resistances[e] !== 0)
    .map((e) => `${ELEMENT_LABEL[e]}${signed(piece.resistances[e])}`)
    .join(' ')
  return (
    <li aria-current={highlighted || undefined} className={cx('py-2.5', highlighted && '-mx-4 bg-accent/10 px-4')}>
      <div className="flex items-center gap-2">
        <span className="w-7 shrink-0 text-xs text-muted">{ARMOR_KIND_LABEL[piece.kind]}</span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{nameOf(piece.name)}</span>
        <SlotList slots={toArmorSlots(armorSlots(piece, applied))} empty="슬롯 없음" />
      </div>
      <div className="mt-1 flex flex-wrap gap-1 pl-9 pointer-coarse:gap-1.5">
        {piece.skills.map((p) => (
          <SkillChip
            key={p.skillId}
            name={skillName(db, p.skillId)}
            level={p.level}
            title="눌러서 스킬 보기"
            onClick={() => onOpenSkill(p.skillId)}
          />
        ))}
        {piece.bonusSkillIds.map((id) => (
          <SkillChip
            key={id}
            tone="bonus"
            name={skillName(db, id)}
            title="눌러서 스킬 보기"
            onClick={() => onOpenSkill(id)}
          />
        ))}
        {piece.skills.length + piece.bonusSkillIds.length === 0 && <span className="text-xs text-muted">스킬 없음</span>}
      </div>
      <p className="mt-1 pl-9 text-xs text-muted tabular-nums">
        방어 {defense.base}/{defense.max}
        {resistances && ` · ${resistances}`}
      </p>
    </li>
  )
}

/** 세트 전체의 시리즈·그룹 스킬: 부위 수와 발동 단계 (미발동이면 다음 단계까지 필요한 부위 수) */
function BonusLine({ bonus, onOpenSkill }: { bonus: BonusTotal; onOpenSkill: (skillId: number) => void }) {
  const db = useDb()
  const skill = db.skills.get(bonus.skillId)
  const rank = bonus.level > 0 ? skill?.ranks.find((r) => r.level === bonus.level) : undefined
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
      <SkillChip
        tone="bonus"
        name={skillName(db, bonus.skillId)}
        level={bonus.pieces}
        title="눌러서 스킬 보기"
        onClick={() => onOpenSkill(bonus.skillId)}
      />
      <span className={cx(rank ? 'text-fg' : 'text-muted')}>
        {rank ? (rank.name ? nameOf(rank.name) : `${bonus.level}단계`) : '미발동'}
      </span>
      {bonus.nextPieces !== null && <span className="text-muted">다음 {bonus.nextPieces}부위</span>}
    </li>
  )
}
