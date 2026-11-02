import { useCallback, useMemo, useState } from 'react'
import { Combobox } from '../../components/Combobox'
import { SelectBox } from '../../components/controls'
import { Segmented } from '../../components/ui'
import { nameOf } from '../../data/db'
import { ELEMENT_LABEL, WEAPON_KIND_LABEL } from '../../data/labels'
import { ELEMENTS, type Element, type Weapon, type WeaponKind } from '../../data/types'
import { useDb } from '../../state/context'
import {
  BASE_MAX,
  BASE_MIN,
  CALC_WEAPON_KINDS,
  weaponElement,
  type ElementCalcState,
} from './elementCalcState'

const MODE_OPTIONS: { value: ElementCalcState['mode']; label: string }[] = [
  { value: 'db', label: '무기 선택' },
  { value: 'custom', label: '직접 입력' },
]
const ELEMENT_OPTIONS = ELEMENTS.map((e) => ({ value: e, label: ELEMENT_LABEL[e] }))

const getKey = (w: Weapon) => w.id
const getLabel = (w: Weapon) => nameOf(w.name)

function elementText(weapon: Weapon): string {
  const element = weaponElement(weapon)
  return element ? `${ELEMENT_LABEL[element.element]} ${element.value}` : ''
}

/**
 * 계산할 무기: 목록에서 고르거나(속성이 있는 무기만) 무기 종류·속성·기본 속성치를 직접 넣는다.
 * 직접 입력은 아티어 무기처럼 데이터에 속성치가 없는 무기나 복원 강화로 속성치를 올린 무기에 쓴다.
 */
export function ElementWeaponInput({
  state,
  onChange,
}: {
  state: ElementCalcState
  onChange: (patch: Partial<ElementCalcState>) => void
}) {
  const db = useDb()
  const weapon = state.mode === 'db' && state.weaponId !== null ? (db.weapons.get(state.weaponId) ?? null) : null
  const kind = weapon?.kind ?? state.kind

  const weapons = useMemo(
    () =>
      db.data.weapons
        .filter((w) => w.kind === kind && weaponElement(w))
        .sort((a, b) => b.rarity - a.rarity || a.id - b.id),
    [db, kind],
  )
  const getSearchText = useCallback(
    (w: Weapon) => [w.name.ko, w.name.en, w.name.ja, ELEMENT_LABEL[weaponElement(w)!.element]],
    [],
  )
  const renderOption = useCallback(
    (w: Weapon) => (
      <span className="flex items-center justify-between gap-2">
        <span className="truncate">{nameOf(w.name)}</span>
        <span className="shrink-0 text-xs text-muted tabular-nums">
          {elementText(w)} · 레어도 {w.rarity}
        </span>
      </span>
    ),
    [],
  )

  const changeMode = (mode: ElementCalcState['mode']) => {
    if (mode === state.mode) return
    // 목록에서 고른 무기의 종류·속성·속성치를 직접 입력의 처음 값으로 (복원 강화만큼 고쳐 쓰기 쉽게)
    const element = weapon ? weaponElement(weapon) : null
    if (mode === 'custom' && weapon && element) {
      onChange({ mode, kind: weapon.kind, element: element.element, base: element.value })
    } else onChange({ mode, kind })
  }
  const changeKind = (next: WeaponKind) => onChange(weapon && weapon.kind !== next ? { kind: next, weaponId: null } : { kind: next })

  return (
    <div className="space-y-2">
      <Segmented size="sm" value={state.mode} options={MODE_OPTIONS} onChange={changeMode} ariaLabel="무기 입력 방법" />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <SelectBox
          aria-label="무기 종류"
          value={kind}
          onChange={(e) => changeKind(e.target.value as WeaponKind)}
          className="sm:w-32 sm:shrink-0"
        >
          {CALC_WEAPON_KINDS.map((k) => (
            <option key={k} value={k}>
              {WEAPON_KIND_LABEL[k]}
            </option>
          ))}
        </SelectBox>
        {state.mode === 'db' ? (
          <Combobox
            items={weapons}
            value={weapon}
            onChange={(next) => onChange({ weaponId: next?.id ?? null })}
            getKey={getKey}
            getLabel={getLabel}
            getSearchText={getSearchText}
            renderOption={renderOption}
            placeholder={`${WEAPON_KIND_LABEL[kind]} 검색 (속성이 있는 무기)`}
            ariaLabel="무기"
            className="min-w-0 flex-1"
          />
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              value={state.element}
              options={ELEMENT_OPTIONS}
              onChange={(element: Element) => onChange({ element })}
              ariaLabel="속성"
            />
            <BaseInput value={state.base} onChange={(base) => onChange({ base })} />
          </div>
        )}
      </div>
      <p className="text-xs text-muted">
        {state.mode === 'custom'
          ? '기본 속성치는 장비 화면의 속성치예요 (스킬 효과 빼고, 아티어 무기는 부품·속성 강화로 올린 값까지).'
          : weapon
            ? `${elementText(weapon)} · 레어도 ${weapon.rarity}`
            : state.weaponId !== null
              ? '고른 무기가 지금 데이터에 없어요. 다시 골라 주세요.'
              : '아티어·거극 아티어 무기는 데이터에 속성치가 없어서 ‘직접 입력’으로 넣어요.'}
      </p>
    </div>
  )
}

/**
 * 기본 속성치 입력. 고치는 동안은 친 글자를 그대로 두고(다 지우고 새로 칠 수 있게) 숫자면 바로 계산에 넣는다.
 * 칸을 벗어나면 범위 안으로 맞춘 값을 보인다
 */
function BaseInput({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <label className="flex items-center gap-1.5 text-sm">
      <span className="text-xs text-muted">기본 속성치</span>
      <input
        type="number"
        inputMode="numeric"
        min={BASE_MIN}
        max={BASE_MAX}
        step={10}
        value={draft ?? String(value)}
        onChange={(e) => {
          setDraft(e.target.value)
          const next = Math.round(Number(e.target.value))
          if (e.target.value.trim() !== '' && Number.isFinite(next)) onChange(Math.min(BASE_MAX, Math.max(BASE_MIN, next)))
        }}
        onBlur={() => setDraft(null)}
        className="h-9 w-24 rounded-md border border-line bg-surface-2 px-2.5 text-sm text-fg tabular-nums focus:border-accent focus:outline-none pointer-coarse:h-10"
      />
    </label>
  )
}
