import type { WidgetServerProps } from 'payload'

import type { PluginT } from '../translations/index.js'

export const SMSLogsWidget = async (props: WidgetServerProps) => {
  const { req } = props
  const { i18n, payload } = req
  const t = i18n.t as PluginT

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
        {t('sms:widgetLast24h')} {totalDocs}
      </header>
      {recent.docs.length === 0 ? (
        <p style={{ color: 'var(--theme-elevation-500)' }}>{t('sms:widgetEmpty')}</p>
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
        {t('sms:widgetViewAll')}
      </a>
    </section>
  )
}
