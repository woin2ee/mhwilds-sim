// 세팅 저장·공유 계약. 형식 명세는 docs/DESIGN.md §8.
import type { SavedBuild } from '../savedBuilds'
import type { BuildState, CustomTalisman } from '../types'

/** 직접 입력 호석의 내용 (id 제외). 공유 코드·백업에 담긴다. */
export type TalismanDraft = Omit<CustomTalisman, 'id'>

/** 공유 코드에서 꺼낸 세팅 */
export interface DecodedBuild {
  /** 코드에 들어 있던 세팅 이름 */
  name: string | null
  /**
   * 꺼낸 세팅. 직접 입력 호석이 들어 있으면 build.talisman 은 { type: 'custom', id: '' } 자리표시자이고,
   * attachTalisman() 으로 내 호석과 연결해야 한다.
   */
  build: BuildState
  talisman: TalismanDraft | null
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
  /** code 는 이름을 뺀 공유 코드 (이름은 name 에) */
  builds: { name: string; memo: string; createdAt: string; updatedAt: string; code: string }[]
}

export interface BackupImportResult {
  /** 기존 목록 + 가져온 항목 (병합 결과 전체) */
  savedBuilds: SavedBuild[]
  customTalismans: CustomTalisman[]
  addedBuilds: number
  addedTalismans: number
  /** 이름과 내용이 같은 세팅이 이미 있어 건너뛴 수 */
  skippedBuilds: number
  /** 현재 데이터에서 찾지 못한 항목 요약 */
  missing: string[]
  /** 백업을 만든 시각 (ISO, 없으면 null) */
  exportedAt: string | null
}
