import { en } from './en.js'
import { fr } from './fr.js'

export { en, fr }

export const translations: Record<string, Record<string, unknown>> = {
  en: { sms: en },
  fr: { sms: fr },
}

type EnKeys = keyof typeof en
/** Union of valid plugin translation keys, e.g. `"sms:fieldTo"`. */
export type PluginTranslationKeys = `sms:${EnKeys}`
/** Plugin translation function type (bypasses Payload's DefaultTranslationKeys). */
export type PluginT = (key: string, vars?: Record<string, unknown>) => string
