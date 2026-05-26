import type { CollectionConfig } from 'payload'

import type { SMSLogsCollectionOptions } from '../types.js'

export const buildSMSLogsCollection = (
  opts: boolean | SMSLogsCollectionOptions | undefined,
): CollectionConfig => {
  const options: SMSLogsCollectionOptions =
    typeof opts === 'object' && opts !== null ? opts : {}

  const baseFields: CollectionConfig['fields'] = [
    { name: 'to', type: 'text', index: true, required: true },
    { name: 'from', type: 'text', required: true },
    { name: 'body', type: 'textarea', required: true },
    { name: 'provider', type: 'text', index: true, required: true },
    {
      name: 'status',
      type: 'select',
      index: true,
      options: ['queued', 'sent', 'delivered', 'failed', 'unknown'],
      required: true,
    },
    { name: 'providerMessageId', type: 'text', index: true },
    {
      name: 'cost',
      type: 'group',
      fields: [
        { name: 'amount', type: 'text' },
        { name: 'currency', type: 'text' },
      ],
    },
    { name: 'error', type: 'textarea' },
    { name: 'errorCode', type: 'text' },
    { name: 'sentAt', type: 'date', index: true, required: true },
    { name: 'deliveredAt', type: 'date', index: true },
    { name: 'failedAt', type: 'date', index: true },
  ]

  if (options.includeContext) {
    baseFields.push({ name: 'context', type: 'json' })
  }

  if (options.statusHistory) {
    baseFields.push({
      name: 'statusHistory',
      type: 'array',
      fields: [
        {
          name: 'status',
          type: 'select',
          options: ['queued', 'sent', 'delivered', 'failed', 'unknown'],
        },
        { name: 'occurredAt', type: 'date' },
        { name: 'errorCode', type: 'text' },
      ],
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
    timestamps: true,
  }
}
