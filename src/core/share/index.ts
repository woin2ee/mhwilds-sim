// 세팅 저장·공유 (DESIGN.md §8). 화면 쪽은 이 파일에서만 가져다 쓴다.
export * from './types'
export { SHARE_HASH_KEY, extractShareCode, shareUrl } from './link'
export { FORMAT_VERSION, decodeBuild, encodeBuild } from './codec'
export { createBackup, importBackup } from './backup'
export { decodeBackupCode, encodeBackupCode, hasBackupCode } from './backupCode'
export { textCode, type TextCode } from './textCode'
