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

/** 게임 화면의 속성 이름 (불속성 공격 강화 = 火属性攻撃強化). 칸이 좁은 버튼에는 한 글자 ELEMENT_LABEL 을 쓴다 */
export const ELEMENT_NAME: Record<Element, string> = {
  fire: '불속성',
  water: '물속성',
  thunder: '번개속성',
  ice: '얼음속성',
  dragon: '용속성',
}

/** 게임 화면의 내성 이름 (같은 이름의 내성 스킬과 같다: 불 내성 = 火耐性). 공유 이미지에서 세로로 늘어놓는다 */
export const RESISTANCE_LABEL: Record<Element, string> = {
  fire: '불 내성',
  water: '물 내성',
  thunder: '번개 내성',
  ice: '얼음 내성',
  dragon: '용 내성',
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
