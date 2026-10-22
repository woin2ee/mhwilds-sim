import { ARMOR_KINDS, type ArmorKind, type DecorationKind, type SkillPoint, type SlotLevel } from '../data/types'

export type SlotKind = DecorationKind

export interface Slot {
  kind: SlotKind
  level: SlotLevel
}

/** 장비 칸: 무기, 방어구 5부위, 호석 */
export type EquipKey = 'weapon' | ArmorKind | 'talisman'
export const EQUIP_KEYS: readonly EquipKey[] = ['weapon', ...ARMOR_KINDS, 'talisman']

export type WeaponChoice =
  | { type: 'db'; id: number }
  /** DB에 없는 무기를 슬롯/스킬만 직접 입력 (예: 아티아 무기 보너스 반영) */
  | { type: 'custom'; slots: SlotLevel[]; skills: SkillPoint[] }

export interface ArmorChoice {
  id: number
  /** 방어구 초월 적용 여부 (레어도 5~8만 의미 있음) */
  transcend: boolean
}

export type TalismanRef = { type: 'fixed'; id: number } | { type: 'custom'; id: string }

/** 사용자가 직접 입력하는 호석 (감정 호석 등). localStorage 에 저장된다. */
export interface CustomTalisman {
  id: string
  name: string
  rarity: number | null
  skills: SkillPoint[]
  /** 감정 호석은 무기 슬롯(레어도 8)과 방어구 슬롯을 가질 수 있다 */
  slots: Slot[]
}

export interface BuildState {
  weapon: WeaponChoice | null
  armor: Record<ArmorKind, ArmorChoice | null>
  talisman: TalismanRef | null
  /** 장비 칸별 슬롯 인덱스 → 장식주 id. 인덱스는 resolve 된 장비의 slots 순서를 따른다. */
  decorations: Record<EquipKey, (number | null)[]>
}

export function emptyBuild(): BuildState {
  return {
    weapon: null,
    armor: { head: null, chest: null, arms: null, waist: null, legs: null },
    talisman: null,
    decorations: { weapon: [], head: [], chest: [], arms: [], waist: [], legs: [], talisman: [] },
  }
}
