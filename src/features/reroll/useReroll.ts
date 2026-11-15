import type { Dispatch, SetStateAction } from 'react'
import {
  isGogmaRollList,
  isRerollChecked,
  isRerollProgress,
  isRestoreRollList,
  NO_CHECKED,
  NO_PROGRESS,
  type GogmaRoll,
  type RerollChecked,
  type RerollProgress,
  type RestoreRoll,
} from '../../core/gogmaRolls'
import { usePersistentState } from '../../lib/storage'
import { STORAGE_KEYS } from '../../state/storedValues'

// 거극 아티어 리롤 기록과 진행 (브라우저 저장, 드라이브 동기화·백업에 담긴다). 같은 키를 쓰는 훅끼리 따라 바뀐다

export function useGogmaRolls(): [GogmaRoll[], Dispatch<SetStateAction<GogmaRoll[]>>] {
  return usePersistentState<GogmaRoll[]>(STORAGE_KEYS.gogmaRolls, [], isGogmaRollList)
}

export function useGogmaRestores(): [RestoreRoll[], Dispatch<SetStateAction<RestoreRoll[]>>] {
  return usePersistentState<RestoreRoll[]>(STORAGE_KEYS.gogmaRestores, [], isRestoreRollList)
}

export function useRerollProgress(): [RerollProgress, Dispatch<SetStateAction<RerollProgress>>] {
  return usePersistentState<RerollProgress>(STORAGE_KEYS.gogmaProgress, NO_PROGRESS, isRerollProgress)
}

export function useRerollChecked(): [RerollChecked, Dispatch<SetStateAction<RerollChecked>>] {
  return usePersistentState<RerollChecked>(STORAGE_KEYS.gogmaChecked, NO_CHECKED, isRerollChecked)
}
