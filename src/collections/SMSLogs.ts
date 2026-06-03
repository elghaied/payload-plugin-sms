import type { CollectionConfig } from 'payload'

import type { PluginT } from '../translations/index.js'
import type { SMSLogsCollectionOptions } from '../types.js'

const L = (key: string) => ({ t }: { t: unknown }) => (t as PluginT)(`sms:${key}`)

const STATUS_OPTIONS = [
  { label: L('statusQueued'), value: 'queued' },
  { label: L('statusSent'), value: 'sent' },
  { label: L('statusDelivered'), value: 'delivered' },
  { label: L('statusFailed'), value: 'failed' },
  { label: L('statusUnknown'), value: 'unknown' },
]

export const buildSMSLogsCollection = (
  opts: boolean | SMSLogsCollectionOptions | undefined,
): CollectionConfig => {
  const options: SMSLogsCollectionOptions =
    typeof opts === 'object' && opts !== null ? opts : {}

  const baseFields: CollectionConfig['fields'] = [
    { name: 'to', type: 'text', index: true, label: L('fieldTo'), required: true },
    { name: 'from', type: 'text', label: L('fieldFrom'), required: true },
    { name: 'body', type: 'textarea', label: L('fieldBody'), required: true },
    { name: 'provider', type: 'text', index: true, label: L('fieldProvider'), required: true },
    {
      name: 'status',
      type: 'select',
      index: true,
      label: L('fieldStatus'),
      options: STATUS_OPTIONS,
      required: true,
    },
    { name: 'providerMessageId', type: 'text', index: true, label: L('fieldProviderMessageId') },
    {
      name: 'cost',
      type: 'group',
      fields: [
        { name: 'amount', type: 'text', label: L('fieldAmount') },
        { name: 'currency', type: 'text', label: L('fieldCurrency') },
      ],
      label: L('fieldCost'),
    },
    { name: 'error', type: 'textarea', label: L('fieldError') },
    { name: 'errorCode', type: 'text', label: L('fieldErrorCode') },
    { name: 'sentAt', type: 'date', index: true, label: L('fieldSentAt'), required: true },
    { name: 'deliveredAt', type: 'date', index: true, label: L('fieldDeliveredAt') },
    { name: 'failedAt', type: 'date', index: true, label: L('fieldFailedAt') },
  ]

  if (options.includeContext) {
    baseFields.push({ name: 'context', type: 'json', label: L('fieldContext') })
  }

  if (options.statusHistory) {
    baseFields.push({
      name: 'statusHistory',
      type: 'array',
      fields: [
        {
          name: 'status',
          type: 'select',
          label: L('fieldStatus'),
          options: STATUS_OPTIONS,
        },
        { name: 'occurredAt', type: 'date', label: L('fieldOccurredAt') },
        { name: 'errorCode', type: 'text', label: L('fieldErrorCode') },
      ],
      label: L('fieldStatusHistory'),
    })
  }

  return {
    slug: options.slug ?? 'sms-logs',
    access: {
      create: () => false,
      delete: () => false,
      read: ({ req }) => Boolean(req.user),
      update: () => false,
    },
    admin: {
      defaultColumns: ['to', 'status', 'provider', 'sentAt'],
      group: 'SMS',
      useAsTitle: 'to',
      ...(options.admin ?? {}),
    },
    fields: baseFields,
    labels: {
      plural: ({ t }) => (t as PluginT)('sms:collectionLabelPlural'),
      singular: ({ t }) => (t as PluginT)('sms:collectionLabelSingular'),
    },
    timestamps: true,
  }
}
