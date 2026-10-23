/** 저장 항목의 새 id. crypto.randomUUID 는 보안 컨텍스트(https, localhost)에서만 있다 (휴대폰에서 LAN 주소로 열 때 등) */
export function newId(): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
