import type { Payload, PayloadRequest } from 'payload'

import type { SMSPluginConfig, SMSStatus, SMSStatusEvent } from '../types.js'

import { shouldUpdate } from './rank.js'

export interface ApplyStatusEventDeps {
  adapterName: string
  event: SMSStatusEvent
  logsIncludeStatusHistory: boolean
  logsSlug: string | undefined
  payload: Payload
  pluginConfig: SMSPluginConfig
  req: PayloadRequest
}

export const applyStatusEvent = async (
  deps: ApplyStatusEventDeps,
): Promise<void> => {
  const { adapterName, event, logsSlug, payload, pluginConfig, req } = deps

  let log: null | Record<string, unknown> = null

  if (logsSlug) {
    try {
      const { docs } = await payload.find({
        collection: logsSlug,
        limit: 1,
        where: {
          provider: { equals: adapterName },
          providerMessageId: { equals: event.providerMessageId },
        },
      })
      log = (docs[0] as Record<string, unknown>) ?? null
    } catch (err) {
      payload.logger.warn({
        err,
        msg: 'payload-plugin-sms webhook: log lookup failed',
      })
    }

    if (!log) {
      payload.logger.warn({
        adapter: adapterName,
        msg: 'payload-plugin-sms webhook: no matching log row',
        providerMessageId: event.providerMessageId,
      })
    } else {
      const currentStatus = (log.status as SMSStatus | undefined) ?? 'unknown'
      const rankAdvance = shouldUpdate(currentStatus, event.status)

      const data: Record<string, unknown> = {}

      if (rankAdvance) {
        data.status = event.status
        if (event.status === 'delivered') {data.deliveredAt = event.occurredAt}
        if (event.status === 'failed') {data.failedAt = event.occurredAt}
        if (event.errorCode !== undefined) {data.errorCode = event.errorCode}
        if (event.errorMessage !== undefined) {data.error = event.errorMessage}
        if (event.cost && !log.cost) {data.cost = event.cost}
      }

      if (deps.logsIncludeStatusHistory) {
        const existing = Array.isArray(log.statusHistory)
          ? (log.statusHistory as Array<Record<string, unknown>>)
          : []
        data.statusHistory = [
          ...existing,
          {
            errorCode: event.errorCode,
            occurredAt: event.occurredAt,
            status: event.status,
          },
        ]
      }

      if (Object.keys(data).length > 0) {
        try {
          const updated = await payload.update({
            id: log.id as string,
            collection: logsSlug,
            data,
          })
          log = updated as unknown as Record<string, unknown>
        } catch (err) {
          payload.logger.warn({
            err,
            msg: 'payload-plugin-sms webhook: log update failed',
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
        err,
        msg: 'payload-plugin-sms onStatus hook failed',
      })
    }
  }
}
