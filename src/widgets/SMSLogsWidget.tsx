import type { Field, PayloadRequest, WidgetServerProps } from 'payload'

import type { PluginT } from '../translations/index.js'

/** Resolved tenant-scoping options, passed from the plugin via the widget's serverProps. */
interface TenantScoping {
  cookie: string
  field: string
}

type SMSLogsWidgetProps = {
  tenantScoping?: TenantScoping
} & WidgetServerProps

const readCookie = (req: PayloadRequest, name: string): string | undefined => {
  const header = req.headers?.get?.('cookie') ?? ''
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) {
      return decodeURIComponent(rest.join('='))
    }
  }
  return undefined
}

const collectionHasField = (fields: Field[], name: string): boolean =>
  fields.some((f) => 'name' in f && f.name === name)

export const SMSLogsWidget = async (props: SMSLogsWidgetProps) => {
  const { req, tenantScoping } = props
  const { i18n, payload } = req
  const t = i18n.t as PluginT

  const collection = payload.collections['sms-logs']
  if (!collection) {
    return null
  }

  // Tenant scoping is opt-in (host passes `tenantScoping` via serverProps) AND only
  // applies when the logs collection actually carries the configured field. Otherwise
  // the widget behaves exactly as it did before — Local API defaults (overrideAccess: true).
  const scopingActive =
    Boolean(tenantScoping) &&
    collectionHasField(collection.config.fields, tenantScoping!.field)
  const tenantId = scopingActive ? readCookie(req, tenantScoping!.cookie) : undefined

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const tenantWhere = tenantId ? { [tenantScoping!.field]: { equals: tenantId } } : {}
  // When scoping is active, honor the host's read access control by running with the
  // real req/user instead of the implicit overrideAccess: true.
  const accessArgs = scopingActive ? { overrideAccess: false, req } : {}

  const [{ totalDocs }, recent] = await Promise.all([
    payload.count({
      collection: 'sms-logs',
      where: { sentAt: { greater_than: since.toISOString() }, ...tenantWhere },
      ...accessArgs,
    }),
    payload.find({
      collection: 'sms-logs',
      depth: 0,
      limit: 5,
      sort: '-sentAt',
      ...(tenantId ? { where: tenantWhere } : {}),
      ...accessArgs,
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
