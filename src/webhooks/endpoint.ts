import type { Payload, PayloadRequest } from 'payload'

import type { SMSPluginConfig, SMSWebhookHandler } from '../types.js'

import { SMSWebhookVerificationError } from '../errors.js'
import { applyStatusEvent } from './applyStatusEvent.js'
import { readRawBody } from './rawBody.js'

export interface MakeWebhookEndpointHandlerDeps {
  handler: SMSWebhookHandler
  adapterName: string
  payload: Payload
  pluginConfig: SMSPluginConfig
  logsSlug: string | undefined
  logsIncludeStatusHistory: boolean
}

export const makeWebhookEndpointHandler =
  (deps: MakeWebhookEndpointHandlerDeps) =>
  async (req: PayloadRequest): Promise<Response> => {
    const {
      handler,
      adapterName,
      payload,
      pluginConfig,
      logsSlug,
      logsIncludeStatusHistory,
    } = deps

    let rawBody: Buffer
    try {
      rawBody = await readRawBody(req)
    } catch (err) {
      payload.logger.warn({
        msg: 'payload-plugin-sms webhook: failed to read raw body',
        adapter: adapterName,
        err,
      })
      return new Response('Bad Request', { status: 400 })
    }

    const verifySignature = pluginConfig.webhooks?.verifySignature !== false
    if (verifySignature) {
      try {
        await handler.verify(req, rawBody)
      } catch (err) {
        if (err instanceof SMSWebhookVerificationError) {
          payload.logger.warn({
            msg: 'payload-plugin-sms webhook: signature verification failed',
            adapter: adapterName,
            err: err.message,
          })
          return new Response('Forbidden', { status: 403 })
        }
        payload.logger.error({
          msg: 'payload-plugin-sms webhook: verify threw unexpectedly',
          adapter: adapterName,
          err,
        })
        return new Response('Internal Server Error', { status: 500 })
      }
    }

    let events
    try {
      events = await handler.parse(req, rawBody)
    } catch (err) {
      payload.logger.error({
        msg: 'payload-plugin-sms webhook: parse failed',
        adapter: adapterName,
        err,
      })
      return new Response('Internal Server Error', { status: 500 })
    }

    for (const event of events) {
      await applyStatusEvent({
        payload,
        logsSlug,
        adapterName,
        event,
        pluginConfig,
        req,
        logsIncludeStatusHistory,
      })
    }

    return new Response(null, { status: 200 })
  }
