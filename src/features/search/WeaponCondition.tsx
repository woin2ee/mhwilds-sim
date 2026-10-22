import { useMemo } from 'react'
import { Combobox } from '../../components/Combobox'
import { SkillSelect } from '../../components/SkillSelect'
import { SlotList } from '../../components/SlotBadge'
import { Button, LevelSelect, Segmented } from '../../components/ui'
import type { Slot } from '../../core/types'
import { nameOf } from '../../data/db'
import { skillPointsText } from '../../data/format'
import { SPECIAL_LABEL, WEAPON_KIND_LABEL } from '../../data/labels'
import { WEAPON_KINDS, type SkillKind, type SlotLevel, type Weapon } from '../../data/types'
import { useAppState } from '../../state/context'
import type { SearchConditions, WeaponMode } from './conditions'

const MODE_OPTIONS: { value: WeaponMode; label: string }[] = [
  { value: 'none', label: '미지정' },
  { value: 'db', label: '무기 선택' },
  { value: 'custom', label: '슬롯 직접 지정' },
]
const WEAPON_SKILL_KINDS: readonly SkillKind[] = ['weapon']

const getKey = (w: Weapon) => w.id
const getLabel = (w: Weapon) => nameOf(w.name)
const getSearchText = (w: Weapon) => [w.name.ko, w.name.en, w.name.ja]
const weaponSlots = (w: Weapon): Slot[] => w.slots.map((level) => ({ kind: 'weapon', level }))

function weaponSpecials(w: Weapon): string {
  return w.specials.map((s) => `${SPECIAL_LABEL[s.type] ?? s.type} ${s.value}${s.hidden ? '(숨김)' : ''}`).join(' ')
}

export function WeaponCondition({
  cond,
  onChange,
}: {
  cond: SearchConditions
  onChange: (patch: Partial<SearchConditions>) => void
}) {
  const { db, manualBuild } = useAppState()
  const weapons = useMemo(
    () =>
      db.data.weapons
        .filter((w) => w.kind === cond.weaponKind)
        .sort((a, b) => b.rarity - a.rarity || a.name.ko.localeCompare(b.name.ko, 'ko')),
    [db, cond.weaponKind],
  )
  const selected = cond.weaponId === null ? null : (db.weapons.get(cond.weaponId) ?? null)
  const skillIds = useMemo(() => cond.customWeaponSkills.map((s) => s.skillId), [cond.customWeaponSkills])

  const importFromManual = () => {
    const w = manualBuild.weapon
    if (!w) return
    if (w.type === 'db') {
      const weapon = db.weapons.get(w.id)
      if (weapon) onChange({ weaponMode: 'db', weaponKind: weapon.kind, weaponId: weapon.id })
    } else {
      onChange({
        weaponMode: 'custom',
        customWeaponSlots: [0, 1, 2].map((i) => w.slots[i] ?? 0),
        customWeaponSkills: w.skills,
      })
    }
  }

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented size="sm" value={cond.weaponMode} options={MODE_OPTIONS} onChange={(weaponMode) => onChange({ weaponMode })} />
        <Button size="sm" variant="ghost" disabled={!manualBuild.weapon} onClick={importFromManual}>
          수동 세팅의 무기 가져오기
        </Button>
      </div>

      {cond.weaponMode === 'none' && (
        <p className="text-xs text-muted">무기 슬롯·무기 스킬 없이 찾아요. 무기 스킬을 찾으려면 무기를 지정하세요.</p>
      )}

      {cond.weaponMode === 'db' && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <select
              aria-label="무기 종류"
              value={cond.weaponKind}
              onChange={(e) => onChange({ weaponKind: e.target.value as SearchConditions['weaponKind'], weaponId: null })}
              className="h-9 shrink-0 rounded-md border border-line bg-surface-2 px-2 text-sm"
            >
              {WEAPON_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {WEAPON_KIND_LABEL[kind]}
                </option>
              ))}
            </select>
            <Combobox
              className="flex-1"
              items={weapons}
              value={selected}
              onChange={(w) => onChange({ weaponId: w?.id ?? null })}
              getKey={getKey}
              getLabel={getLabel}
              getSearchText={getSearchText}
              placeholder="무기 검색"
              ariaLabel="무기 선택"
              renderOption={(w) => (
                <span className="flex flex-col gap-0.5">
                  <span className="flex items-center gap-2">
                    <span className="flex-1 truncate">{nameOf(w.name)}</span>
                    <span className="text-xs text-muted">R{w.rarity}</span>
                    <SlotList slots={weaponSlots(w)} size="sm" />
                  </span>
                  {w.skills.length > 0 && (
                    <span className="truncate text-xs text-muted">{skillPointsText(db, w.skills)}</span>
                  )}
                </span>
              )}
            />
          </div>
          {selected && (
            <div className="space-y-1 rounded-md bg-surface-2 px-2.5 py-2 text-xs">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted">
                <span>공격력 {selected.attack}</span>
                {selected.affinity !== 0 && <span>회심률 {selected.affinity}%</span>}
                {selected.specials.length > 0 && <span>{weaponSpecials(selected)}</span>}
                <span className="inline-flex items-center gap-1">
                  슬롯 <SlotList slots={weaponSlots(selected)} size="sm" />
                </span>
              </div>
              {selected.skills.length > 0 && <div>{skillPointsText(db, selected.skills)}</div>}
            </div>
          )}
        </div>
      )}

      {cond.weaponMode === 'custom' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-xs text-muted">무기 슬롯</span>
            {cond.customWeaponSlots.map((level, i) => (
              <select
                key={i}
                aria-label={`무기 슬롯 ${i + 1}`}
                value={level}
                onChange={(e) =>
                  onChange({
                    customWeaponSlots: cond.customWeaponSlots.map((l, j) => (j === i ? Number(e.target.value) : l)),
                  })
                }
                className="h-8 rounded-md border border-line bg-surface-2 px-1.5 text-sm"
              >
                <option value={0}>없음</option>
                {([1, 2, 3] as SlotLevel[]).map((l) => (
                  <option key={l} value={l}>
                    Lv{l}
                  </option>
                ))}
              </select>
            ))}
          </div>
          {cond.customWeaponSkills.length > 0 && (
            <ul className="space-y-1.5">
              {cond.customWeaponSkills.map((point) => {
                const skill = db.skills.get(point.skillId)
                if (!skill) return null
                return (
                  <li key={point.skillId} className="flex items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">{nameOf(skill.name)}</span>
                    <LevelSelect
                      value={point.level}
                      max={skill.maxLevel}
                      ariaLabel={`${nameOf(skill.name)} 레벨`}
                      onChange={(level) =>
                        onChange({
                          customWeaponSkills: cond.customWeaponSkills.map((s) =>
                            s.skillId === point.skillId ? { ...s, level } : s,
                          ),
                        })
                      }
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`${nameOf(skill.name)} 제거`}
                      onClick={() =>
                        onChange({ customWeaponSkills: cond.customWeaponSkills.filter((s) => s.skillId !== point.skillId) })
                      }
                    >
                      ×
                    </Button>
                  </li>
                )
              })}
            </ul>
          )}
          <SkillSelect
            value={null}
            kinds={WEAPON_SKILL_KINDS}
            hiddenIds={skillIds}
            placeholder="무기에 붙은 스킬 추가 (선택)"
            ariaLabel="무기 스킬 추가"
            onChange={(skill) =>
              skill && onChange({ customWeaponSkills: [...cond.customWeaponSkills, { skillId: skill.id, level: 1 }] })
            }
          />
        </div>
      )}
    </div>
  )
}
