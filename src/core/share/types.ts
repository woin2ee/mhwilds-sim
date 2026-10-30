// 세팅 저장·공유 계약. 형식 명세는 docs/DESIGN.md §8.
import type { WeaponKind } from '../../data/types'
import type { SavedBuild } from '../savedBuilds'
import type { BuildState, CustomTalisman, TalismanDraft } from '../types'

/** 공유 코드에서 꺼낸 세팅 */
export interface DecodedBuild {
  /** 코드에 들어 있던 세팅 이름 */
  name: string | null
  /**
   * 꺼낸 세팅. 직접 입력 호석은 세팅 전용 호석({ type: 'inline' })으로 들어 있다.
   * 열거나 저장할 때 linkTalisman() 으로 내용이 같은 내 호석에 연결한다 (없으면 세팅 전용 그대로).
   */
  build: BuildState
  /** 현재 데이터에서 찾지 못해 비운 항목 (예: '머리 방어구', '장식주 2개') */
  missing: string[]
}

/** 잘못되거나 지원하지 않는 코드/파일 */
export class ShareCodeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ShareCodeError'
  }
}

/**
 * 백업의 호석. id 는 담지 않는다 (가져올 때 새로 받음).
 * skillGameIds 는 skills 와 같은 순서의 게임 내부 id (데이터를 다시 만들어도 스킬을 찾기 위함)
 */
export type BackupTalisman = TalismanDraft & { skillGameIds?: (number | null)[] }

/** 백업 (JSON 파일 또는 백업 코드). 세팅은 공유 코드 형태로 담아 데이터 갱신에도 깨지지 않게 한다. */
export interface BackupFile {
  app: 'mhwilds-sim'
  kind: 'backup'
  version: 1
  exportedAt: string
  /** 내보낼 때의 데이터 버전 (참고용) */
  dataVersion: string
  talismans: BackupTalisman[]
  /** code 는 이름을 뺀 공유 코드 (이름은 name 에). weaponKind 는 저장할 때 고른 무기 종류 (SavedBuild 와 같음, 없으면 키 없음) */
  builds: { name: string; memo: string; weaponKind?: WeaponKind; createdAt: string; updatedAt: string; code: string }[]
}

export interface BackupImportResult {
  /** 기존 목록 + 가져온 항목 (병합 결과 전체) */
  savedBuilds: SavedBuild[]
  customTalismans: CustomTalisman[]
  addedBuilds: number
  /** 백업의 내 호석 중 새로 더한 수 (세팅에 든 세팅 전용 호석은 내 호석에 넣지 않는다) */
  addedTalismans: number
  /** 이름과 내용이 같은 세팅이 이미 있어 건너뛴 수 */
  skippedBuilds: number
  /** 현재 데이터에서 찾지 못한 항목 요약 */
  missing: string[]
  /** 백업을 만든 시각 (ISO, 없으면 null) */
  exportedAt: string | null
}
