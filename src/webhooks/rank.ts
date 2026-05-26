import type { SMSStatus } from '../types.js'

const RANK: Record<SMSStatus, number> = {
  unknown: -1,
  queued: 0,
  sent: 1,
  delivered: 2,
  failed: 99,
}

export const rankStatus = (status: SMSStatus): number => RANK[status]

export const shouldUpdate = (current: SMSStatus, incoming: SMSStatus): boolean =>
  rankStatus(incoming) > rankStatus(current)
