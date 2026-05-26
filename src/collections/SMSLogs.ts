import type { CollectionConfig } from 'payload'

import type { SMSLogsCollectionOptions } from '../types.js'

export const buildSMSLogsCollection = (
  opts: boolean | SMSLogsCollectionOptions | undefined,
): CollectionConfig => {
  const options: SMSLogsCollectionOptions =
    typeof opts === 'object' && opts !== null ? opts : {}

  return {
    slug: options.slug ?? 'sms-logs',
    admin: {
      group: 'SMS',
      useAsTitle: 'to',
      defaultColumns: ['to', 'status', 'provider', 'sentAt'],
      ...(options.admin ?? {}),
    },
    access: {
      read: ({ req }) => Boolean(req.user),
      create: () => false,
      update: () => false,
      delete: () => false,
    },
    fields: [
      { name: 'to', type: 'text', required: true, index: true },
      { name: 'from', type: 'text', required: true },
      { name: 'body', type: 'textarea', required: true },
      { name: 'provider', type: 'text', required: true, index: true },
      {
        name: 'status',
        type: 'select',
        required: true,
        index: true,
        options: ['queued', 'sent', 'delivered', 'failed', 'unknown'],
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
      { name: 'sentAt', type: 'date', required: true, index: true },
    ],
    timestamps: true,
  }
}
