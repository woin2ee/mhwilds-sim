// 모달 <dialog> 의 바깥(배경)을 눌러 닫기
import { useRef, type MouseEvent, type PointerEvent } from 'react'

/**
 * <dialog> 에 펼쳐 붙이는 이벤트 핸들러. 배경에서 눌렀다가 배경에서 뗐을 때만 onClose 를 부른다.
 * click 은 누른 곳과 뗀 곳의 공통 조상에서 일어나므로, 창 안 입력 칸에서 글자를 끌어 고르다 배경에서 떼면
 * <dialog> 자신(배경)을 누른 것처럼 온다. 그래서 누를 때 어디였는지 따로 기억한다.
 */
export function useBackdropClose(onClose: () => void) {
  const pressed = useRef(false)
  return {
    onPointerDown: (e: PointerEvent<HTMLDialogElement>) => {
      pressed.current = onBackdrop(e)
    },
    onClick: (e: MouseEvent<HTMLDialogElement>) => {
      if (pressed.current && onBackdrop(e)) onClose()
      pressed.current = false
    },
  }
}

/**
 * 창 테두리 바깥(배경)을 눌렀는지. 배경을 누르면 target 이 <dialog> 자신이 되고, 안에 든 다른 <dialog>(터치 기기의
 * 선택 시트)에서 올라온 이벤트는 target 이 그쪽이라 빠진다. 배경에서 눌러 창 안에서 뗀 click 도 target 이 <dialog> 라서
 * 좌표로 한 번 더 본다.
 */
function onBackdrop(e: MouseEvent<HTMLDialogElement>) {
  if (e.target !== e.currentTarget) return false
  const rect = e.currentTarget.getBoundingClientRect()
  return e.clientX < rect.left || e.clientX >= rect.right || e.clientY < rect.top || e.clientY >= rect.bottom
}
