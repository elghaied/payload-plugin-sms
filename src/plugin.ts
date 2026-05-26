import type { Config, Plugin } from 'payload'

import type { SMSLogsCollectionOptions, SMSPluginConfig } from './types.js'

import { buildSMSLogsCollection } from './collections/SMSLogs.js'
import { makeSendSMS } from './sendSMS.js'

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
            Component: 'payload-plugin-sms/rsc#SMSLogsWidget',
            minWidth: 'small',
            maxWidth: 'medium',
          },
        ],
      }
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
      payload.sendSMS = makeSendSMS({
        payload,
        pluginConfig,
        logsSlug: logsEnabled ? logsSlug : undefined,
        logsIncludeContext: logsEnabled ? logsIncludeContext : undefined,
      })
    }

    return config
  }
