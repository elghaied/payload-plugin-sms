import type { Payload } from 'payload'

import type {
  OutboundSMSMessage,
  SMSMessage,
  SMSPluginConfig,
  SMSResult,
} from './types.js'

import { SMSProviderError, SMSValidationError } from './errors.js'

const E164 = /^\+[1-9]\d{1,14}$/

export interface MakeSendSMSDeps {
  payload: Payload
  pluginConfig: SMSPluginConfig
  logsSlug?: string
  logsIncludeContext?: boolean
}

export const makeSendSMS =
  ({ payload, pluginConfig, logsSlug, logsIncludeContext }: MakeSendSMSDeps) =>
  async (message: SMSMessage): Promise<SMSResult> => {
    if (!E164.test(message.to)) {
      throw new SMSValidationError(
        `Invalid 'to' phone number: ${JSON.stringify(message.to)}. Must be E.164, e.g. "+15551234567".`,
      )
    }

    const { adapter } = pluginConfig
    if (!adapter) {
      throw new SMSValidationError('No SMS adapter configured')
    }

    const from = message.from ?? pluginConfig.defaultFrom ?? adapter.defaultFrom
    if (!from) {
      throw new SMSValidationError(
        'No `from` resolved (set on message, pluginConfig.defaultFrom, or adapter.defaultFrom).',
      )
    }

    const outbound: OutboundSMSMessage = { ...message, from }

    let result: SMSResult
    try {
      result = await adapter.send(outbound)
    } catch (err) {
      const error =
        err instanceof Error ? err : new SMSProviderError(String(err))
      try {
        await pluginConfig.onError?.({ error, message: outbound, req: undefined })
      } catch (hookErr) {
        payload.logger.warn({ msg: 'payload-plugin-sms onError hook failed', err: hookErr })
      }
      throw error
    }

    // Context propagation: fill in result.context from message.context if the
    // adapter did not already set one.
    if (result.context === undefined && message.context !== undefined) {
      result = { ...result, context: message.context }
    }

    if (logsSlug) {
      try {
        await payload.create({
          collection: logsSlug,
          data: serializeResult(result, Boolean(logsIncludeContext)),
        })
      } catch (err) {
        payload.logger.warn({ msg: 'payload-plugin-sms log write failed', err })
      }
    }

    try {
      await pluginConfig.onSend?.({ result, req: undefined })
    } catch (err) {
      payload.logger.warn({ msg: 'payload-plugin-sms onSend hook failed', err })
    }

    return result
  }

const serializeResult = (
  result: SMSResult,
  includeContext: boolean,
): Record<string, unknown> => {
  const data: Record<string, unknown> = {
    to: result.to,
    from: result.from,
    body: result.body,
    provider: result.provider,
    status: result.status,
    providerMessageId: result.id,
    cost: result.cost,
    sentAt: result.sentAt,
  }
  if (includeContext && result.context !== undefined) {
    data.context = result.context
  }
  return data
}
