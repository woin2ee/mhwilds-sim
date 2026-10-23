import { ARMOR_KINDS, type ArmorKind, type DecorationKind, type SkillPoint, type SlotLevel } from '../data/types'

export type SlotKind = DecorationKind

export interface Slot {
  kind: SlotKind
  level: SlotLevel
}

/** 장비 칸: 무기, 방어구 5부위, 호석 */
export type EquipKey = 'weapon' | ArmorKind | 'talisman'
export const EQUIP_KEYS: readonly EquipKey[] = ['weapon', ...ARMOR_KINDS, 'talisman']

/** setSkillId/groupSkillId: 거극 아티어 무기에 붙은 시리즈/그룹 스킬 (각각 방어구 1부위, gogmaArtian.ts) */
export type WeaponChoice =
  | { type: 'db'; id: number; setSkillId?: number; groupSkillId?: number }
  /** DB에 없는 무기를 슬롯/스킬만 직접 입력 (예: 아티어 무기 보너스 반영). 거극 아티어 스킬도 넣을 수 있다 */
  | { type: 'custom'; slots: SlotLevel[]; skills: SkillPoint[]; setSkillId?: number; groupSkillId?: number }

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

/** 직접 입력 호석의 내용 (id 제외). 세팅 전용 호석·공유 코드·백업에 담긴다. */
export type TalismanDraft = Omit<CustomTalisman, 'id'>

/**
 * 세팅의 호석. 제작 호석·내 호석은 id 로 가리키고, 내 호석에 없는 호석(공유받은 세팅의 호석 등)은
 * 내용을 세팅에 그대로 담는다 ('세팅 전용 호석'). 내 호석 목록에는 실제로 가진 호석만 둔다.
 */
export type TalismanChoice = TalismanRef | { type: 'inline'; talisman: TalismanDraft }

export interface BuildState {
  weapon: WeaponChoice | null
  armor: Record<ArmorKind, ArmorChoice | null>
  talisman: TalismanChoice | null
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
