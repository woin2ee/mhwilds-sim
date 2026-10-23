import { createContext, useContext } from 'react'

export interface ToastAction {
  label: string
  onClick: () => void
}

export type ShowToast = (message: string, action?: ToastAction) => void

/**
 * 화면 아래에 잠깐 뜨는 알림. 모달 대화상자 안에서는 가려지므로 대화상자를 닫은 뒤에 쓴다.
 * action 을 주면 버튼(예: 되돌리기)이 붙고, 누를 시간이 있게 조금 더 오래 떠 있다.
 */
export const ToastContext = createContext<ShowToast>(() => {})

export function useToast(): ShowToast {
  return useContext(ToastContext)
}
