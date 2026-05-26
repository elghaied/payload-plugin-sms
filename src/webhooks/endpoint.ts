import type { Payload, PayloadRequest } from 'payload'

import type { SMSPluginConfig, SMSWebhookHandler } from '../types.js'

import { SMSWebhookVerificationError } from '../errors.js'
import { applyStatusEvent } from './applyStatusEvent.js'
import { readRawBody } from './rawBody.js'

export interface MakeWebhookEndpointHandlerDeps {
  adapterName: string
  handler: SMSWebhookHandler
  logsIncludeStatusHistory: boolean
  logsSlug: string | undefined
  payload: Payload
  pluginConfig: SMSPluginConfig
}

export const makeWebhookEndpointHandler =
  (deps: MakeWebhookEndpointHandlerDeps) =>
  async (req: PayloadRequest): Promise<Response> => {
    const {
      adapterName,
      handler,
      logsIncludeStatusHistory,
      logsSlug,
      payload,
      pluginConfig,
    } = deps

    let rawBody: Buffer
    try {
      rawBody = await readRawBody(req)
    } catch (err) {
      payload.logger.warn({
        adapter: adapterName,
        err,
        msg: 'payload-plugin-sms webhook: failed to read raw body',
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
            adapter: adapterName,
            err: err.message,
            msg: 'payload-plugin-sms webhook: signature verification failed',
          })
          return new Response('Forbidden', { status: 403 })
        }
        payload.logger.error({
          adapter: adapterName,
          err,
          msg: 'payload-plugin-sms webhook: verify threw unexpectedly',
        })
        return new Response('Internal Server Error', { status: 500 })
      }
    }

    let events
    try {
      events = await handler.parse(req, rawBody)
    } catch (err) {
      payload.logger.error({
        adapter: adapterName,
        err,
        msg: 'payload-plugin-sms webhook: parse failed',
      })
      return new Response('Internal Server Error', { status: 500 })
    }

    for (const event of events) {
      await applyStatusEvent({
        adapterName,
        event,
        logsIncludeStatusHistory,
        logsSlug,
        payload,
        pluginConfig,
        req,
      })
    }

    return new Response(null, { status: 200 })
  }
