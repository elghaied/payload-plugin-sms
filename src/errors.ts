export class SMSValidationError extends Error {
  override name = 'SMSValidationError'
}

export class SMSProviderError extends Error {
  override name = 'SMSProviderError'
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
  }
}

export class SMSWebhookVerificationError extends Error {
  override name = 'SMSWebhookVerificationError'
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
  }
}
