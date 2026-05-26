// Stub declaration for `@payload-config` — the consumer Next.js app provides
// a real module at this alias. This file exists only so our package can
// type-check without the actual alias being defined in our tsconfig.
import type { SanitizedConfig } from 'payload'

declare const config: Promise<SanitizedConfig> | SanitizedConfig
export default config
