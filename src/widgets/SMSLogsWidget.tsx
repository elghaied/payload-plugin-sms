import { getPayload } from 'payload'

// `@payload-config` is the consumer Next.js app's path alias — resolved at
// runtime in their project, not ours. The stub declaration in
// payload-config-stub.d.ts satisfies the type-checker locally.
import configPromise from '@payload-config'

export const SMSLogsWidget = async () => {
  const payload = await getPayload({ config: configPromise })
  if (!payload.collections['sms-logs']) {
    return null
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const [{ totalDocs }, recent] = await Promise.all([
    payload.count({
      collection: 'sms-logs',
      where: { sentAt: { greater_than: since.toISOString() } },
    }),
    payload.find({
      collection: 'sms-logs',
      depth: 0,
      limit: 5,
      sort: '-sentAt',
    }),
  ])

  return (
    <section
      style={{
        border: '1px solid var(--theme-elevation-100)',
        borderRadius: 8,
        padding: '1rem',
      }}
    >
      <header style={{ fontWeight: 600, marginBottom: '0.5rem' }}>
        SMS — last 24h: {totalDocs}
      </header>
      {recent.docs.length === 0 ? (
        <p style={{ color: 'var(--theme-elevation-500)' }}>No messages yet.</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {recent.docs.map((d) => {
            const doc = d as unknown as {
              id: string
              sentAt: string
              status: string
              to: string
            }
            return (
              <li key={doc.id} style={{ fontSize: '0.875rem', padding: '0.25rem 0' }}>
                <code>{doc.to}</code> — {doc.status} —{' '}
                {new Date(doc.sentAt).toLocaleString()}
              </li>
            )
          })}
        </ul>
      )}
      <a href="/admin/collections/sms-logs" style={{ display: 'inline-block', marginTop: '0.5rem' }}>
        View all →
      </a>
    </section>
  )
}
