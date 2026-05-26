import type {
  OutboundSMSMessage,
  SMSAdapter,
  SMSResult,
  SMSWebhookHandler,
} from '../../types.js'

import { SMSProviderError } from '../../errors.js'
import { makeAwsSnsWebhook } from './webhook.js'

export interface AwsSnsAdapterOptions {
  credentials?: { accessKeyId: string; secretAccessKey: string }
  defaultFrom?: string
  region: string
  smsType?: 'Promotional' | 'Transactional'
  webhook?:
    | {
        path?: string
      }
    | false
}

const loadSns = async (): Promise<{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  PublishCommand: new (input: any) => any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  SNSClient: new (opts: any) => any
}> => {
  try {
    const mod = await import('@aws-sdk/client-sns')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return mod as any
  } catch (err) {
    throw new SMSProviderError(
      "Install '@aws-sdk/client-sns' to use the AWS SNS adapter (pnpm add @aws-sdk/client-sns)",
      { cause: err },
    )
  }
}

const buildWebhook = (opts: AwsSnsAdapterOptions): SMSWebhookHandler | undefined => {
  if (opts.webhook === false) return undefined
  const baseHandler = makeAwsSnsWebhook({ region: opts.region })
  return opts.webhook?.path ? { ...baseHandler, path: opts.webhook.path } : baseHandler
}

export const awsSnsAdapter = (opts: AwsSnsAdapterOptions): SMSAdapter => ({
  defaultFrom: opts.defaultFrom,
  name: 'aws-sns',
  async send(message: OutboundSMSMessage): Promise<SMSResult> {
    const { SNSClient, PublishCommand } = await loadSns()
    const client = new SNSClient({
      region: opts.region,
      ...(opts.credentials ? { credentials: opts.credentials } : {}),
    })

    const attributes: Record<string, { DataType: 'String'; StringValue: string }> = {
      'AWS.SNS.SMS.SMSType': {
        DataType: 'String',
        StringValue: opts.smsType ?? 'Transactional',
      },
    }
    if (message.from) {
      attributes['AWS.SNS.SMS.SenderID'] = {
        DataType: 'String',
        StringValue: message.from,
      }
    }

    try {
      const response = await client.send(
        new PublishCommand({
          Message: message.body,
          MessageAttributes: attributes,
          PhoneNumber: message.to,
        }),
      )
      return {
        body: message.body,
        from: message.from,
        id: String(response.MessageId ?? ''),
        provider: 'aws-sns',
        raw: response,
        sentAt: new Date(),
        status: 'sent',
        to: message.to,
      }
    } catch (err) {
      throw new SMSProviderError(`AWS SNS send failed: ${(err as Error).message}`, {
        cause: err,
      })
    }
  },
  webhook: buildWebhook(opts),
})
