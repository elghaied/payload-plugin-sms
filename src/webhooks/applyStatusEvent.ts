import type { Payload, PayloadRequest } from 'payload'

import type { SMSPluginConfig, SMSStatus, SMSStatusEvent } from '../types.js'

import { shouldUpdate } from './rank.js'

export interface ApplyStatusEventDeps {
  payload: Payload
  logsSlug: string | undefined
  adapterName: string
  event: SMSStatusEvent
  pluginConfig: SMSPluginConfig
  req: PayloadRequest
  logsIncludeStatusHistory: boolean
}

export const applyStatusEvent = async (
  deps: ApplyStatusEventDeps,
): Promise<void> => {
  const { payload, logsSlug, adapterName, event, pluginConfig, req } = deps

  let log: Record<string, unknown> | null = null

  if (logsSlug) {
    try {
      const { docs } = await payload.find({
        collection: logsSlug,
        where: {
          providerMessageId: { equals: event.providerMessageId },
          provider: { equals: adapterName },
        },
        limit: 1,
      })
      log = (docs[0] as Record<string, unknown>) ?? null
    } catch (err) {
      payload.logger.warn({
        msg: 'payload-plugin-sms webhook: log lookup failed',
        err,
      })
    }

    if (!log) {
      payload.logger.warn({
        msg: 'payload-plugin-sms webhook: no matching log row',
        providerMessageId: event.providerMessageId,
        adapter: adapterName,
      })
    } else {
      const currentStatus = (log.status as SMSStatus | undefined) ?? 'unknown'
      const rankAdvance = shouldUpdate(currentStatus, event.status)

      const data: Record<string, unknown> = {}

      if (rankAdvance) {
        data.status = event.status
        if (event.status === 'delivered') data.deliveredAt = event.occurredAt
        if (event.status === 'failed') data.failedAt = event.occurredAt
        if (event.errorCode !== undefined) data.errorCode = event.errorCode
        if (event.errorMessage !== undefined) data.error = event.errorMessage
        if (event.cost && !log.cost) data.cost = event.cost
      }

      if (deps.logsIncludeStatusHistory) {
        const existing = Array.isArray(log.statusHistory)
          ? (log.statusHistory as Array<Record<string, unknown>>)
          : []
        data.statusHistory = [
          ...existing,
          {
            status: event.status,
            occurredAt: event.occurredAt,
            errorCode: event.errorCode,
          },
        ]
      }

      if (Object.keys(data).length > 0) {
        try {
          const updated = await payload.update({
            collection: logsSlug,
            id: log.id as string,
            data,
          })
          log = updated as unknown as Record<string, unknown>
        } catch (err) {
          payload.logger.warn({
            msg: 'payload-plugin-sms webhook: log update failed',
            err,
          })
        }
      }
    }
  }

  if (pluginConfig.onStatus) {
    try {
      await pluginConfig.onStatus({ event, log, req })
    } catch (err) {
      payload.logger.warn({
        msg: 'payload-plugin-sms onStatus hook failed',
        err,
      })
    }
  }
}
