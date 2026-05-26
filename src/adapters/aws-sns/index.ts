import type { OutboundSMSMessage, SMSAdapter, SMSResult } from '../../types.js'

import { SMSProviderError } from '../../errors.js'

export interface AwsSnsAdapterOptions {
  region: string
  credentials?: { accessKeyId: string; secretAccessKey: string }
  defaultFrom?: string
  smsType?: 'Transactional' | 'Promotional'
}

const loadSns = async (): Promise<{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  SNSClient: new (opts: any) => any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  PublishCommand: new (input: any) => any
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

export const awsSnsAdapter = (opts: AwsSnsAdapterOptions): SMSAdapter => ({
  name: 'aws-sns',
  defaultFrom: opts.defaultFrom,
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
    if (opts.defaultFrom) {
      attributes['AWS.SNS.SMS.SenderID'] = {
        DataType: 'String',
        StringValue: opts.defaultFrom,
      }
    }

    try {
      const response = await client.send(
        new PublishCommand({
          PhoneNumber: message.to,
          Message: message.body,
          MessageAttributes: attributes,
        }),
      )
      return {
        id: String(response.MessageId ?? ''),
        provider: 'aws-sns',
        status: 'sent',
        to: message.to,
        from: message.from,
        body: message.body,
        raw: response,
        sentAt: new Date(),
      }
    } catch (err) {
      throw new SMSProviderError(`AWS SNS send failed: ${(err as Error).message}`, {
        cause: err,
      })
    }
  },
})
