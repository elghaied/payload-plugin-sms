import type { Config, Endpoint, Plugin } from 'payload'

import type { SMSLogsCollectionOptions, SMSPluginConfig } from './types.js'

import { buildSMSLogsCollection } from './collections/SMSLogs.js'
import { makeSendSMS } from './sendSMS.js'
import { makeWebhookEndpointHandler } from './webhooks/endpoint.js'
import {
  assertUniquePaths,
  collectWebhookHandlers,
  resolvePath,
} from './webhooks/registry.js'

const resolveLogsSlug = (
  logs: boolean | SMSLogsCollectionOptions | undefined,
): string => {
  if (typeof logs === 'object' && logs?.slug) return logs.slug
  return 'sms-logs'
}

const resolveLogsIncludeContext = (
  logs: boolean | SMSLogsCollectionOptions | undefined,
): boolean =>
  typeof logs === 'object' && logs !== null
    ? Boolean(logs.includeContext)
    : false

const resolveLogsIncludeStatusHistory = (
  logs: boolean | SMSLogsCollectionOptions | undefined,
): boolean =>
  typeof logs === 'object' && logs !== null
    ? Boolean(logs.statusHistory)
    : false

export const smsPlugin =
  (pluginConfig: SMSPluginConfig): Plugin =>
  (config: Config): Config => {
    if (pluginConfig.disabled) {
      const prevOnInit = config.onInit
      config.onInit = async (payload) => {
        if (prevOnInit) await prevOnInit(payload)
        payload.logger.warn('payload-plugin-sms: disabled')
      }
      return config
    }

    const logsEnabled = Boolean(pluginConfig.collections?.logs)
    const logsSlug = resolveLogsSlug(pluginConfig.collections?.logs)
    const logsIncludeContext = resolveLogsIncludeContext(pluginConfig.collections?.logs)
    const logsIncludeStatusHistory = resolveLogsIncludeStatusHistory(
      pluginConfig.collections?.logs,
    )

    if (logsEnabled) {
      config.collections = [
        ...(config.collections ?? []),
        buildSMSLogsCollection(pluginConfig.collections!.logs),
      ]
    }

    const customLogsSlug = logsSlug !== 'sms-logs'
    const widgetsEnabled = pluginConfig.widgets !== false && logsEnabled && !customLogsSlug
    if (widgetsEnabled) {
      config.admin = config.admin ?? {}
      config.admin.dashboard = {
        ...(config.admin.dashboard ?? {}),
        widgets: [
          ...(config.admin.dashboard?.widgets ?? []),
          {
            slug: 'sms-recent-logs',
            Component: '@elghaied/payload-plugin-sms/rsc#SMSLogsWidget',
            minWidth: 'small',
            maxWidth: 'medium',
          },
        ],
      }
    }

    const webhooksEnabled = pluginConfig.webhooks?.enabled === true
    const basePath = pluginConfig.webhooks?.basePath ?? '/sms/webhooks'

    const webhookHandlers = webhooksEnabled
      ? collectWebhookHandlers(pluginConfig.adapter)
      : []

    if (webhooksEnabled) {
      assertUniquePaths(webhookHandlers)
    }

    if (webhookHandlers.length > 0) {
      const newEndpoints: Endpoint[] = webhookHandlers.map(
        ({ adapterName, handler }) => ({
          path: `${basePath}/${resolvePath({ adapterName, handler })}`,
          method: 'post' as const,
          handler: async (req) => {
            const handlerFn = makeWebhookEndpointHandler({
              handler,
              adapterName,
              payload: req.payload,
              pluginConfig,
              logsSlug: logsEnabled ? logsSlug : undefined,
              logsIncludeStatusHistory,
            })
            return handlerFn(req)
          },
        }),
      )
      config.endpoints = [...(config.endpoints ?? []), ...newEndpoints]
    }

    const prevOnInit = config.onInit
    config.onInit = async (payload) => {
      if (prevOnInit) await prevOnInit(payload)
      if (!pluginConfig.adapter) {
        payload.logger.warn(
          'payload-plugin-sms: no adapter configured; payload.sendSMS will throw',
        )
      } else if (pluginConfig.adapter.init) {
        await pluginConfig.adapter.init(payload)
      }
      if (customLogsSlug && pluginConfig.widgets !== false && pluginConfig.widgets !== undefined) {
        payload.logger.warn(
          'payload-plugin-sms: dashboard widget hard-codes the "sms-logs" slug; set widgets: false explicitly or use the default slug to silence this warning',
        )
      }

      if (webhooksEnabled) {
        if (webhookHandlers.length === 0) {
          payload.logger.warn(
            'payload-plugin-sms: webhooks.enabled is true but the configured adapter has no webhook handler — no webhook endpoints were registered',
          )
        }
        if (!logsEnabled) {
          payload.logger.warn(
            'payload-plugin-sms: webhooks.enabled is true but collections.logs is disabled — status updates have nowhere to land',
          )
        }
        if (pluginConfig.webhooks?.verifySignature === false) {
          payload.logger.warn(
            'payload-plugin-sms: webhook signature verification is DISABLED (verifySignature: false). Do not run this way in production.',
          )
        }
      }

      payload.sendSMS = makeSendSMS({
        payload,
        pluginConfig,
        logsSlug: logsEnabled ? logsSlug : undefined,
        logsIncludeContext: logsEnabled ? logsIncludeContext : undefined,
      })
    }

    return config
  }
