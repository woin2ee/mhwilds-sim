import { useCallback, useMemo, useState } from 'react'
import { Combobox } from '../../components/Combobox'
import { SkillChip } from '../../components/SkillChip'
import { SlotList } from '../../components/SlotBadge'
import { Segmented } from '../../components/ui'
import type { SlotUsage } from '../../core/calc'
import type { WeaponChoice } from '../../core/types'
import { nameOf } from '../../data/db'
import { signed, skillName, skillPointsText } from '../../data/format'
import { SPECIAL_LABEL, WEAPON_KIND_LABEL } from '../../data/labels'
import { WEAPON_KINDS, type SkillKind, type SlotLevel, type Weapon, type WeaponKind } from '../../data/types'
import { usePersistentState } from '../../lib/storage'
import { useAppState, useDb } from '../../state/context'
import { refitDecorations, setDecoration, setWeapon } from '../../core/buildUpdates'
import { SelectBox, SlotLevelSelect } from '../../components/controls'
import { DecorationSlots } from './DecorationSlots'
import { EquipmentRow, MissingItem } from './EquipmentRow'
import { toSlots } from './labels'
import { SkillPointEditor } from '../../components/SkillPointEditor'

type CustomWeapon = Extract<WeaponChoice, { type: 'custom' }>
type Mode = WeaponChoice['type']

const MODE_OPTIONS: { value: Mode; label: string }[] = [
  { value: 'db', label: '무기 선택' },
  { value: 'custom', label: '직접 입력' },
]
const WEAPON_SKILL_KINDS: SkillKind[] = ['weapon']
const EMPTY_CUSTOM: CustomWeapon = { type: 'custom', slots: [], skills: [] }

const isWeaponKind = (v: unknown): v is WeaponKind =>
  typeof v === 'string' && (WEAPON_KINDS as readonly string[]).includes(v)
const getKey = (w: Weapon) => w.id
const getLabel = (w: Weapon) => nameOf(w.name)

function specialsText(weapon: Weapon): string {
  return weapon.specials
    .map((s) => {
      const text = `${SPECIAL_LABEL[s.type] ?? s.type} ${s.value}`
      return s.hidden ? `(${text})` : text
    })
    .join(' ')
}

function statsText(weapon: Weapon): string {
  const parts = [`레어도 ${weapon.rarity}`, `공격 ${weapon.attack}`]
  if (weapon.affinity) parts.push(`회심 ${signed(weapon.affinity)}%`)
  const specials = specialsText(weapon)
  if (specials) parts.push(specials)
  if (weapon.defenseBonus) parts.push(`방어 +${weapon.defenseBonus}`)
  return parts.join(' · ')
}

export function WeaponRow({ usages }: { usages: readonly SlotUsage[] }) {
  const { db, manualBuild: build, setManualBuild } = useAppState()
  const [storedKind, setStoredKind] = usePersistentState<WeaponKind>(
    'manual-weapon-kind:v1',
    'great-sword',
    isWeaponKind,
  )
  const [preferredMode, setPreferredMode] = useState<Mode>('db')
  const choice = build.weapon ?? null
  const mode: Mode = choice ? choice.type : preferredMode
  const weapon = choice?.type === 'db' ? (db.weapons.get(choice.id) ?? null) : null
  const kind = weapon?.kind ?? storedKind

  const weapons = useMemo(
    () => db.data.weapons.filter((w) => w.kind === kind).sort((a, b) => b.rarity - a.rarity || a.id - b.id),
    [db, kind],
  )
  const getSearchText = useCallback(
    (w: Weapon) => [w.name.ko, w.name.en, w.name.ja, ...w.skills.map((p) => skillName(db, p.skillId))],
    [db],
  )
  const renderOption = useCallback(
    (w: Weapon) => (
      <span className="flex flex-col gap-0.5">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate">{nameOf(w.name)}</span>
          <SlotList slots={toSlots(w.slots, 'weapon')} size="sm" empty="" />
        </span>
        <span className="truncate text-xs text-muted">
          {statsText(w)}
          {w.skills.length > 0 && ` · ${skillPointsText(db, w.skills)}`}
        </span>
      </span>
    ),
    [db],
  )

  const changeMode = (next: Mode) => {
    setPreferredMode(next)
    if (next === mode) return
    if (next === 'custom') {
      // 지금 고른 무기의 슬롯·스킬을 복사해서 시작 (아티아 무기 보너스 반영 등)
      const custom: CustomWeapon = weapon
        ? { type: 'custom', slots: [...weapon.slots], skills: weapon.skills.map((p) => ({ ...p })) }
        : EMPTY_CUSTOM
      setManualBuild((b) => refitDecorations(db, { ...b, weapon: custom }, 'weapon'))
    } else {
      setManualBuild((b) => setWeapon(b, null))
    }
  }
  const changeKind = (next: WeaponKind) => {
    setStoredKind(next)
    if (weapon && weapon.kind !== next) setManualBuild((b) => setWeapon(b, null))
  }

  return (
    <EquipmentRow equip="weapon">
      <div className="mb-2">
        <Segmented size="sm" value={mode} options={MODE_OPTIONS} onChange={changeMode} />
      </div>
      {mode === 'db' ? (
        <>
          <div className="flex flex-col gap-2 sm:flex-row">
            <SelectBox
              aria-label="무기 종류"
              value={kind}
              onChange={(e) => changeKind(e.target.value as WeaponKind)}
              className="sm:w-32 sm:shrink-0"
            >
              {WEAPON_KINDS.map((k) => (
                <option key={k} value={k}>
                  {WEAPON_KIND_LABEL[k]}
                </option>
              ))}
            </SelectBox>
            <Combobox
              items={weapons}
              value={weapon}
              onChange={(w) => setManualBuild((b) => setWeapon(b, w ? { type: 'db', id: w.id } : null))}
              getKey={getKey}
              getLabel={getLabel}
              getSearchText={getSearchText}
              renderOption={renderOption}
              placeholder={`${WEAPON_KIND_LABEL[kind]} 검색 (이름·스킬)`}
              ariaLabel="무기"
              className="flex-1"
            />
          </div>
          {choice?.type === 'db' && !weapon && (
            <MissingItem what="무기" onClear={() => setManualBuild((b) => setWeapon(b, null))} />
          )}
          {weapon && <WeaponInfo weapon={weapon} />}
        </>
      ) : (
        <CustomWeaponEditor
          weapon={choice?.type === 'custom' ? choice : EMPTY_CUSTOM}
          onChange={(next) => setManualBuild((b) => refitDecorations(db, { ...b, weapon: next }, 'weapon'))}
        />
      )}
      <DecorationSlots
        usages={usages}
        onChange={(index, id) => setManualBuild((b) => setDecoration(b, 'weapon', index, id))}
      />
    </EquipmentRow>
  )
}

function WeaponInfo({ weapon }: { weapon: Weapon }) {
  const db = useDb()
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
      <span>{statsText(weapon)}</span>
      {weapon.skills.map((p) => (
        <SkillChip key={p.skillId} name={skillName(db, p.skillId)} level={p.level} />
      ))}
    </div>
  )
}

function CustomWeaponEditor({ weapon, onChange }: { weapon: CustomWeapon; onChange: (next: CustomWeapon) => void }) {
  // 슬롯은 항상 레벨 내림차순으로 저장한다 (DB 무기와 같은 규칙)
  const setSlot = (index: number, level: number) => {
    const slots = [0, 1, 2]
      .map((i) => (i === index ? level : (weapon.slots[i] ?? 0)))
      .filter((l) => l > 0)
      .sort((a, b) => b - a) as SlotLevel[]
    onChange({ ...weapon, slots })
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">무기 슬롯</span>
        {[0, 1, 2].map((i) => (
          <SlotLevelSelect
            key={i}
            allowEmpty
            value={weapon.slots[i] ?? 0}
            onChange={(level) => setSlot(i, level)}
            ariaLabel={`무기 슬롯 ${i + 1}`}
          />
        ))}
      </div>
      <SkillPointEditor
        points={weapon.skills}
        kinds={WEAPON_SKILL_KINDS}
        max={3}
        onChange={(skills) => onChange({ ...weapon, skills })}
        addPlaceholder="무기 스킬 추가"
      />
      <p className="text-xs text-muted">DB에 없는 무기나 아티아 무기처럼 슬롯·스킬이 다른 무기를 직접 입력합니다.</p>
    </div>
  )
}
