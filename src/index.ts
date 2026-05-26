import type { Config, Plugin } from 'payload'

export interface SMSPluginConfig {
  disabled?: boolean
}

export const smsPlugin =
  (_pluginConfig: SMSPluginConfig): Plugin =>
  (config: Config): Config =>
    config
