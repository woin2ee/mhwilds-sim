// 검색 준비: 요청 정리, 후보 필터, 동등 클래스 압축, 장식주 채우기 준비, 가지치기 테이블
// (DESIGN.md §6.1~6.3, 내성 조건 §6.9, 내성순 정렬 §6.10)
import type { GameDb } from '../../data/db'
import {
  ARMOR_KINDS,
  ELEMENTS,
  type ArmorKind,
  type ArmorPiece,
  type Decoration,
  type Element,
  type SkillPoint,
  type SlotLevel,
} from '../../data/types'
import { resolveWeapon } from '../equipment'
import { armorDefense, armorSlots, canTranscend } from '../transcend'
import type { CustomTalisman, Slot, SlotKind } from '../types'
import { DecoFiller, slotScore, type FillDeco, type SizeCounts, type SlotCounts, type SpareSizes } from './decoFill'
import type { ResistanceMin, SearchRequest, SearchTalisman } from './types'

/**
 * 점수형 요구 스킬을 채울 수 있는 장식주 종류.
 * armor/weapon: 그 종류 장식주로만, both: 둘 다(현재 데이터엔 없음), none: 장식주로는 불가
 */
export type Pool = 'armor' | 'weapon' | 'both' | 'none'

export interface PointRequirement {
  skillId: number
  need: number
  pool: Pool
  /** 고정: 모자란 조합을 찾을 때도 낮추지 않는다 */
  locked: boolean
}

export interface BonusRequirement {
  skillId: number
  /** 방어구로 채울 부위 수 (거극 아티어 무기가 센 1부위는 뺀 값) */
  pieces: number
  /** 1단계부터 요구 단계까지 단계별로 방어구로 채울 부위 수 (오름차순, 마지막 = pieces). 모자란 단계를 셀 때 쓴다 */
  steps: number[]
  /** 고정: 모자란 조합을 찾을 때도 낮추지 않는다 */
  locked: boolean
}

/** 방어구 부위 수가 pieces 일 때 요구 단계보다 모자란 단계 수 */
export function bonusShortfall(bonus: BonusRequirement, pieces: number): number {
  let short = 0
  for (const step of bonus.steps) if (step > pieces) short++
  return short
}

/**
 * α/β 바꾸기 (§6.2.1): 같은 탐색 클래스의 짝 옵션(β)에 장식주 jewels 를 넣은 것과 스킬이 같고, 그 장식주가 들어가던 슬롯 extra 만
 * 없는 옵션(α). 짝으로 만든 결과와 스킬·남는 슬롯이 같으면 따로 결과로 내지 않고 짝 결과의 대체 후보가 된다
 */
export interface OptionSwap {
  /** 짝 옵션(β)의 options 인덱스 */
  partner: number
  /** 원하는 스킬 점수가 클래스 점수(= 짝)보다 많은 만큼 (jewels 가 주던 점수) */
  delta: Int32Array
  /** 짝에 넣으면 이 옵션과 스킬이 같아지는 방어구 장식주 (원하는 스킬) */
  jewels: Decoration[]
  /** 짝에만 있는 슬롯. jewels 가 딱 맞게 들어간다 */
  extra: SlotCounts
  /** 짝과 다른 시리즈/그룹 스킬 id: 결과마다 발동 단계가 같은지 본다 */
  bonusDiff: number[]
}

/**
 * 서로 바꿔 껴도 스킬·남는 슬롯이 그대로인 방어구 (스킬·시리즈/그룹 스킬·초월 반영 슬롯이 모두 같다, 내성 조건이나 내성순 정렬이
 * 있으면 그 내성도). 결과 하나에 옵션 하나
 */
export interface ArmorOption {
  /** 방어력(초월 반영) 내림차순, [0] = 대표 */
  members: ArmorPiece[]
  slots: SlotLevel[]
  slotCounts: SlotCounts
  defense: number
  /** 시리즈/그룹 스킬 id (정렬) */
  bonusIds: number[]
  /** Prepared.resElements 의 내성 (조건을 건 내성 §6.9, 내성순 정렬 속성 §6.10) */
  res: Int32Array
  swap: OptionSwap | null
}

/** 잎에서 함께 세는 옵션 묶음: 슬롯·내성(res)이 같은 옵션들, 또는 α 옵션 하나 (§6.5) */
export interface OptionGroup {
  slotCounts: SlotCounts
  res: Int32Array
  /** options 인덱스, 방어력 내림차순 */
  options: number[]
  /** 가장 높은 방어력 */
  defense: number
  swap: OptionSwap | null
}

/**
 * 탐색 단위 (§6.2): 원하는 스킬 점수·시리즈/그룹 소속·비선호(탐색 순서의 마지막 부위가 아니면 조건을 건 내성도, §6.9)가 같고
 * 슬롯이 [0] 의 슬롯에 들어가는 옵션들. α 옵션은 원하는 스킬 점수가 delta 만큼 더 많다.
 * 가지치기는 [0] 의 점수·슬롯(모든 옵션을 덮는다)으로 한다
 */
export interface ArmorClass {
  options: ArmorOption[]
  groups: OptionGroup[]
  /** 요구 스킬별 점수 (요구 레벨에서 자름) */
  pts: Int32Array
  /** 시리즈/그룹 요구 스킬별 소속 여부 */
  bonus: Uint8Array
  /** options[0] 의 슬롯 */
  slots: SlotLevel[]
  slotCounts: SlotCounts
  unwanted: number[]
  /** 옵션 중 가장 높은 방어력 */
  defense: number
  /** Prepared.resElements 의 내성마다 옵션 중 가장 낮은·높은 값. 조건을 건 내성으로 나눈 클래스는 그 내성의 둘이 같다 (§6.9) */
  resMin: Int32Array
  resMax: Int32Array
  /** 임계 레벨 t(1~3)별 가지치기 상한: 해당 스킬 점수 합 + 슬롯 잠재력 */
  potential: [number, number, number]
}

export interface TalismanClass {
  /** 스킬까지 같은 호석끼리 묶은 옵션 (요청 순서, 옵션마다 [0] = 대표). [[]] = 호석 없음 */
  options: SearchTalisman[][]
  pts: Int32Array
  slots: Slot[]
  armorSlots: SlotCounts
  weaponSlots: SlotCounts
  unwanted: number[]
}

export interface Fillers {
  clean: DecoFiller
  /** mark 모드에서 비선호 장식주까지 허용하는 재시도용 */
  all: DecoFiller | null
  /** 이 채우기가 담당하는 요구 스킬 인덱스 */
  indices: number[]
}

export interface Threshold {
  /** 이 임계 레벨 이상 장식주로만 얻을 수 있는 방어구 풀 요구 스킬 인덱스 */
  indices: number[]
  /** 슬롯 레벨별 잠재력 */
  pot: [number, number, number]
  /** 깊이 d 이후 남은 부위들의 최대 잠재력 합 */
  remaining: Float64Array
  /** 방어구 장식주 여유분이 비워 둘 슬롯의 잠재력 하한 (크기 s 여유분은 레벨 s 이상 슬롯 하나를 쓴다, §6.8) */
  sparePot: number
}

export interface Prepared {
  required: PointRequirement[]
  bonuses: BonusRequirement[]
  /** 내성 조건 (§6.9, 속성 순서). 후보 방어구로 늘 채워지는 조건은 뺀다 */
  resistances: ResistanceMin[]
  /**
   * 옵션·묶음·클래스의 내성(res·resMin·resMax)이 담는 속성: 내성 조건(resistances 순서) 뒤에, 내성순 정렬(§6.10)의 속성이
   * 조건에 없으면 그 속성. 옵션은 이 내성이 모두 같은 방어구끼리 묶고, 탐색 클래스는 조건을 건 내성으로만 나눈다
   */
  resElements: Element[]
  /** 내성순 정렬 속성이 resElements 에서 몇 번째인지 (내성순이 아니면 -1) */
  sortRes: number
  /** 비선호 스킬 (요구 스킬과 겹치면 제외, 정렬) */
  excluded: number[]
  /** 탐색 순서대로의 방어구 부위 (클래스 수가 적은 부위부터) */
  kinds: ArmorKind[]
  /** kinds 와 같은 순서 */
  classes: ArmorClass[][]
  talismans: TalismanClass[]
  weapon: {
    present: boolean
    pts: Int32Array
    slots: SlotLevel[]
    slotCounts: SlotCounts
    defense: number
    /** 거극 아티어 무기에 붙은 시리즈/그룹 스킬 (α/β 바꾸기의 발동 비교에 센다) */
    bonusIds: number[]
  }
  armorFill: Fillers
  weaponFill: Fillers
  /** 'both' 스킬이 있을 때만: 방어구·무기 슬롯을 함께 쓰는 채우기 */
  jointFill: Fillers | null
  /** 방어구가 무기 풀 스킬을 주지 않아 무기 풀 판정을 호석 단계에서 끝낼 수 있는지 */
  weaponPrecheck: boolean
  /** 장식주 여유분: 종류별로 남는 슬롯에 더 끼울 수 있어야 하는 장식주 크기별 개수 (§6.8) */
  spare: SpareSizes
  bounds: {
    /** 장식주로 못 채우는 요구 스킬 */
    noneIndices: number[]
    /** [d][i] 남은 부위 최대 점수 합 */
    remainingPts: Int32Array[]
    /** [d] 남은 부위마다 장식주로 못 채우는 스킬 점수 합이 가장 큰 클래스의 그 합을 더한 값 */
    remainingNone: Int32Array
    /** [d][j] 남은 부위 중 해당 시리즈/그룹에 속한 클래스가 있는 부위 수 */
    remainingBonus: Int32Array[]
    thresholds: Threshold[]
    /** 고정한 방어구 풀 스킬만으로 만든 임계 묶음 (모자란 조합 찾기에서 다 채울 수 있는지 따로 본다) */
    lockedThresholds: Threshold[]
    /**
     * [d] 남은 부위마다 레벨 k 이상 슬롯이 가장 많은 클래스의 그 개수를 더한 값 [Lv1 이상, Lv2 이상, Lv3].
     * 방어구 장식주 여유분이 들어갈 슬롯이 남은 부위를 다 더해도 모자라면 컷 (§6.8)
     */
    remainingAtLeast: [number, number, number][]
    /** [d][j] 남은 부위마다 내성 j 가 가장 높은 클래스의 그 값을 더한 값 */
    remainingRes: Int32Array[]
  }
  /** computeBuild 검증용: 요청의 사용자 호석 */
  customTalismans: CustomTalisman[]
}

const pointsOf = (skills: readonly SkillPoint[], skillId: number) => {
  let total = 0
  for (const s of skills) if (s.skillId === skillId) total += s.level
  return total
}

const unwantedOf = (skills: readonly SkillPoint[], excluded: ReadonlySet<number>) =>
  [...new Set(skills.filter((s) => excluded.has(s.skillId)).map((s) => s.skillId))].sort((a, b) => a - b)

function countSlots(levels: readonly SlotLevel[]): SlotCounts {
  const counts: SlotCounts = [0, 0, 0]
  for (const level of levels) counts[level - 1]++
  return counts
}

/** 슬롯(레벨 내림차순)이 자리마다 같거나 커서 small 에 들어가는 장식주가 big 에도 모두 들어가는지 */
const coversSlots = (big: readonly SlotLevel[], small: readonly SlotLevel[]) =>
  big.length >= small.length && small.every((level, i) => big[i] >= level)

/** 스킬 id → 레벨 (같은 스킬이 여러 번 있으면 더한다) */
function levelsOf(skills: readonly SkillPoint[]): Map<number, number> {
  const levels = new Map<number, number>()
  for (const s of skills) levels.set(s.skillId, (levels.get(s.skillId) ?? 0) + s.level)
  return levels
}

const levelsKey = (levels: ReadonlyMap<number, number>) =>
  [...levels]
    .sort((a, b) => a[0] - b[0])
    .map(([id, level]) => `${id}:${level}`)
    .join(',')

/** 탐색 클래스를 만들기 전의 옵션과 그 키 */
interface StrictOption {
  option: ArmorOption
  levels: Map<number, number>
  pts: Int32Array
  bonus: Uint8Array
  unwanted: number[]
  /** 탐색 클래스 키: 원하는 스킬 점수·시리즈/그룹 소속·비선호 */
  same: string
}

/** 스킬·시리즈/그룹 스킬·초월 반영 슬롯·resElements 의 내성이 모두 같은 방어구끼리 옵션으로 묶는다. 슬롯 점수 → 방어력 → 대표 id 순 */
function strictOptions(
  pieces: readonly ArmorPiece[],
  transcend: boolean,
  required: readonly PointRequirement[],
  bonuses: readonly BonusRequirement[],
  excluded: ReadonlySet<number>,
  resElements: readonly Element[],
): StrictOption[] {
  const byKey = new Map<string, StrictOption>()
  const defenses = new Map<ArmorPiece, number>()
  for (const piece of pieces) {
    const pieceTranscend = transcend && canTranscend(piece)
    const slots = [...armorSlots(piece, pieceTranscend)].sort((a, b) => b - a)
    defenses.set(piece, armorDefense(piece, pieceTranscend).max)
    const levels = levelsOf(piece.skills)
    const bonusIds = [...piece.bonusSkillIds].sort((a, b) => a - b)
    // 조건을 건 내성이 다르면 바꿔 꼈을 때 조건을 채우는지가 달라지고(§6.9), 내성순 정렬 속성의 내성이 다르면 순위가 달라진다 (§6.10)
    const res = Int32Array.from(resElements, (element) => piece.resistances[element])
    const key = `${levelsKey(levels)}|${bonusIds.join(',')}|${slots.join('')}|${res.join(',')}`
    let strict = byKey.get(key)
    if (!strict) {
      const pts = Int32Array.from(required, (r) => Math.min(r.need, levels.get(r.skillId) ?? 0))
      const bonus = Uint8Array.from(bonuses, (b) => (bonusIds.includes(b.skillId) ? 1 : 0))
      const unwanted = unwantedOf(piece.skills, excluded)
      strict = {
        option: { members: [], slots, slotCounts: countSlots(slots), defense: 0, bonusIds, res, swap: null },
        levels,
        pts,
        bonus,
        unwanted,
        same: `${pts.join(',')}|${bonus.join('')}|${unwanted.join(',')}`,
      }
      byKey.set(key, strict)
    }
    strict.option.members.push(piece)
  }
  for (const { option } of byKey.values()) {
    option.members.sort((a, b) => defenses.get(b)! - defenses.get(a)! || a.id - b.id)
    option.defense = defenses.get(option.members[0])!
  }
  return [...byKey.values()].sort(
    (a, b) =>
      slotScore(b.option.slotCounts) - slotScore(a.option.slotCounts) ||
      b.option.defense - a.option.defense ||
      a.option.members[0].id - b.option.members[0].id,
  )
}

/**
 * α/β 짝 (§6.2.1): α 의 스킬 = β 의 스킬 + 원하는 스킬 장식주 jewels (α 의 그 스킬 레벨은 요구 레벨 이하), β 의 슬롯 = α 의 슬롯 +
 * jewels 와 크기가 같은 슬롯, 시리즈/그룹 요구 스킬 소속·비선호가 같다 (jewels 가 없으면 시리즈/그룹 스킬만 다른 방어구).
 * 짝(β)은 strictList 순서로 먼저 나온 옵션이고 α 를 여럿 가질 수 있다. 짝이 된 옵션은 옮기지 않고, 옮긴 옵션은 짝이 되지 않는다.
 * 반환: 옮길 α → 짝 β 와 바꾸기 정보 (partner 는 클래스를 만든 뒤 채운다)
 */
function findSwaps(
  strictList: readonly StrictOption[],
  required: readonly PointRequirement[],
  requiredIndex: ReadonlyMap<number, number>,
  swapJewel: ReadonlyMap<number, Decoration>,
): Map<StrictOption, { partner: StrictOption; swap: Omit<OptionSwap, 'partner'> }> {
  const moves = new Map<StrictOption, { partner: StrictOption; swap: Omit<OptionSwap, 'partner'> }>()
  const anchors = new Set<StrictOption>()
  for (const beta of strictList) {
    if (moves.has(beta)) continue
    for (const alpha of strictList) {
      if (alpha === beta || moves.has(alpha) || anchors.has(alpha)) continue
      const swap = swapOf(alpha, beta, required, requiredIndex, swapJewel)
      if (!swap) continue
      moves.set(alpha, { partner: beta, swap })
      anchors.add(beta)
    }
  }
  return moves
}

function swapOf(
  alpha: StrictOption,
  beta: StrictOption,
  required: readonly PointRequirement[],
  requiredIndex: ReadonlyMap<number, number>,
  swapJewel: ReadonlyMap<number, Decoration>,
): Omit<OptionSwap, 'partner'> | null {
  if (alpha.option.slots.length > beta.option.slots.length) return null
  if (alpha.bonus.join('') !== beta.bonus.join('') || alpha.unwanted.join(',') !== beta.unwanted.join(',')) return null
  // 바꾸면 내성 합이 달라지는 짝은 같은 결과가 아니다 (§6.9)
  if (alpha.option.res.join(',') !== beta.option.res.join(',')) return null
  // β 의 슬롯 = α 의 슬롯 + extra (레벨 내림차순)
  const extra = [...beta.option.slots]
  for (const level of alpha.option.slots) {
    const i = extra.indexOf(level)
    if (i < 0) return null
    extra.splice(i, 1)
  }
  const jewels: Decoration[] = []
  const delta = new Int32Array(required.length)
  for (const skillId of new Set([...alpha.levels.keys(), ...beta.levels.keys()])) {
    const level = alpha.levels.get(skillId) ?? 0
    const diff = level - (beta.levels.get(skillId) ?? 0)
    if (diff === 0) continue
    const jewel = swapJewel.get(skillId)
    const index = requiredIndex.get(skillId)
    // β 에 장식주를 넣어 α 가 되는 차이만: 원하는 스킬이고, 넣은 장식주가 다 요구 레벨 안에 든다
    if (diff < 0 || !jewel || index === undefined || level > required[index].need) return null
    for (let k = 0; k < diff; k++) jewels.push(jewel)
    delta[index] = diff
  }
  // 장식주와 짝에만 있는 슬롯의 크기가 같으면 β 에 장식주를 넣은 것과 α 는 어떤 조합에서도 남는 슬롯까지 같다 (§6.2.1)
  if (jewels.length !== extra.length) return null
  const sizes = jewels.map((j) => j.size).sort((a, b) => b - a)
  if (!sizes.every((size, i) => extra[i] === size)) return null
  const count = (ids: readonly number[], id: number) => ids.filter((x) => x === id).length
  const bonusDiff = [...new Set([...alpha.option.bonusIds, ...beta.option.bonusIds])]
    .filter((id) => count(alpha.option.bonusIds, id) !== count(beta.option.bonusIds, id))
    .sort((a, b) => a - b)
  // 스킬·슬롯·시리즈/그룹 스킬이 모두 같으면 같은 옵션이다
  if (jewels.length === 0 && bonusDiff.length === 0) return null
  return { delta, jewels, extra: countSlots(extra), bonusDiff }
}

/** 잎 DP 묶음: α 가 아닌 옵션은 슬롯·내성(res)이 같은 것끼리, α 옵션은 하나씩 */
function optionGroups(options: readonly ArmorOption[]): OptionGroup[] {
  const groups: OptionGroup[] = []
  const bySlots = new Map<string, OptionGroup>()
  options.forEach((option, index) => {
    if (option.swap) {
      groups.push({ slotCounts: option.slotCounts, res: option.res, options: [index], defense: option.defense, swap: option.swap })
      return
    }
    const key = `${option.slots.join('')}|${option.res.join(',')}`
    let group = bySlots.get(key)
    if (!group) {
      group = { slotCounts: option.slotCounts, res: option.res, options: [], defense: 0, swap: null }
      bySlots.set(key, group)
      groups.push(group)
    }
    group.options.push(index)
  })
  for (const group of groups) {
    group.options.sort((a, b) => options[b].defense - options[a].defense || a - b)
    group.defense = options[group.options[0]].defense
  }
  return groups
}

/** 요청을 탐색 가능한 형태로 정리한다. 요구 스킬이 없거나 처음부터 불가능하면 null. */
export function prepare(db: GameDb, request: SearchRequest): Prepared | null {
  // ---- 요구 스킬 ----
  const merged = new Map<number, number>()
  for (const r of request.required) {
    const skill = db.skills.get(r.skillId)
    if (!skill) continue
    const level = Math.min(Math.floor(r.level), skill.maxLevel)
    if (level > 0) merged.set(r.skillId, Math.max(merged.get(r.skillId) ?? 0, level))
  }
  if (merged.size === 0) return null

  // 무기는 사용자가 고정한다. 거극 아티어 무기의 시리즈/그룹 스킬은 그 스킬을 방어구 1부위만큼 덜 찾게 한다
  const resolvedWeapon = resolveWeapon(db, request.weapon.choice)
  const locked = new Set(request.lockedSkills)
  const points: { skillId: number; need: number; locked: boolean }[] = []
  const bonuses: BonusRequirement[] = []
  for (const [skillId, level] of merged) {
    const skill = db.skill(skillId)
    if (skill.kind === 'set' || skill.kind === 'group') {
      const fromWeapon = resolvedWeapon?.bonusSkillIds.includes(skillId) ? 1 : 0
      const steps = Array.from(
        { length: level },
        (_, i) =>
          Math.min(...skill.ranks.filter((r) => r.level > i && r.pieces !== undefined).map((r) => r.pieces!)) -
          fromWeapon,
      )
      const pieces = steps[level - 1]
      if (!Number.isFinite(pieces)) return null
      // 방어구 5부위로도 모자라면 엄격 검색은 탐색 첫 단계에서 끝나고, 모자란 조합 찾기는 그만큼 모자란 것으로 센다
      bonuses.push({ skillId, pieces, steps, locked: locked.has(skillId) })
    } else {
      points.push({ skillId, need: level, locked: locked.has(skillId) })
    }
  }

  const excluded = new Set(
    request.excludedSkills.filter((id) => {
      const kind = db.skills.get(id)?.kind
      return (kind === 'armor' || kind === 'weapon') && !merged.has(id)
    }),
  )
  const excludeMode = request.excludeMode === 'exclude'

  // ---- 장식주 풀 판정 ----
  // 장식주 없이 찾으면 후보 장식주가 없어 점수형 요구 스킬이 모두 'none' 풀이 된다 (방어구·호석·무기 점수로만 판정)
  const allowedDecos = request.useDecorations
    ? db.data.decorations.filter((d) => !excludeMode || !d.skills.some((s) => excluded.has(s.skillId)))
    : []
  const minSize = points.map(() => ({ armor: 4, weapon: 4 }))
  for (const deco of allowedDecos) {
    points.forEach((p, i) => {
      if (pointsOf(deco.skills, p.skillId) > 0) minSize[i][deco.kind] = Math.min(minSize[i][deco.kind], deco.size)
    })
  }
  const required: PointRequirement[] = points.map((p, i) => {
    const armor = minSize[i].armor <= 3
    const weapon = minSize[i].weapon <= 3
    return { ...p, pool: armor && weapon ? 'both' : armor ? 'armor' : weapon ? 'weapon' : 'none' }
  })
  const poolIndices = (pool: Pool) => required.flatMap((r, i) => (r.pool === pool ? [i] : []))
  const armorIdx = poolIndices('armor')
  const weaponIdx = poolIndices('weapon')
  const bothIdx = poolIndices('both')

  // ---- 장식주 여유분 (§6.8): 채우기마다 맡은 종류의 슬롯에 남겨야 하는 장식주 ----
  const spare: SpareSizes = { armor: [0, 0, 0], weapon: [0, 0, 0] }
  for (const slot of request.spareSlots) {
    if ((slot.kind === 'armor' || slot.kind === 'weapon') && slot.level >= 1 && slot.level <= 3) spare[slot.kind][slot.level - 1]++
  }
  const NONE: SizeCounts = [0, 0, 0]
  const spareFor = (kinds: readonly SlotKind[]): SpareSizes => ({
    armor: kinds.includes('armor') ? spare.armor : NONE,
    weapon: kinds.includes('weapon') ? spare.weapon : NONE,
  })

  const makeFiller = (indices: number[], kinds: readonly SlotKind[], allowUnwanted: boolean) => {
    const decos: FillDeco[] = []
    for (const decoration of allowedDecos) {
      if (!kinds.includes(decoration.kind)) continue
      const unwanted = unwantedOf(decoration.skills, excluded)
      if (unwanted.length > 0 && !allowUnwanted) continue
      const pts = indices.map((i) => Math.min(required[i].need, pointsOf(decoration.skills, required[i].skillId)))
      if (pts.every((p) => p === 0)) continue
      decos.push({ decoration, kind: decoration.kind, size: decoration.size, pts, unwanted })
    }
    return new DecoFiller(
      decos,
      indices.length,
      indices.map((i) => required[i].locked),
      spareFor(kinds),
    )
  }
  const makeFillers = (indices: number[], kinds: readonly SlotKind[]): Fillers => ({
    clean: makeFiller(indices, kinds, false),
    all: excludeMode ? null : makeFiller(indices, kinds, true),
    indices,
  })
  const joint = bothIdx.length > 0
  const armorFill = makeFillers(joint ? [] : armorIdx, ['armor'])
  const weaponFill = makeFillers(joint ? [] : weaponIdx, ['weapon'])
  const jointFill = joint ? makeFillers([...armorIdx, ...weaponIdx, ...bothIdx], ['armor', 'weapon']) : null

  // ---- 무기 (사용자가 고정) ----
  const weaponLevels = (resolvedWeapon?.slots ?? []).map((s) => s.level)
  const weapon = {
    present: resolvedWeapon !== null,
    pts: Int32Array.from(required, (r) => (resolvedWeapon ? pointsOf(resolvedWeapon.skills, r.skillId) : 0)),
    slots: weaponLevels,
    slotCounts: countSlots(weaponLevels),
    defense: resolvedWeapon?.defense.max ?? 0,
    bonusIds: resolvedWeapon?.bonusSkillIds ?? [],
  }

  // ---- 임계 레벨별 방어구 슬롯 잠재력 ----
  const armorDecosForBounds = allowedDecos.filter((d) => d.kind === 'armor')
  const thresholdsOf = (skillIndices: readonly number[]): Threshold[] => {
    const list: Threshold[] = []
    for (const t of [1, 2, 3]) {
      const indices = skillIndices.filter((i) => minSize[i].armor >= t)
      if (indices.length === 0) continue
      const pot: [number, number, number] = [0, 0, 0]
      for (const deco of armorDecosForBounds) {
        let total = 0
        for (const i of indices) total += Math.min(required[i].need, pointsOf(deco.skills, required[i].skillId))
        for (let level = deco.size; level <= 3; level++) pot[level - 1] = Math.max(pot[level - 1], total)
      }
      const sparePot = spare.armor[0] * pot[0] + spare.armor[1] * pot[1] + spare.armor[2] * pot[2]
      list.push({ indices, pot, remaining: new Float64Array(ARMOR_KINDS.length + 1), sparePot })
    }
    return list
  }
  const thresholds = thresholdsOf(armorIdx)
  // 모자란 조합 찾기에서 고정한 스킬은 다른 스킬과 따로 다 채워야 하므로 따로 본다
  const lockedThresholds = thresholdsOf(armorIdx.filter((i) => required[i].locked))
  /** 클래스 하나가 임계 묶음에 줄 수 있는 최대치: 그 스킬들 점수 + 슬롯 잠재력 */
  const potentialOf = (cls: ArmorClass, th: Threshold) => {
    let value = 0
    for (const i of th.indices) value += cls.pts[i]
    for (let level = 0; level < 3; level++) value += cls.slotCounts[level] * th.pot[level]
    return value
  }

  // ---- 방어구 후보 ----
  const excludedArmor = new Set(request.excludedArmorIds)
  const candidatesOf = new Map(
    ARMOR_KINDS.map((kind) => [
      kind,
      db.armorByKind[kind].filter(
        (p) =>
          (request.includeLowRank || p.rank !== 'low') &&
          !excludedArmor.has(p.id) &&
          !(excludeMode && p.skills.some((s) => excluded.has(s.skillId))),
      ),
    ]),
  )

  // ---- 내성 조건 (§6.9): 후보로 늘 채워지는 조건은 빼고(그 내성으로 결과를 나누지 않는다), 못 채우면 결과가 없다 ----
  const minOf = new Map<Element, number>()
  for (const { element, min } of request.minResistances) {
    if (ELEMENTS.includes(element) && Number.isFinite(min)) {
      minOf.set(element, Math.max(minOf.get(element) ?? -Infinity, Math.ceil(min)))
    }
  }
  const resistances: ResistanceMin[] = []
  for (const element of ELEMENTS) {
    const min = minOf.get(element)
    if (min === undefined) continue
    let low = 0
    let high = 0
    for (const kind of ARMOR_KINDS) {
      // 후보가 없는 부위는 미장착 (내성 0)
      const values = candidatesOf.get(kind)!.map((p) => p.resistances[element])
      low += values.length > 0 ? Math.min(...values) : 0
      high += values.length > 0 ? Math.max(...values) : 0
    }
    if (high < min) return null
    if (low < min) resistances.push({ element, min })
  }
  // ---- 내성순 정렬 (§6.10): 정렬 속성의 내성도 옵션을 나누는 내성에 넣는다 (조건에 없으면 조건 뒤에) ----
  const resElements = resistances.map((r) => r.element)
  let sortRes = -1
  const sortElement = ELEMENTS.find((element) => element === request.sort)
  if (sortElement) {
    sortRes = resElements.indexOf(sortElement)
    if (sortRes < 0) sortRes = resElements.push(sortElement) - 1
  }

  // ---- 방어구 탐색 클래스 (§6.2) ----
  // 결과 정렬 기준(engine.ts)과 같은 순서: 슬롯 점수 → 방어력, 방어력순이면 반대, 내성순이면 그 내성(클래스에서 가장 높은 값)부터
  const byResultOrder = (a: ArmorClass, b: ArmorClass) => {
    const slots = slotScore(b.slotCounts) - slotScore(a.slotCounts)
    const defense = b.defense - a.defense
    if (sortRes >= 0) return b.resMax[sortRes] - a.resMax[sortRes] || slots || defense
    return request.sort === 'defense' ? defense || slots : slots || defense
  }
  // α/β 바꾸기에 쓰는 장식주: 원하는 점수형 스킬마다 그 스킬만 1레벨 주는 방어구 장식주 (가장 작은 것)
  const requiredIndex = new Map(required.map((r, i) => [r.skillId, i]))
  const swapJewel = new Map<number, Decoration>()
  for (const deco of allowedDecos) {
    if (deco.kind !== 'armor' || deco.skills.length !== 1 || deco.skills[0].level !== 1) continue
    const skillId = deco.skills[0].skillId
    const prev = swapJewel.get(skillId)
    if (requiredIndex.has(skillId) && (!prev || deco.size < prev.size)) swapJewel.set(skillId, deco)
  }
  /**
   * 부위 하나의 탐색 클래스. splitRes 면 조건을 건 내성이 같은 옵션끼리만 묶는다 (§6.9).
   * 내성순 정렬 속성으로는 나누지 않는다: 나누면 넓은 검색의 잎이 크게 늘어 상한에 걸린다.
   * 잎의 순위 상한은 장식주가 다 들어가는 조합으로 따로 구한다 (engine 의 bestFitRes, §6.10)
   */
  const classesOf = (kind: ArmorKind, splitRes: boolean): ArmorClass[] => {
    const strictList = strictOptions(candidatesOf.get(kind)!, request.transcend, required, bonuses, excluded, resElements)
    const moves = findSwaps(strictList, required, requiredIndex, swapJewel)
    // 원하는 스킬 점수·시리즈/그룹 소속·비선호(splitRes 면 조건을 건 내성도)가 같고 슬롯이 들어가는 첫 클래스(슬롯 많은 순)에
    // 붙인다. α 는 짝의 클래스로
    const classes: ArmorClass[] = []
    const sameOf = new Map<ArmorClass, string>()
    const home = new Map<StrictOption, { cls: ArmorClass; index: number }>()
    for (const strict of strictList) {
      if (moves.has(strict)) continue
      const same = splitRes ? `${strict.same}|${strict.option.res.subarray(0, resistances.length).join(',')}` : strict.same
      let cls = classes.find((c) => sameOf.get(c) === same && coversSlots(c.slots, strict.option.slots))
      if (!cls) {
        cls = {
          options: [],
          groups: [],
          pts: strict.pts,
          bonus: strict.bonus,
          slots: strict.option.slots,
          slotCounts: strict.option.slotCounts,
          unwanted: strict.unwanted,
          defense: 0,
          resMin: new Int32Array(resElements.length),
          resMax: new Int32Array(resElements.length),
          potential: [0, 0, 0],
        }
        classes.push(cls)
        sameOf.set(cls, same)
      }
      home.set(strict, { cls, index: cls.options.length })
      cls.options.push(strict.option)
    }
    for (const [alpha, { partner, swap }] of moves) {
      const { cls, index } = home.get(partner)!
      alpha.option.swap = { ...swap, partner: index }
      cls.options.push(alpha.option)
    }
    if (classes.length === 0) {
      // 후보가 하나도 없으면 미장착
      const empty: ArmorOption = {
        members: [],
        slots: [],
        slotCounts: [0, 0, 0],
        defense: 0,
        bonusIds: [],
        res: new Int32Array(resElements.length),
        swap: null,
      }
      classes.push({
        options: [empty],
        groups: [],
        pts: new Int32Array(required.length),
        bonus: new Uint8Array(bonuses.length),
        slots: [],
        slotCounts: [0, 0, 0],
        unwanted: [],
        defense: 0,
        resMin: new Int32Array(resElements.length),
        resMax: new Int32Array(resElements.length),
        potential: [0, 0, 0],
      })
    }
    for (const cls of classes) {
      cls.defense = Math.max(...cls.options.map((o) => o.defense))
      resElements.forEach((_, j) => {
        cls.resMin[j] = Math.min(...cls.options.map((o) => o.res[j]))
        cls.resMax[j] = Math.max(...cls.options.map((o) => o.res[j]))
      })
      cls.groups = optionGroups(cls.options)
      thresholds.forEach((th, ti) => {
        cls.potential[ti] = potentialOf(cls, th)
      })
    }
    // 유망한 클래스부터 탐색 (상한에 걸려 중단돼도 좋은 결과가 먼저 나오도록). 잠재력이 같으면 결과 정렬 기준 순.
    // 장식주 없이 찾으면 잠재력이 모두 0 이고 리프가 모두 결과라서 정렬 기준 순서만 남는다.
    // 내성순은 정렬 속성 내성이 높은 클래스부터: 잠재력부터 보면 넓은 검색이 중단될 때 내성이 낮은 결과만 남는다 (§6.10)
    classes.sort((a, b) =>
      sortRes >= 0
        ? b.resMax[sortRes] - a.resMax[sortRes] || b.potential[0] - a.potential[0] || byResultOrder(a, b)
        : b.potential[0] - a.potential[0] || byResultOrder(a, b),
    )
    return classes
  }
  const classesByKind = new Map(ARMOR_KINDS.map((kind) => [kind, classesOf(kind, true)]))
  const kinds = [...ARMOR_KINDS].sort((a, b) => classesByKind.get(a)!.length - classesByKind.get(b)!.length)
  // 내성 조건: 탐색 순서의 마지막 부위는 내성으로 나누지 않고 잎에서 옵션 묶음마다 거른다. 앞 부위의 내성 합이 정해져 있어
  // 정확하고, 그 부위를 나눠 늘어날 잎이 생기지 않는다 (§6.9)
  const lastKind = kinds[kinds.length - 1]
  if (resistances.length > 0) classesByKind.set(lastKind, classesOf(lastKind, false))
  const classes = kinds.map((k) => classesByKind.get(k)!)

  // ---- 호석 탐색 클래스: 원하는 스킬 점수·슬롯·비선호가 같은 호석. 그 안에서 스킬까지 같은 호석끼리 옵션 ----
  const talismanCandidates: SearchTalisman[] = []
  for (const t of request.talismans) {
    if (t.ref.type === 'fixed') {
      const fixed = db.talismans.get(t.ref.id)
      if (fixed) talismanCandidates.push({ ref: t.ref, skills: fixed.skills, slots: [] })
    } else {
      talismanCandidates.push(t)
    }
  }
  const talismanGroups = new Map<string, { cls: TalismanClass; bySkills: Map<string, SearchTalisman[]> }>()
  for (const t of talismanCandidates) {
    const unwanted = unwantedOf(t.skills, excluded)
    if (excludeMode && unwanted.length > 0) continue
    const pts = Int32Array.from(required, (r) => Math.min(r.need, pointsOf(t.skills, r.skillId)))
    const key = `${pts.join(',')}|${t.slots.map((s) => `${s.kind[0]}${s.level}`).join('')}|${unwanted.join(',')}`
    let group = talismanGroups.get(key)
    if (!group) {
      const cls: TalismanClass = {
        options: [],
        pts,
        slots: t.slots,
        armorSlots: countSlots(t.slots.filter((s) => s.kind === 'armor').map((s) => s.level)),
        weaponSlots: countSlots(t.slots.filter((s) => s.kind === 'weapon').map((s) => s.level)),
        unwanted,
      }
      group = { cls, bySkills: new Map() }
      talismanGroups.set(key, group)
    }
    const skillsKey = levelsKey(levelsOf(t.skills))
    let option = group.bySkills.get(skillsKey)
    if (!option) {
      option = []
      group.bySkills.set(skillsKey, option)
      group.cls.options.push(option)
    }
    option.push(t)
  }
  const talismans = [...talismanGroups.values()].map((g) => g.cls)
  if (talismans.length === 0) {
    talismans.push({
      options: [[]],
      pts: new Int32Array(required.length),
      slots: [],
      armorSlots: [0, 0, 0],
      weaponSlots: [0, 0, 0],
      unwanted: [],
    })
  }
  const talismanPotential = (t: TalismanClass) =>
    t.pts.reduce((s, p) => s + p, 0) +
    t.armorSlots[0] + t.armorSlots[1] * 2 + t.armorSlots[2] * 3 +
    t.weaponSlots[0] + t.weaponSlots[1] * 2 + t.weaponSlots[2] * 3
  talismans.sort((a, b) => talismanPotential(b) - talismanPotential(a))

  // ---- 가지치기 테이블 ----
  const depthCount = kinds.length
  const remainingPts = Array.from({ length: depthCount + 1 }, () => new Int32Array(required.length))
  const remainingBonus = Array.from({ length: depthCount + 1 }, () => new Int32Array(bonuses.length))
  const noneIndices = poolIndices('none')
  const remainingNone = new Int32Array(depthCount + 1)
  const remainingAtLeast = Array.from({ length: depthCount + 1 }, (): [number, number, number] => [0, 0, 0])
  const remainingRes = Array.from({ length: depthCount + 1 }, () => new Int32Array(resistances.length))
  for (let d = depthCount - 1; d >= 0; d--) {
    const kindClasses = classes[d]
    for (let j = 0; j < resistances.length; j++) {
      let max = -Infinity
      for (const cls of kindClasses) max = Math.max(max, cls.resMax[j])
      remainingRes[d][j] = remainingRes[d + 1][j] + max
    }
    let noneMax = 0
    for (const cls of kindClasses) {
      let sum = 0
      for (const i of noneIndices) sum += cls.pts[i]
      noneMax = Math.max(noneMax, sum)
    }
    remainingNone[d] = remainingNone[d + 1] + noneMax
    // 클래스 [0] 옵션의 슬롯이 그 클래스 모든 옵션의 슬롯을 덮는다
    const [s1, s2, s3] = [0, 1, 2].map((k) =>
      Math.max(0, ...kindClasses.map((c) => c.slotCounts.slice(k).reduce((sum, n) => sum + n, 0))),
    )
    remainingAtLeast[d] = [remainingAtLeast[d + 1][0] + s1, remainingAtLeast[d + 1][1] + s2, remainingAtLeast[d + 1][2] + s3]
    for (let i = 0; i < required.length; i++) {
      let max = 0
      for (const cls of kindClasses) max = Math.max(max, cls.pts[i])
      remainingPts[d][i] = remainingPts[d + 1][i] + max
    }
    for (let j = 0; j < bonuses.length; j++) {
      remainingBonus[d][j] = remainingBonus[d + 1][j] + (kindClasses.some((c) => c.bonus[j] === 1) ? 1 : 0)
    }
    thresholds.forEach((th, ti) => {
      let max = 0
      for (const cls of kindClasses) max = Math.max(max, cls.potential[ti])
      th.remaining[d] = th.remaining[d + 1] + max
    })
    for (const th of lockedThresholds) {
      let max = 0
      for (const cls of kindClasses) max = Math.max(max, potentialOf(cls, th))
      th.remaining[d] = th.remaining[d + 1] + max
    }
  }

  const weaponPrecheck = !joint && classes.every((kindClasses) => kindClasses.every((c) => weaponIdx.every((i) => c.pts[i] === 0)))

  const customTalismans: CustomTalisman[] = talismanCandidates
    .filter((t) => t.ref.type === 'custom')
    .map((t) => ({ id: t.ref.id as string, name: '', rarity: null, skills: t.skills, slots: t.slots }))

  return {
    required,
    bonuses,
    resistances,
    resElements,
    sortRes,
    excluded: [...excluded].sort((a, b) => a - b),
    kinds,
    classes,
    talismans,
    weapon,
    armorFill,
    weaponFill,
    jointFill,
    weaponPrecheck,
    spare,
    bounds: {
      noneIndices,
      remainingPts,
      remainingNone,
      remainingBonus,
      thresholds,
      lockedThresholds,
      remainingAtLeast,
      remainingRes,
    },
    customTalismans,
  }
}
