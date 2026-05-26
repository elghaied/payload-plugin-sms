import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import path from 'path'
import { buildConfig } from 'payload'
import { smsPlugin } from 'payload-plugin-sms'
import { mockAdapter } from 'payload-plugin-sms/mock'
import sharp from 'sharp'
import { fileURLToPath } from 'url'

import { testSmsEndpoint } from './endpoints/testSms.js'
import { seed } from './seed.js'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

if (!process.env.ROOT_DIR) {
  process.env.ROOT_DIR = dirname
}

export const devSMSAdapter = mockAdapter({ defaultFrom: '+15550000000' })

const buildConfigWithMemoryDB = async () => {
  if (process.env.NODE_ENV === 'test') {
    const memoryDB = await MongoMemoryReplSet.create({
      replSet: {
        count: 1,
        dbName: 'payloadmemory',
      },
    })

    process.env.DATABASE_URL = `${memoryDB.getUri()}&retryWrites=true`
  }

  return buildConfig({
    admin: {
      importMap: {
        baseDir: path.resolve(dirname),
      },
    },
    collections: [
      {
        slug: 'posts',
        fields: [],
      },
      {
        slug: 'media',
        fields: [],
        upload: {
          staticDir: path.resolve(dirname, 'media'),
        },
      },
      {
        slug: 'tenants',
        fields: [
          { name: 'name', type: 'text' },
          {
            name: 'smsProvider',
            type: 'select',
            options: ['twilio', 'telnyx'],
            required: true,
          },
        ],
      },
    ],
    db: mongooseAdapter({
      ensureIndexes: true,
      url: process.env.DATABASE_URL || '',
    }),
    endpoints: [testSmsEndpoint],
    editor: lexicalEditor(),
    onInit: async (payload) => {
      await seed(payload)
    },
    plugins: [
      smsPlugin({
        adapter: devSMSAdapter,
        collections: { logs: { statusHistory: true } },
        widgets: true,
        webhooks: { enabled: true },
      }),
    ],
    secret: process.env.PAYLOAD_SECRET || 'test-secret_key',
    sharp,
    typescript: {
      outputFile: path.resolve(dirname, 'payload-types.ts'),
    },
  })
}

export default buildConfigWithMemoryDB()
