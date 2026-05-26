import type { SMSMessage, SMSResult } from './types.js'

declare module 'payload' {
  interface BasePayload {
    sendSMS: (message: SMSMessage) => Promise<SMSResult>
  }
}

export {}
