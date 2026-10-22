import { useCallback, useMemo } from 'react'
import { Combobox } from '../../components/Combobox'
import { SkillChip } from '../../components/SkillChip'
import { SlotList } from '../../components/SlotBadge'
import { Toggle } from '../../components/ui'
import type { SlotUsage } from '../../core/calc'
import { armorDefense, armorSlots, canTranscend, TRANSCEND_DEFENSE_BONUS } from '../../core/transcend'
import { nameOf, type GameDb } from '../../data/db'
import { signed, skillName, skillPointsText } from '../../data/format'
import { ARMOR_KIND_LABEL, ELEMENT_LABEL } from '../../data/labels'
import { ELEMENTS, type ArmorKind, type ArmorPiece } from '../../data/types'
import { useAppState, useDb } from '../../state/context'
import { refitDecorations, setArmor, setDecoration } from '../../core/buildUpdates'
import { DecorationSlots } from './DecorationSlots'
import { EquipmentRow, MissingItem } from './EquipmentRow'
import { toSlots } from './labels'

const getKey = (a: ArmorPiece) => a.id
const getLabel = (a: ArmorPiece) => nameOf(a.name)
const groupBy = (a: ArmorPiece) => `레어도 ${a.rarity}`

/** 방어구가 속한 세트의 시리즈/그룹 스킬 이름 */
function bonusNames(db: GameDb, piece: ArmorPiece): string[] {
  const { setSkillId, groupSkillId } = db.bonusesOf(piece)
  return [setSkillId, groupSkillId].flatMap((id) => (id === null ? [] : [skillName(db, id)]))
}

export function ArmorRow({ kind, usages }: { kind: ArmorKind; usages: readonly SlotUsage[] }) {
  const { db, manualBuild: build, setManualBuild } = useAppState()
  const choice = build.armor[kind] ?? null
  const piece = choice ? (db.armor.get(choice.id) ?? null) : null

  const items = useMemo(
    () => [...db.armorByKind[kind]].sort((a, b) => b.rarity - a.rarity || a.id - b.id),
    [db, kind],
  )
  const getSearchText = useCallback(
    (a: ArmorPiece) => [
      a.name.ko,
      a.name.en,
      a.name.ja,
      db.armorSets.get(a.setId)?.name.ko ?? '',
      ...a.skills.map((p) => skillName(db, p.skillId)),
      ...bonusNames(db, a),
    ],
    [db],
  )
  const renderOption = useCallback((a: ArmorPiece) => <ArmorOption piece={a} />, [])

  const select = (next: ArmorPiece | null) =>
    setManualBuild((b) => {
      // 직전 방어구를 초월해 두었다면 새 방어구에도 초월을 유지
      const keepTranscend = Boolean(b.armor[kind]?.transcend)
      return setArmor(b, kind, next ? { id: next.id, transcend: keepTranscend && canTranscend(next) } : null)
    })
  const toggleTranscend = (transcend: boolean) =>
    setManualBuild((b) => {
      const current = b.armor[kind]
      if (!current) return b
      return refitDecorations(db, { ...b, armor: { ...b.armor, [kind]: { ...current, transcend } } }, kind)
    })

  return (
    <EquipmentRow label={ARMOR_KIND_LABEL[kind]}>
      <Combobox
        items={items}
        value={piece}
        onChange={select}
        getKey={getKey}
        getLabel={getLabel}
        getSearchText={getSearchText}
        renderOption={renderOption}
        groupBy={groupBy}
        placeholder="방어구 검색 (이름·스킬·시리즈)"
        ariaLabel={`${ARMOR_KIND_LABEL[kind]} 방어구`}
        maxResults={300}
      />
      {choice && !piece && <MissingItem what="방어구" onClear={() => select(null)} />}
      {choice && piece && <ArmorInfo piece={piece} transcend={choice.transcend} onTranscend={toggleTranscend} />}
      <DecorationSlots
        usages={usages}
        onChange={(index, id) => setManualBuild((b) => setDecoration(b, kind, index, id))}
      />
    </EquipmentRow>
  )
}

function ArmorOption({ piece }: { piece: ArmorPiece }) {
  const db = useDb()
  const bonuses = bonusNames(db, piece)
  return (
    <span className="flex flex-col gap-0.5">
      <span className="flex items-center justify-between gap-2">
        <span className="truncate">{nameOf(piece.name)}</span>
        <SlotList slots={toSlots(piece.slots, 'armor')} size="sm" empty="" />
      </span>
      <span className="truncate text-xs text-muted">
        {skillPointsText(db, piece.skills) || '스킬 없음'}
        {bonuses.length > 0 && <span className="text-accent"> · {bonuses.join(' · ')}</span>}
      </span>
    </span>
  )
}

function ArmorInfo({
  piece,
  transcend,
  onTranscend,
}: {
  piece: ArmorPiece
  transcend: boolean
  onTranscend: (transcend: boolean) => void
}) {
  const db = useDb()
  const defense = armorDefense(piece, transcend)
  const resistances = ELEMENTS.filter((e) => piece.resistances[e] !== 0)
    .map((e) => `${ELEMENT_LABEL[e]}${signed(piece.resistances[e])}`)
    .join(' ')
  const { setSkillId, groupSkillId } = db.bonusesOf(piece)
  const transcendedSlots = armorSlots(piece, true)
  const slotsChange = transcendedSlots.join() !== piece.slots.join()

  return (
    <div className="mt-1.5 space-y-1.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
        <span className="mr-1">
          레어도 {piece.rarity} · 방어 {defense.base}/{defense.max}
          {resistances && ` · ${resistances}`}
        </span>
        {piece.skills.map((p) => (
          <SkillChip key={p.skillId} name={skillName(db, p.skillId)} level={p.level} />
        ))}
        {setSkillId !== null && <SkillChip tone="bonus" name={skillName(db, setSkillId)} title="시리즈 스킬" />}
        {groupSkillId !== null && <SkillChip tone="bonus" name={skillName(db, groupSkillId)} title="그룹 스킬" />}
      </div>
      {canTranscend(piece) && (
        <Toggle
          checked={transcend}
          onChange={onTranscend}
          label="초월"
          description={
            <span className="inline-flex flex-wrap items-center gap-1">
              최대 방어력 +{TRANSCEND_DEFENSE_BONUS[piece.rarity]}
              {slotsChange && (
                <>
                  {' '}· 슬롯 <SlotList slots={toSlots(piece.slots, 'armor')} size="sm" empty="없음" /> →{' '}
                  <SlotList slots={toSlots(transcendedSlots, 'armor')} size="sm" />
                </>
              )}
            </span>
          }
        />
      )}
    </div>
  )
}
