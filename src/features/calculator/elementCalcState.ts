// 속성치 계산기의 입력값 (localStorage, 기기마다 따로 — 동기화하지 않는 화면 상태)
import { ELEMENT_BUFFS, type ElementBuffId } from '../../core/elementCalc'
import type { GameDb } from '../../data/db'
import { ELEMENTS, WEAPON_KINDS, type Element, type Weapon, type WeaponKind } from '../../data/types'
import { isObject } from '../../state/storedValues'

export const ELEMENT_CALC_KEY = 'element-calc:v1'

/** 계산기에서 고를 수 있는 무기 종류. 보우건은 속성탄마다 속성치·상한 계산이 달라서 뺀다 */
export const CALC_WEAPON_KINDS = WEAPON_KINDS.filter((k) => k !== 'light-bowgun' && k !== 'heavy-bowgun')

export interface ElementCalcState {
  /** 무기를 목록에서 고르는지(db), 속성·기본 속성치를 직접 넣는지(custom) */
  mode: 'db' | 'custom'
  /** db: 고른 무기 id */
  weaponId: number | null
  /** 무기 종류 (db 는 목록 종류, 고른 무기가 있으면 그 무기의 종류) */
  kind: WeaponKind
  /** custom: 속성과 기본 속성치 */
  element: Element
  base: number
  /** 켠 버프의 레벨 (없거나 0 이면 끔) */
  levels: Partial<Record<ElementBuffId, number>>
  /** 내성 변환에 쓰는 내성 (장비 화면의 값) */
  resistances?: Partial<Record<Element, number>>
  /** 쌓인 단계 (속성 흡수) */
  stages?: Partial<Record<ElementBuffId, number>>
}

export const DEFAULT_ELEMENT_CALC: ElementCalcState = {
  mode: 'custom',
  weaponId: null,
  kind: 'great-sword',
  element: 'fire',
  base: 300,
  levels: {},
}

/** 기본 속성치로 넣을 수 있는 범위 (지금 데이터의 무기는 70~700) */
export const BASE_MIN = 0
export const BASE_MAX = 2000

const BUFF_IDS = new Set<string>(ELEMENT_BUFFS.map((b) => b.id))

const isNumberRecord = (v: unknown, keys: (key: string) => boolean): boolean =>
  isObject(v) && Object.entries(v).every(([k, n]) => keys(k) && typeof n === 'number' && Number.isFinite(n))

export function isElementCalcState(v: unknown): v is ElementCalcState {
  return (
    isObject(v) &&
    (v.mode === 'db' || v.mode === 'custom') &&
    (v.weaponId === null || typeof v.weaponId === 'number') &&
    (CALC_WEAPON_KINDS as readonly unknown[]).includes(v.kind) &&
    (ELEMENTS as readonly unknown[]).includes(v.element) &&
    typeof v.base === 'number' &&
    Number.isFinite(v.base) &&
    isNumberRecord(v.levels, (k) => BUFF_IDS.has(k)) &&
    (v.resistances === undefined || isNumberRecord(v.resistances, (k) => (ELEMENTS as readonly string[]).includes(k))) &&
    (v.stages === undefined || isNumberRecord(v.stages, (k) => BUFF_IDS.has(k)))
  )
}

/** 무기의 속성 (불·물·번개·얼음·용). 상태 이상 무기·무속성 무기는 null */
export function weaponElement(weapon: Weapon): { element: Element; value: number } | null {
  for (const s of weapon.specials) {
    if ((ELEMENTS as readonly string[]).includes(s.type)) return { element: s.type as Element, value: s.value }
  }
  return null
}

/** 계산에 쓰는 무기 종류·속성·기본 속성치. 목록에서 고른 무기가 없으면(데이터에서 사라짐 포함) null */
export function calcWeapon(
  db: GameDb,
  state: ElementCalcState,
): { kind: WeaponKind; element: Element; base: number; weapon: Weapon | null } | null {
  if (state.mode === 'custom') return { kind: state.kind, element: state.element, base: state.base, weapon: null }
  const weapon = state.weaponId === null ? undefined : db.weapons.get(state.weaponId)
  const element = weapon ? weaponElement(weapon) : null
  if (!weapon || !element) return null
  return { kind: weapon.kind, element: element.element, base: element.value, weapon }
}
