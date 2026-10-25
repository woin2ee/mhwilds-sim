// public/data/wilds.json 의 스키마. scripts/build-data.mjs 가 생성한다.

export const LOCALES = ['ko', 'en', 'ja'] as const
export type Locale = (typeof LOCALES)[number]
export type Names = Record<Locale, string>

export const ARMOR_KINDS = ['head', 'chest', 'arms', 'waist', 'legs'] as const
export type ArmorKind = (typeof ARMOR_KINDS)[number]

export const WEAPON_KINDS = [
  'great-sword',
  'long-sword',
  'sword-shield',
  'dual-blades',
  'hammer',
  'hunting-horn',
  'lance',
  'gunlance',
  'switch-axe',
  'charge-blade',
  'insect-glaive',
  'light-bowgun',
  'heavy-bowgun',
  'bow',
] as const
export type WeaponKind = (typeof WEAPON_KINDS)[number]

export const ELEMENTS = ['fire', 'water', 'thunder', 'ice', 'dragon'] as const
export type Element = (typeof ELEMENTS)[number]

/** armor/weapon: 장식주·장비로 레벨을 쌓는 스킬, set/group: 부위 개수로 발동하는 시리즈/그룹 스킬 */
export type SkillKind = 'armor' | 'weapon' | 'set' | 'group'
export type SlotLevel = 1 | 2 | 3
/** 장식주 종류이자 슬롯 종류. 무기 장식주는 무기 슬롯에만, 방어구 장식주는 방어구 슬롯에만 들어간다. */
export type DecorationKind = 'weapon' | 'armor'

export interface SkillPoint {
  skillId: number
  level: number
}

export interface SkillRank {
  level: number
  description: string
  /** 시리즈/그룹 스킬의 단계별 이름 (예: 가속 재생Ⅰ) */
  name?: Names
  /** 시리즈/그룹 스킬 발동에 필요한 부위 수 */
  pieces?: number
}

export interface Skill {
  id: number
  /** 게임 내부 id (공유 코드용, 데이터를 다시 만들어도 바뀌지 않음) */
  gameId: number
  kind: SkillKind
  name: Names
  description: string
  iconKind: string | null
  maxLevel: number
  ranks: SkillRank[]
}

export interface ArmorSet {
  id: number
  /** 게임 내부 id. 방어구는 (세트 gameId, 부위)로 식별한다. */
  gameId: number
  name: Names
  pieceIds: number[]
}

export interface ArmorPiece {
  id: number
  kind: ArmorKind
  name: Names
  rank: 'low' | 'high'
  rarity: number
  /** max = 강화 최대치 (초월 전) */
  defense: { base: number; max: number }
  resistances: Record<Element, number>
  /** armor/weapon 스킬만. 시리즈/그룹 스킬은 bonusSkillIds */
  skills: SkillPoint[]
  /**
   * 장착하면 각각 1부위로 세는 시리즈/그룹 스킬 (시리즈 → 그룹, 세트 공통 먼저). 같은 스킬이면 세트가 달라도
   * 부위 수를 합산한다 (시리즈 스킬은 α/β/γ 세트끼리). 고그 방어구는 부위마다 다른 몬스터의 시리즈 스킬이 하나 더 붙는다.
   */
  bonusSkillIds: number[]
  /** 방어구 슬롯 레벨 (내림차순) */
  slots: SlotLevel[]
  setId: number
}

export interface Decoration {
  id: number
  /** 게임 내부 id */
  gameId: number
  name: Names
  kind: DecorationKind
  size: SlotLevel
  rarity: number
  skills: SkillPoint[]
}

/** 제작 가능한 고정 호석 (등급별로 1개씩). 감정 호석은 사용자가 직접 입력한다. */
export interface FixedTalisman {
  id: number
  charmId: number
  /** 호석 계열의 게임 내부 id. (charmGameId, level)로 식별한다. */
  charmGameId: number
  name: Names
  level: number
  /** 같은 호석 계열의 최고 등급 여부 */
  isMaxRank: boolean
  rarity: number
  skills: SkillPoint[]
}

export interface WeaponSpecial {
  /** fire | water | thunder | ice | dragon | poison | paralysis | sleep | blast ... */
  type: string
  value: number
  hidden: boolean
}

export interface Weapon {
  id: number
  /** 게임 내부 id. 무기 종류마다 따로 매겨지므로 (kind, gameId)로 식별한다. */
  gameId: number
  kind: WeaponKind
  name: Names
  rarity: number
  attack: number
  affinity: number
  /** 무기에 붙은 방어력 보너스 */
  defenseBonus: number
  specials: WeaponSpecial[]
  skills: SkillPoint[]
  /** 무기 슬롯 레벨 (내림차순) */
  slots: SlotLevel[]
}

export interface GameData {
  meta: {
    source: string
    mhdbVersion: string
    generatedAt: string
    locales: Locale[]
  }
  skills: Skill[]
  armorSets: ArmorSet[]
  armor: ArmorPiece[]
  decorations: Decoration[]
  talismans: FixedTalisman[]
  weapons: Weapon[]
}
