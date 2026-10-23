import type { ArmorKind, DecorationKind, Element, Names, SkillKind, WeaponKind } from './types'

export const ARMOR_KIND_LABEL: Record<ArmorKind, string> = {
  head: '머리',
  chest: '몸통',
  arms: '팔',
  waist: '허리',
  legs: '다리',
}

export const WEAPON_KIND_LABEL: Record<WeaponKind, string> = {
  'great-sword': '대검',
  'long-sword': '태도',
  'sword-shield': '한손검',
  'dual-blades': '쌍검',
  hammer: '해머',
  'hunting-horn': '수렵피리',
  lance: '랜스',
  gunlance: '건랜스',
  'switch-axe': '슬래시액스',
  'charge-blade': '차지액스',
  'insect-glaive': '조충곤',
  'light-bowgun': '라이트보우건',
  'heavy-bowgun': '헤비보우건',
  bow: '활',
}

export const ELEMENT_LABEL: Record<Element, string> = {
  fire: '화',
  water: '수',
  thunder: '뇌',
  ice: '빙',
  dragon: '용',
}

export const SPECIAL_LABEL: Record<string, string> = {
  ...ELEMENT_LABEL,
  poison: '독',
  paralysis: '마비',
  sleep: '수면',
  blast: '폭파',
}

/** 거극 아티어 무기 (데이터 이름에 없어서 목록 표시·검색어로 붙인다, core/gogmaArtian.ts) */
export const GOGMA_ARTIAN_NAMES: Names = { ko: '거극 아티어', en: 'Gogma Artian', ja: '巨戟アーティア' }

export const SKILL_KIND_LABEL: Record<SkillKind, string> = {
  armor: '방어구 스킬',
  weapon: '무기 스킬',
  set: '시리즈 스킬',
  group: '그룹 스킬',
}

export const SLOT_KIND_LABEL: Record<DecorationKind, string> = {
  weapon: '무기',
  armor: '방어구',
}
