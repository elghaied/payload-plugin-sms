import type { SMSStatus } from '../types.js'

const RANK: Record<SMSStatus, number> = {
  delivered: 2,
  failed: 99,
  queued: 0,
  sent: 1,
  unknown: -1,
}

export const rankStatus = (status: SMSStatus): number => RANK[status]

export const shouldUpdate = (current: SMSStatus, incoming: SMSStatus): boolean =>
  rankStatus(incoming) > rankStatus(current)
