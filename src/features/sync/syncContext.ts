import { createContext, useContext } from 'react'
import type { DriveAccount } from '../../lib/googleDrive'

export type SyncPhase = 'idle' | 'syncing' | 'error'

/** Google 드라이브 동기화 상태 (SyncProvider, DESIGN.md §8.5) */
export interface SyncValue {
  /** 연결한 계정 (연결하지 않았으면 null) */
  account: DriveAccount | null
  phase: SyncPhase
  /** phase 가 error 일 때 문구 */
  error: string | null
  /** 마지막으로 동기화한 시각 (ISO) */
  syncedAt: string | null
  /** 구글 로그인이 살아 있다 (1시간). 끝나면 버튼을 눌러야 동기화한다 */
  signedIn: boolean
  /** 마지막 동기화 뒤 이 기기에서 바꾼 것이 있다 */
  pending: boolean
  /** 구글 로그인 스크립트가 준비됐다 (팝업은 클릭 처리 중에 바로 열어야 해서 미리 불러 둔다) */
  ready: boolean
  /** 로그인 스크립트를 불러오지 못했다 (인터넷·광고 차단 등). prepare 로 다시 시도한다 */
  loadFailed: boolean
  /** 로그인 스크립트를 미리 불러 둔다 (연결 화면을 볼 때) */
  prepare: () => void
  /** 계정을 골라 연결하고 처음 동기화한다. 클릭 처리 중에 부른다 */
  connect: () => void
  /** 지금 동기화한다 (로그인이 끝났으면 팝업). 클릭 처리 중에 부른다 */
  syncNow: () => void
  /** 연결을 끊는다. deleteRemote 면 드라이브의 동기화 데이터도 지운다. 끊었으면 true */
  disconnect: (options: { deleteRemote: boolean }) => Promise<boolean>
}

export const SyncContext = createContext<SyncValue | null>(null)

export function useSync(): SyncValue {
  const value = useContext(SyncContext)
  if (!value) throw new Error('useSync must be used inside SyncProvider')
  return value
}
