import type { Element, WeaponKind } from '../data/types'

// 무기 속성치(불·물·번개·얼음·용)와 속성치 상한. 계산기 탭(features/calculator)이 쓴다.
// MHDB 데이터에는 스킬 효과 글만 있고(대부분 '약간 상승' 같은 말) 상한 규칙도 없어서 여기에 모은다.
//
// 속성치 = 기본 속성치 × (배율을 모두 곱한 값) + (가산을 모두 더한 값)
// 상한   = max(기본 속성치 + 400, 기본 속성치 × 2.3)   Ver.1.040(무료 타이틀 업데이트 4)부터. 그 전에는 +350 · ×1.9
// 상한에 걸리면 게임의 장비 화면에서 속성치가 주황색으로 보인다.
//
// 출처 (2026-11 확인): kuroyonhon.com/mhwilds/memo/31.php '属性値の上限について', game8.co 'How Does Weapon Elemental
// Damage Work?', dcinside 몬스터헌터 마이너 갤러리 '와일즈 최대 속성치 제한 (속성캡)', physicalpaprika.sakura.ne.jp
// '弓ダメージ計算式解説'(속성치 = (무기 속성치 + 복원 강화) × 곱셈 보정 + 덧셈 보정). 인게임과 다르면 이 파일만 고치면 된다.

/** 상한: 기본 속성치에 더하는 값과 곱하는 값 중 큰 쪽 */
export const ELEMENT_CAP_ADD = 400
export const ELEMENT_CAP_MUL = 2.3

/** 한 레벨의 효과. mul 은 기본 속성치에 곱하고, add 는 곱한 뒤에 더한다 */
export interface BuffEffect {
  mul?: number
  add?: number
}

/** 무기 종류에 따라 값이 다른 효과. 표에 없는 종류는 default */
type ByWeapon<T> = { default: T } & Partial<Record<WeaponKind, T>>

function pick<T>(table: ByWeapon<T>, kind: WeaponKind): T {
  return table[kind] ?? table.default
}

/** 레벨(1~)별 값 표를 효과로 */
const mulAt = (values: readonly number[], level: number): BuffEffect => ({ mul: values[level - 1] })
const addAt = (values: readonly number[], level: number): BuffEffect => ({ add: values[level - 1] })

export type ElementBuffId =
  | 'elementAttack'
  | 'chargeMaster'
  | 'convertResistance'
  | 'coalescence'
  | 'absorption'
  | 'convertElement'
  | 'burst'
  | 'mutualHostility'
  | 'darkArts'
  | 'hornMelody'

/** 레벨 말고 효과를 정하는 값: 내성 변환의 내성, 속성 흡수의 단계(1~) */
export interface BuffContext {
  resistance: number
  stage: number
}

/** 화면에서 묶는 종류: 무기 스킬 · 방어구 스킬 · 시리즈 스킬 · 그 밖(수렵피리 선율) */
export type ElementBuffGroup = 'weapon' | 'armor' | 'set' | 'other'

export interface ElementBuff {
  id: ElementBuffId
  group: ElementBuffGroup
  /** 이름을 데이터에서 찾을 스킬 gameId (속성 공격 강화·내성 변환은 속성마다 다른 스킬). 스킬이 아니면 없다 */
  skillGameId?: (element: Element) => number
  /** 스킬이 아닌 버프의 이름과 레벨 이름 (levelNames[level - 1]) */
  name?: string
  levelNames?: readonly string[]
  /** 고를 수 있는 가장 높은 레벨 (시리즈 스킬은 단계) */
  maxLevel: number
  /** 이 무기·속성에는 효과가 없으면 그 까닭 */
  unavailable?: (element: Element, kind: WeaponKind) => string | null
  /** 내성 변환: 이 속성의 내성(장비 화면 값)에 따라 오른다 */
  resistance?: (element: Element) => Element
  /** 효과 중에 쌓이는 단계 (속성 흡수: 효과 중에 또 맞으면 단계가 오른다) */
  maxStage?: number
  /** 레벨 효과 (1 ~ maxLevel) */
  effect: (level: number, kind: WeaponKind, ctx: BuffContext) => BuffEffect
  /** 무기 종류에 따라 효과가 다른지 (화면에 '대검 기준'을 붙인다) */
  byWeapon?: boolean
  /** 언제 켜지는지 (화면 설명) */
  condition: (kind: WeaponKind) => string
}

// 스킬 gameId (이름은 데이터에서 찾는다, DESIGN.md §8.1)
const ELEMENT_ATTACK_GAME_ID: Record<Element, number> = {
  fire: -562534336,
  water: 508916704,
  thunder: 1452140672,
  ice: 1268070400,
  dragon: -776946176,
}
const CONVERT_THUNDER_RES_GAME_ID = 30201
const CONVERT_WATER_RES_GAME_ID = 11481

/** 무거운 무기(대검·해머·수렵피리)는 값이 크다 */
const HEAVY: readonly WeaponKind[] = ['great-sword', 'hammer', 'hunting-horn']

// 전화위복: 대검·해머·수렵피리·건랜스·슬래시액스·차지액스 ×1.1/1.2/1.3, 나머지 ×1.05/1.1/1.15
// (Kiranico 파라미터 110/105 · 120/110 · 130/115 에 무기 종류는 game8.jp 673698, gamewith 486762, wikiwiki nenaiko)
const COALESCENCE: ByWeapon<readonly number[]> = {
  default: [1.05, 1.1, 1.15],
  ...Object.fromEntries(
    (['great-sword', 'hammer', 'hunting-horn', 'gunlance', 'switch-axe', 'charge-blade'] as const).map((k) => [
      k,
      [1.1, 1.2, 1.3],
    ]),
  ),
}

// 속성 흡수: +40/50/60, 쌍검·활 +30/40/50, 대검 +50/80/100. 효과 중에 속성 공격을 또 맞으면 단계마다 +10 (3단계까지)
// (game8.jp 673663, gamewith 487425, a-to-monhan, wikiwiki nenaiko). 수렵피리는 대검과 같다는 곳(gamewith·game8.co·수렵피리
// 실측 트윗)과 +40/50/60 이라는 곳(game8.jp·nenaiko·나무위키)이 갈려서 앞쪽을 쓰고 화면에 알린다
const ABSORPTION: ByWeapon<readonly number[]> = {
  default: [40, 50, 60],
  'dual-blades': [30, 40, 50],
  bow: [30, 40, 50],
  'great-sword': [50, 80, 100],
  'hunting-horn': [50, 80, 100],
}
const ABSORPTION_PER_STAGE = 10

// 연격: 5번 이어 맞힌 뒤의 가산 (그 전에는 레벨과 상관없이 +50, 쌍검·활 +30). 보우건은 속성이 오르지 않는다
// (game8.jp 672018, game8.co 501644, wikiwiki nenaiko 스킬/連撃)
const BURST: ByWeapon<readonly number[]> = {
  default: [60, 80, 100, 120, 140],
  'great-sword': [80, 100, 120, 160, 200],
  'hunting-horn': [80, 100, 120, 160, 200],
  'dual-blades': [40, 60, 80, 100, 120],
  bow: [40, 60, 80, 100, 120],
}
const BURST_START: ByWeapon<number> = { default: 50, 'dual-blades': 30, bow: 30 }

// 차지 마스터: 모으기 공격의 속성치 ×1.15/1.2/1.25, 활 ×1.05/1.1/1.15 (Kiranico 스킬 파라미터 115/120/125 · 105/110/115).
// 장비 화면의 속성치에는 안 보이지만 상한에는 걸린다 (kuroyonhon memo 28)
const CHARGE_MASTER: ByWeapon<readonly number[]> = { default: [1.15, 1.2, 1.25], bow: [1.05, 1.1, 1.15] }

// 내성 변환: 그 내성 1 마다 대검·해머·수렵피리 +5, 나머지 +4 (보우건 +2). 0 보다 낮은 내성은 0 으로 본다
// (wikiwiki nenaiko 스킬/耐性変換, game8.jp 701797·767332)
const CONVERT_RES_PER_POINT: ByWeapon<number> = { default: 4, ...Object.fromEntries(HEAVY.map((k) => [k, 5])) }

// 어둠의 기교 (암흑기사의 증표 2부위): 대검·해머·수렵피리 ×1.2, 나머지 ×1.14 (Kiranico 파라미터 120/114)
const DARK_ARTS: ByWeapon<number> = { default: 1.14, ...Object.fromEntries(HEAVY.map((k) => [k, 1.2])) }

export const ELEMENT_BUFFS: readonly ElementBuff[] = [
  {
    // 게임 데이터의 효과 글: Lv1 +40, Lv2 1.1배 +50, Lv3 1.2배 +60
    id: 'elementAttack',
    group: 'weapon',
    skillGameId: (element) => ELEMENT_ATTACK_GAME_ID[element],
    maxLevel: 3,
    effect: (level) => [{ add: 40 }, { mul: 1.1, add: 50 }, { mul: 1.2, add: 60 }][level - 1],
    condition: () => '늘 켜짐',
  },
  {
    id: 'chargeMaster',
    group: 'weapon',
    skillGameId: () => -1475134080,
    maxLevel: 3,
    unavailable: (_, kind) => (kind === 'dual-blades' ? '쌍검에는 모으기 공격이 없어요' : null),
    effect: (level, kind) => mulAt(pick(CHARGE_MASTER, kind), level),
    byWeapon: true,
    condition: () => '모으기 공격에만 · 장비 화면의 속성치에는 안 보여요',
  },
  {
    id: 'convertResistance',
    group: 'weapon',
    skillGameId: (element) => (element === 'water' ? CONVERT_WATER_RES_GAME_ID : CONVERT_THUNDER_RES_GAME_ID),
    maxLevel: 1,
    unavailable: (element) =>
      element === 'thunder' || element === 'water' ? null : '번개·물속성 무기(라기아크루스 무기 등)에만 붙는 스킬이에요',
    resistance: (element) => (element === 'water' ? 'water' : 'thunder'),
    effect: (_, kind, { resistance }) => ({ add: pick(CONVERT_RES_PER_POINT, kind) * Math.max(0, resistance) }),
    byWeapon: true,
    condition: (kind) => `내성 1 마다 +${pick(CONVERT_RES_PER_POINT, kind)}`,
  },
  {
    id: 'coalescence',
    group: 'armor',
    skillGameId: () => -1700743296,
    maxLevel: 3,
    effect: (level, kind) => mulAt(pick(COALESCENCE, kind), level),
    byWeapon: true,
    condition: () => '상태 이상·속성 피해를 풀면 30초',
  },
  {
    id: 'absorption',
    group: 'armor',
    skillGameId: () => 1489568384,
    maxLevel: 3,
    maxStage: 3,
    effect: (level, kind, { stage }) => ({ add: pick(ABSORPTION, kind)[level - 1] + (stage - 1) * ABSORPTION_PER_STAGE }),
    byWeapon: true,
    condition: (kind) =>
      `속성 공격을 맞으면 120초 · 효과 중에 또 맞으면 단계마다 +${ABSORPTION_PER_STAGE}` +
      (kind === 'hunting-horn' ? ' · 수렵피리 값은 출처마다 달라요 (+40/50/60 이라는 곳도 있음)' : ''),
  },
  {
    // 용속성 무기만 +80/120/180 (game8.jp 673664). 다른 속성은 추가 용속성 대미지만 생긴다
    id: 'convertElement',
    group: 'armor',
    skillGameId: () => 2083363072,
    maxLevel: 3,
    unavailable: (element) => (element === 'dragon' ? null : '용속성 무기만 속성치가 올라요'),
    effect: (level) => addAt([80, 120, 180], level),
    condition: () => '속성 공격을 맞으면 120초',
  },
  {
    id: 'burst',
    group: 'armor',
    skillGameId: () => 565867136,
    maxLevel: 5,
    effect: (level, kind) => addAt(pick(BURST, kind), level),
    byWeapon: true,
    condition: (kind) => `공격을 5번 이어 맞혔을 때 (그 전에는 +${pick(BURST_START, kind)})`,
  },
  {
    // 선전호응Ⅰ ×1.2 +20, Ⅱ ×1.3 +40. 무기 종류와 상관없다 (game8.jp 750224, gamewith 534855)
    id: 'mutualHostility',
    group: 'set',
    skillGameId: () => 5590,
    maxLevel: 2,
    effect: (level) => [{ mul: 1.2, add: 20 }, { mul: 1.3, add: 40 }][level - 1],
    condition: () => '대형 몬스터가 분노하면',
  },
  {
    // 4부위(흑야)도 2부위 효과(어둠의 기교)는 그대로라 2부위만 고른다
    id: 'darkArts',
    group: 'set',
    skillGameId: () => 24531,
    maxLevel: 1,
    effect: (_, kind) => ({ mul: pick(DARK_ARTS, kind) }),
    byWeapon: true,
    condition: () => '체력 게이지에 빨간 부분이 있는 동안',
  },
  {
    // 수렵피리 선율 '속성 공격력 UP': 처음 ×1.08, 다시 연주해 겹치면 ×1.1. 함께 사냥하는 수렵피리의 선율도 받는다
    // (kuroyonhon memo 8·21: 불 410 + 불속성 공격 강화 3 → 591 / 601)
    id: 'hornMelody',
    group: 'other',
    name: '수렵피리 선율 · 속성 공격력 UP',
    levelNames: ['연주', '겹침'],
    maxLevel: 2,
    effect: (level) => mulAt([1.08, 1.1], level),
    condition: () => '120초 · 다시 연주하면 겹쳐서 커져요',
  },
]

export function elementBuff(id: ElementBuffId): ElementBuff {
  const buff = ELEMENT_BUFFS.find((b) => b.id === id)
  if (!buff) throw new Error(`Unknown element buff ${id}`)
  return buff
}

/** 이 무기·속성에는 효과가 없는 까닭 (효과가 있으면 null) */
export function buffUnavailable(buff: ElementBuff, element: Element, kind: WeaponKind): string | null {
  return buff.unavailable?.(element, kind) ?? null
}

export interface ElementCap {
  /** 상한 (×2.3 쪽은 소수가 될 수 있다) */
  value: number
  /** 상한을 정한 식: 기본 + 400(add) / 기본 × 2.3(mul) */
  rule: 'add' | 'mul'
  add: number
  mul: number
}

/** 부동소수점 오차를 지운 값 (배율은 소수점 아래 넷째 자리까지라 백만분의 일로 맞추면 정확하다: 1.1 × 290 = 318.99999… → 319) */
export function exact(x: number): number {
  return Math.round(x * 1e6) / 1e6
}

/** 게임 화면의 속성치: 소수점 아래 반올림 (808.8 → 809, 591.36 → 591. 공격력과 달리 버리지 않는다) */
export function shownValue(x: number): number {
  return Math.floor(exact(x) + 0.5)
}

/** 기본 속성치에 따른 상한 */
export function elementCap(base: number): ElementCap {
  const add = base + ELEMENT_CAP_ADD
  const mul = exact(base * ELEMENT_CAP_MUL)
  return add >= mul ? { value: add, rule: 'add', add, mul } : { value: mul, rule: 'mul', add, mul }
}

export interface ElementCalcInput {
  element: Element
  kind: WeaponKind
  /** 기본 속성치 (무기 화면의 값, 스킬 효과 빼고) */
  base: number
  /** 켠 버프의 레벨 (0·없음 = 끔) */
  levels: Partial<Record<ElementBuffId, number>>
  /** 장비 화면의 내성 (내성 변환이 쓴다, 없으면 0) */
  resistances?: Partial<Record<Element, number>>
  /** 쌓인 단계 (속성 흡수, 없으면 1단계) */
  stages?: Partial<Record<ElementBuffId, number>>
}

export interface AppliedBuff extends BuffEffect {
  id: ElementBuffId
  level: number
  /** 쌓인 단계 (maxStage 가 있는 버프만) */
  stage?: number
  /** 쓴 내성 (내성 변환만) */
  resistance?: number
}

export interface ElementCalcResult {
  base: number
  /** 효과가 있는 켠 버프 (ELEMENT_BUFFS 순서) */
  applied: AppliedBuff[]
  /** 배율을 모두 곱한 값 */
  mul: number
  /** 가산을 모두 더한 값 */
  add: number
  /** 상한을 적용하기 전 속성치: 기본 × 배율 + 가산 (반올림 전) */
  raw: number
  /** raw 를 반올림한 값 */
  value: number
  cap: ElementCap
  /** 상한을 적용한 속성치 (게임 화면의 값, 반올림) */
  final: number
  capped: boolean
}

/**
 * 같은 무기 종류·속성·버프로 상한에 걸리는 기본 속성치 구간 (1 ~ maxBase 를 하나씩 계산한다).
 * 배율 합이 2.3 보다 작으면 넘치는 양(기본 × 배율 + 가산 − 상한)은 상한 식이 +400 에서 ×2.3 으로 바뀌는
 * 기본 속성치(약 308)까지 늘다가 줄어서, 걸리는 구간은 그 언저리 하나다
 */
export function cappedBaseRanges(
  input: Omit<ElementCalcInput, 'base'>,
  maxBase: number,
): { from: number; to: number }[] {
  const ranges: { from: number; to: number }[] = []
  let start: number | null = null
  for (let base = 1; base <= maxBase; base++) {
    const capped = computeElement({ ...input, base }).capped
    if (capped && start === null) start = base
    if (!capped && start !== null) {
      ranges.push({ from: start, to: base - 1 })
      start = null
    }
  }
  if (start !== null) ranges.push({ from: start, to: maxBase })
  return ranges
}

export function computeElement(input: ElementCalcInput): ElementCalcResult {
  const applied: AppliedBuff[] = []
  for (const buff of ELEMENT_BUFFS) {
    const level = Math.min(input.levels[buff.id] ?? 0, buff.maxLevel)
    if (level <= 0 || buffUnavailable(buff, input.element, input.kind)) continue
    const resistance = buff.resistance ? (input.resistances?.[buff.resistance(input.element)] ?? 0) : 0
    const stage = buff.maxStage ? Math.min(Math.max(1, input.stages?.[buff.id] ?? 1), buff.maxStage) : 1
    applied.push({
      id: buff.id,
      level,
      ...(buff.maxStage && { stage }),
      ...(buff.resistance && { resistance }),
      ...buff.effect(level, input.kind, { resistance, stage }),
    })
  }
  const mul = exact(applied.reduce((m, b) => m * (b.mul ?? 1), 1))
  const add = applied.reduce((s, b) => s + (b.add ?? 0), 0)
  const raw = exact(input.base * mul + add)
  const cap = elementCap(input.base)
  const capped = raw > cap.value
  return {
    base: input.base,
    applied,
    mul,
    add,
    raw,
    value: shownValue(raw),
    cap,
    final: shownValue(capped ? cap.value : raw),
    capped,
  }
}
