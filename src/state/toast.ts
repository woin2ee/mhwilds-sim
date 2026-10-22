import { createContext, useContext } from 'react'

/** 화면 아래에 잠깐 뜨는 알림. 모달 대화상자 안에서는 가려지므로 대화상자를 닫은 뒤에 쓴다. */
export const ToastContext = createContext<(message: string) => void>(() => {})

export function useToast(): (message: string) => void {
  return useContext(ToastContext)
}
