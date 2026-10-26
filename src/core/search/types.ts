// 스킬 검색 엔진 ↔ UI 사이의 계약. 엔진(engine.ts)과 화면(features/search)이 이 타입만 공유한다.
import type { ArmorKind, GameData, SkillPoint, SlotLevel } from '../../data/types'
import type { EquipKey, Slot, TalismanRef, WeaponChoice } from '../types'

/**
 * exclude: 비선호 스킬이 붙은 방어구·호석·장식주를 후보에서 아예 뺀다
 * mark: 후보에 넣고 비선호 스킬이 들어간 결과도 같은 정렬로 섞는다 (화면은 그 스킬만 표시).
 *       장식주는 비선호 스킬이 없는 것으로 먼저 채워 보고 안 될 때만 쓴다
 */
export type ExcludeMode = 'exclude' | 'mark'

/** 결과 정렬 기준. 엔진은 이 기준으로 상위 limit 개를 고른다. */
export type SearchSort = 'slots' | 'defense'

/** 검색에서 고정되는 무기. UI가 resolveWeapon 으로 풀어서 넘긴다. */
export interface SearchWeapon {
  choice: WeaponChoice | null
  skills: SkillPoint[]
  slots: SlotLevel[]
}

/** 검색 후보 호석. UI가 resolveTalisman 으로 풀어서 넘긴다. */
export interface SearchTalisman {
  ref: TalismanRef
  skills: SkillPoint[]
  /** 슬롯 순서 = BuildState.decorations.talisman 인덱스 순서 */
  slots: Slot[]
}

export interface SearchRequest {
  /** 원하는 스킬과 최소 레벨. 시리즈/그룹 스킬은 발동 단계(rank level)로 지정 */
  required: SkillPoint[]
  /** 원하지 않는 스킬 (armor/weapon 스킬 id) */
  excludedSkills: number[]
  excludeMode: ExcludeMode
  weapon: SearchWeapon
  /** 후보 호석. 빈 배열이면 호석 없이 검색 */
  talismans: SearchTalisman[]
  /** 하위 랭크(레어도 1~4) 방어구 포함 여부 */
  includeLowRank: boolean
  /** 레어도 5~8 방어구에 초월 적용 (슬롯·방어력) */
  transcend: boolean
  /** false 면 장식주를 쓰지 않는다: 방어구·호석·무기 자체 스킬만으로 찾고 슬롯은 모두 남긴다 */
  useDecorations: boolean
  /**
   * 장식주 여유분 (DESIGN.md §6.8): 결과의 남는 슬롯에 이 크기·종류의 장식주를 하나씩 더 끼울 수 있어야 한다
   * (레벨이 같거나 큰 같은 종류의 남는 슬롯 하나에 하나씩). 예) [{ kind: 'armor', level: 3 }] = 방어구 Lv3 슬롯 하나를 비워 둔다.
   * 빈 배열 = 조건 없음
   */
  spareSlots: Slot[]
  /** 후보에서 뺄 방어구 id */
  excludedArmorIds: number[]
  sort: SearchSort
  /** 최대 반환 개수 */
  limit: number
  /**
   * 조건을 모두 채우는 조합이 없으면 원하는 스킬이 모자란 레벨 합이 이 값 이하인 조합 중 가장 적게 모자란 조합을 대신 찾는다.
   * 0 이면 찾지 않는다. 시리즈/그룹 스킬은 단계로 센다
   */
  maxShortfall: number
  /** 고정한 원하는 스킬 id: 모자란 조합을 찾을 때도 요구 레벨을 꼭 채운다 (낮추지 않는다) */
  lockedSkills: number[]
}

export interface SearchResultItem {
  /** React key 용 고유 값 */
  id: string
  /**
   * 부위별 후보 방어구 id. 대표([0])로 바꿔 껴도 스킬·남는 슬롯이 그대로인 방어구들이다: 스킬·시리즈/그룹 스킬·슬롯이 대표와 같은 것
   * (방어력 높은 순) 뒤에 α/β 바꾸기 후보(swaps)가 온다.
   * 나머지 값은 대표 기준. 빈 배열 = 해당 부위 미장착.
   */
  armor: Record<ArmorKind, number[]>
  /** 스킬·슬롯이 같은 후보 호석 ([0]이 대표). 빈 배열 = 호석 없음 */
  talismans: TalismanRef[]
  /** 대표 조합 기준 장식주 배치 (BuildState.decorations 와 같은 형식) */
  decorations: Record<EquipKey, (number | null)[]>
  /**
   * α/β 바꾸기 (DESIGN.md §6.2.1): 대체 방어구 id → 그 방어구가 속한 바꾸기 후보(key = 그 후보의 첫 방어구 id)와 바꿀 때 빼는 장식주 id.
   * 대표에 넣은 이 장식주의 스킬을 그 방어구가 스스로 갖고 그 장식주가 든 슬롯만 없어서, 빼면 스킬·남는 슬롯이 대표와 같다
   * (장식주 없이 시리즈/그룹 스킬만 다른 방어구도 있다). resultToBuild 가 뺀다
   */
  swaps: Record<number, { key: number; jewels: number[] }>
  /**
   * 함께 바꿔도 결과가 같은 바꾸기 조합: 부위 → 바꾸기 후보 key (하나짜리 포함). 여기 없는 조합으로 여러 부위를 함께 바꾸면
   * 시리즈/그룹 스킬이 달라진다
   */
  swapSets: Partial<Record<ArmorKind, number>>[]
  /** 대표 조합의 발동 스킬 레벨 (최대 레벨 적용, 시리즈/그룹 포함) */
  skillLevels: SkillPoint[]
  /** 대표 조합에 들어간 비선호 스킬 id */
  unwantedSkills: number[]
  /** 장식주를 넣고 남은 슬롯 */
  freeSlots: Slot[]
  /** 대표 조합 최대 방어력 (초월 반영) */
  defense: number
  /** 이 결과로 만들 수 있는 실제 방어구 조합 수: 부위별 후보 수의 곱 (바꾸기 후보는 swapSets 조합만, 호석 대체 후보는 제외) */
  variantCount: number
}

export interface SearchResponse {
  /** 정렬 기준 상위 limit 개. 비선호 스킬이 든 결과(unwantedSkills)도 같은 기준으로 섞여 있다 */
  items: SearchResultItem[]
  /** limit 적용 전 찾은 개수 */
  total: number
  /** 탐색 상한(시간/노드)에 걸려 중간에 멈췄는지 */
  truncated: boolean
  elapsedMs: number
  /** 0 = 모든 결과가 조건을 채운다. 1 이상이면 그런 조합이 없어서 원하는 스킬이 모두 합쳐 이만큼 모자란 조합을 대신 찾은 것 */
  shortfall: number
}

export interface SearchProgress {
  /** 0~1 */
  ratio: number
  found: number
  /** 조건을 채우는 조합이 없어 모자란 조합을 찾는 중 (ratio 는 0 부터 다시 센다) */
  relaxed: boolean
}

// ---- Web Worker 메시지 프로토콜 ----
export type WorkerInbound =
  | { type: 'init'; data: GameData }
  | { type: 'search'; id: number; request: SearchRequest }

export type WorkerOutbound =
  | { type: 'ready' }
  | { type: 'progress'; id: number; progress: SearchProgress }
  | { type: 'result'; id: number; response: SearchResponse }
  | { type: 'error'; id: number; message: string }
