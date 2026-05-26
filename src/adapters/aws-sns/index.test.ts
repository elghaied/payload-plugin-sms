import { beforeEach, describe, expect, test, vi } from 'vitest'

import { SMSProviderError } from '../../errors.js'

const send = vi.fn()
class PublishCommandImpl {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(public input: any) {}
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const PublishCommand = vi.fn(function (this: any, input: unknown) {
  return new PublishCommandImpl(input)
})

vi.mock('@aws-sdk/client-sns', () => {
  class FakeSNSClient {
    send = send
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(_opts: any) {}
  }
  return { SNSClient: FakeSNSClient, PublishCommand }
})

import { awsSnsAdapter } from './index.js'

describe('awsSnsAdapter', () => {
  beforeEach(() => {
    send.mockReset()
    PublishCommand.mockClear()
  })

  test('has name "aws-sns"', () => {
    const a = awsSnsAdapter({ region: 'us-east-1' })
    expect(a.name).toBe('aws-sns')
  })

  test('sends via PublishCommand with PhoneNumber + Message', async () => {
    send.mockResolvedValue({ MessageId: 'aws-1' })
    const a = awsSnsAdapter({ region: 'us-east-1' })
    const r = await a.send({ to: '+15551234567', from: '+15550000000', body: 'hi' })
    expect(PublishCommand).toHaveBeenCalledTimes(1)
    const input = PublishCommand.mock.calls[0][0] as { PhoneNumber: string; Message: string }
    expect(input.PhoneNumber).toBe('+15551234567')
    expect(input.Message).toBe('hi')
    expect(r.id).toBe('aws-1')
    expect(r.provider).toBe('aws-sns')
    expect(r.status).toBe('sent')
  })

  test('adds SenderID when defaultFrom set', async () => {
    send.mockResolvedValue({ MessageId: 'aws-1' })
    const a = awsSnsAdapter({ region: 'us-east-1', defaultFrom: 'MYBRAND' })
    await a.send({ to: '+15551234567', from: '+15550000000', body: 'x' })
    const input = PublishCommand.mock.calls[0][0] as {
      MessageAttributes: Record<string, { StringValue: string }>
    }
    expect(input.MessageAttributes['AWS.SNS.SMS.SenderID'].StringValue).toBe('MYBRAND')
  })

  test('uses smsType option ("Promotional")', async () => {
    send.mockResolvedValue({ MessageId: 'aws-1' })
    const a = awsSnsAdapter({ region: 'us-east-1', smsType: 'Promotional' })
    await a.send({ to: '+15551234567', from: '+15550000000', body: 'x' })
    const input = PublishCommand.mock.calls[0][0] as {
      MessageAttributes: Record<string, { StringValue: string }>
    }
    expect(input.MessageAttributes['AWS.SNS.SMS.SMSType'].StringValue).toBe('Promotional')
  })

  test('defaults smsType to "Transactional"', async () => {
    send.mockResolvedValue({ MessageId: 'aws-1' })
    const a = awsSnsAdapter({ region: 'us-east-1' })
    await a.send({ to: '+15551234567', from: '+15550000000', body: 'x' })
    const input = PublishCommand.mock.calls[0][0] as {
      MessageAttributes: Record<string, { StringValue: string }>
    }
    expect(input.MessageAttributes['AWS.SNS.SMS.SMSType'].StringValue).toBe('Transactional')
  })

  test('wraps provider errors', async () => {
    send.mockRejectedValue(new Error('sns boom'))
    const a = awsSnsAdapter({ region: 'us-east-1' })
    await expect(
      a.send({ to: '+15551234567', from: '+15550000000', body: 'x' }),
    ).rejects.toBeInstanceOf(SMSProviderError)
  })
})
