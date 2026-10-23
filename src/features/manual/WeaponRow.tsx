import { useCallback, useMemo, useState } from 'react'
import { Combobox } from '../../components/Combobox'
import { SkillChip } from '../../components/SkillChip'
import { SlotList } from '../../components/SlotBadge'
import { Segmented } from '../../components/ui'
import { WeaponBonusSkills } from '../../components/WeaponBonusSkills'
import type { SlotUsage } from '../../core/calc'
import { customWeaponChoice, dbWeaponChoice, gogmaSkillsOf, isGogmaArtian } from '../../core/gogmaArtian'
import type { WeaponChoice } from '../../core/types'
import { nameOf } from '../../data/db'
import { signed, skillName, skillPointsText } from '../../data/format'
import { GOGMA_ARTIAN_NAMES, SPECIAL_LABEL, WEAPON_KIND_LABEL } from '../../data/labels'
import { WEAPON_KINDS, type SkillKind, type SlotLevel, type Weapon, type WeaponKind } from '../../data/types'
import { usePersistentState } from '../../lib/storage'
import { useAppState, useDb } from '../../state/context'
import { refitDecorations, setDecoration, setWeapon } from '../../core/buildUpdates'
import { SelectBox, SlotLevelSelect } from '../../components/controls'
import { DecorationSlots } from './DecorationSlots'
import { EquipmentRow, MissingItem } from './EquipmentRow'
import { toSlots } from './labels'
import { SkillPointEditor } from '../../components/SkillPointEditor'
import type { DecorationFill } from './useDecorationFill'

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
  if (isGogmaArtian(weapon)) parts.unshift(nameOf(GOGMA_ARTIAN_NAMES))
  if (weapon.affinity) parts.push(`회심 ${signed(weapon.affinity)}%`)
  const specials = specialsText(weapon)
  if (specials) parts.push(specials)
  if (weapon.defenseBonus) parts.push(`방어 +${weapon.defenseBonus}`)
  return parts.join(' · ')
}

export function WeaponRow({ usages, fill }: { usages: readonly SlotUsage[]; fill: DecorationFill }) {
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
    (w: Weapon) => [
      w.name.ko,
      w.name.en,
      w.name.ja,
      // 거극 아티어 무기는 이름에 '거극 아티어'가 없어서 따로 붙인다
      ...(isGogmaArtian(w) ? Object.values(GOGMA_ARTIAN_NAMES) : []),
      ...w.skills.map((p) => skillName(db, p.skillId)),
    ],
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
      // 지금 고른 무기의 슬롯·스킬·거극 아티어 스킬을 복사해서 시작 (아티어 무기 보너스 반영 등)
      const custom: CustomWeapon = weapon
        ? customWeaponChoice([...weapon.slots], weapon.skills.map((p) => ({ ...p })), gogmaSkillsOf(db, choice))
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
  // 거극 아티어 무기끼리 바꾸면(격화 타입만 바꾸는 경우 등) 고른 시리즈·그룹 스킬을 그대로 둔다
  const selectWeapon = (next: Weapon | null) =>
    setManualBuild((b) => {
      if (!next) return setWeapon(b, null)
      return setWeapon(b, dbWeaponChoice(next.id, isGogmaArtian(next) ? gogmaSkillsOf(db, b.weapon) : undefined))
    })

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
              onChange={selectWeapon}
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
          {weapon && isGogmaArtian(weapon) && (
            <WeaponBonusSkills
              className="mt-2"
              value={gogmaSkillsOf(db, choice)}
              onChange={(skills) =>
                setManualBuild((b) =>
                  b.weapon?.type === 'db' ? { ...b, weapon: dbWeaponChoice(b.weapon.id, skills) } : b,
                )
              }
            />
          )}
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
        fill={fill}
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
  const db = useDb()
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
      <WeaponBonusSkills
        value={gogmaSkillsOf(db, weapon)}
        onChange={(gogma) => onChange(customWeaponChoice(weapon.slots, weapon.skills, gogma))}
      />
      <p className="text-xs text-muted">
        DB에 없는 무기나 아티어 무기처럼 슬롯·스킬이 다른 무기를 직접 입력합니다. 거극 아티어 무기는 '무기 선택'에서
        '거극'으로 찾아 고를 수도 있습니다.
      </p>
    </div>
  )
}
