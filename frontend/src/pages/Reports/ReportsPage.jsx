import { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, BarChart3, Clock, DatabaseZap, PackageCheck, RefreshCcw, ShieldAlert, ShoppingCart, Truck, WalletCards, Webhook } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client.js';
import { ErrorState } from '../../components/ErrorState.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { useAsync } from '../../hooks/useAsync.js';

const labels = {
  new: 'Yeni',
  pending: 'Bekliyor',
  processing: 'Hazirlaniyor',
  preparing: 'Hazirlaniyor',
  ready_to_ship: 'Kargoya hazir',
  shipped: 'Kargoda',
  delivered: 'Teslim edildi',
  cancelled: 'Iptal',
  active: 'Aktif',
  draft: 'Taslak',
  passive: 'Pasif',
  queued: 'Bekliyor',
  created: 'Olustu',
  in_transit: 'Yolda',
  failed: 'Hatali',
  completed: 'Tamamlandi',
};

function maxValue(series = []) {
  return Math.max(1, ...series.map((item) => Number(item.value || 0)));
}

function TrendBars({ series, tone = 'primary' }) {
  const max = maxValue(series);

  return (
    <div className="trend-bars">
      {series.map((item) => (
        <div className="trend-item" key={item.label}>
          <span style={{ height: `${Math.max(8, (Number(item.value || 0) / max) * 100)}%` }} className={tone} />
          <small>{item.label}</small>
        </div>
      ))}
    </div>
  );
}

function Breakdown({ title, items }) {
  const total = Math.max(1, items.reduce((sum, item) => sum + Number(item.value || 0), 0));

  return (
    <section className="panel compact-panel">
      <h2>{title}</h2>
      {items.length === 0 ? (
        <div className="soft-empty">Bu alanda henuz veri yok. Islemler basladikca raporlar burada dolacak.</div>
      ) : items.map((item) => (
        <div className="breakdown-row" key={item.label}>
          <div>
            <strong>{labels[item.label] || item.label}</strong>
            <span>{item.value} kayit</span>
          </div>
          <div className="progress inline-progress">
            <span style={{ width: `${(Number(item.value || 0) / total) * 100}%` }} />
          </div>
        </div>
      ))}
    </section>
  );
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function defaultFilters() {
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - 29);

  return {
    from: formatDate(from),
    to: formatDate(to),
    marketplace_code: '',
  };
}

function formatNumber(value) {
  return new Intl.NumberFormat('tr-TR').format(Number(value || 0));
}

function formatMoney(value) {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(Number(value || 0));
}

function formatPercent(value) {
  return `%${Number(value || 0).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`;
}

function sumValues(items = []) {
  return items.reduce((total, value) => total + Number(value || 0), 0);
}

function healthLabel(tone) {
  if (tone === 'critical') return 'Kritik';
  if (tone === 'warning') return 'Dikkat';
  return 'Saglikli';
}

function marketplaceLabel(code) {
  if (code === 'trendyol') return 'Trendyol';
  if (code === 'hepsiburada') return 'Hepsiburada';
  return code || 'Platform';
}

function alertMessage(alert) {
  const messages = {
    failed_imports: 'XML import run hatalarini kontrol edin.',
    failed_queue_jobs: 'Queue retry veya job log incelemesi gerekir.',
    rejected_variants: 'Varyant batch problemleri urun detayindan cozulebilir.',
    failed_webhooks: 'Inbound/outbound webhook teslimatlarini inceleyin.',
    expiring_subscriptions: 'Yakinda bitecek abonelikler icin aksiyon alin.',
  };

  return messages[alert.key] || 'Operasyon ekibi tarafindan kontrol edilmeli.';
}

function KpiCard({ icon: Icon, label, value, detail, tone = 'neutral', action }) {
  return (
    <article className={`analytics-kpi-card ${tone}`}>
      <div className="analytics-kpi-icon"><Icon size={18} /></div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
        {action && <button type="button" className="analytics-card-action" onClick={action.onClick}>{action.label}</button>}
      </div>
    </article>
  );
}

function HealthCard({ title, tone, description, metrics }) {
  return (
    <article className={`domain-health-card ${tone}`}>
      <div className="domain-health-heading">
        <span>{title}</span>
        <strong>{healthLabel(tone)}</strong>
      </div>
      <p>{description}</p>
      <div className="domain-health-metrics">
        {metrics.map((metric) => (
          <div key={metric.label}>
            <strong>{metric.value}</strong>
            <span>{metric.label}</span>
          </div>
        ))}
      </div>
    </article>
  );
}

function IntelligenceSection({ title, description, children }) {
  return (
    <section className="analytics-intelligence-section">
      <div className="analytics-section-heading">
        <div>
          <span>Intelligence</span>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function InsightList({ title, items, emptyText, renderItem }) {
  return (
    <section className="panel analytics-insight-panel">
      <div className="panel-heading">
        <div>
          <span>Insight</span>
          <h2>{title}</h2>
        </div>
      </div>
      {items?.length > 0 ? (
        <div className="analytics-insight-list">
          {items.map((item, index) => renderItem(item, index))}
        </div>
      ) : (
        <div className="analytics-empty-state compact">
          <strong>Temiz gorunuyor</strong>
          <span>{emptyText}</span>
        </div>
      )}
    </section>
  );
}

function ActionLink({ to, children }) {
  if (!to) return null;

  return <Link className="analytics-action-link" to={to}>{children}</Link>;
}

function SeverityBadge({ severity }) {
  return <span className={`analytics-severity-badge ${severity || 'info'}`}>{severity || 'info'}</span>;
}

function DrilldownList({ title, items, emptyText, renderItem }) {
  return (
    <section className="analytics-drilldown-section">
      <h3>{title}</h3>
      {items?.length > 0 ? (
        <div className="analytics-drilldown-list">
          {items.map((item, index) => renderItem(item, index))}
        </div>
      ) : (
        <div className="analytics-empty-state compact">
          <strong>Temiz</strong>
          <span>{emptyText}</span>
        </div>
      )}
    </section>
  );
}

function MarketplaceDrilldownDrawer({ data, loading, error, onClose }) {
  const marketplace = data?.marketplace || {};
  const summary = data?.summary || {};
  const risk = data?.risk_score || {};

  return (
    <div className="analytics-drawer-backdrop" role="presentation">
      <aside className="analytics-drawer" role="dialog" aria-modal="true" aria-label="Marketplace drilldown">
        <div className="analytics-drawer-header">
          <div>
            <span>Marketplace Drilldown</span>
            <h2>{marketplace.label || 'Marketplace'}</h2>
            <p>{marketplace.health ? `${healthLabel(marketplace.health)} durum · Risk skoru ${formatNumber(risk.score)} / 100` : 'Drilldown verisi yukleniyor.'}</p>
          </div>
          <button type="button" className="secondary" onClick={onClose}>Kapat</button>
        </div>

        {loading && <LoadingState />}
        {error && <ErrorState message={error} onRetry={() => {}} />}

        {data && !loading && (
          <>
            <section className="analytics-drilldown-summary">
              {[
                ['Failed batch', summary.failed_batches],
                ['Rejected', summary.rejected_products],
                ['Failed product', summary.failed_products],
                ['API error', summary.api_errors],
                ['Queue failure', summary.queue_failures],
                ['Webhook failure', summary.webhook_failures],
                ['Variant problem', summary.variant_problem_children],
                ['Stale sync', summary.stale_sync ? 1 : 0],
              ].map(([label, value]) => (
                <div key={label}>
                  <strong>{formatNumber(value)}</strong>
                  <span>{label}</span>
                </div>
              ))}
            </section>

            <section className="analytics-action-strip">
              {(data.action_links || []).map((link) => (
                <Link key={link.target} className="analytics-action-link" to={link.target}>{link.label}</Link>
              ))}
            </section>

            <section className="analytics-drilldown-section">
              <h3>Root Cause</h3>
              {(data.incidents || []).length > 0 ? (
                <div className="analytics-incident-grid">
                  {data.incidents.map((incident) => (
                    <article className={`analytics-incident-card ${incident.severity}`} key={incident.key}>
                      <div className="analytics-incident-heading">
                        <SeverityBadge severity={incident.severity} />
                        <strong>{incident.title}</strong>
                        <small>{formatNumber(incident.value)}</small>
                      </div>
                      <p>{incident.summary}</p>
                      <span>{incident.root_cause}</span>
                      <footer>
                        <small>{incident.action_hint}</small>
                        <Link to={incident.target_path}>Aksiyon</Link>
                      </footer>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="analytics-empty-state compact">
                  <strong>Incident yok</strong>
                  <span>Secili aralikta marketplace icin aksiyon gerektiren kok neden bulunmadi.</span>
                </div>
              )}
            </section>

            <div className="analytics-drilldown-grid">
              <DrilldownList
                title="Failed Products"
                items={data.failed_products || []}
                emptyText="Failed/problematic urun yok."
                renderItem={(product) => (
                  <article className="analytics-drilldown-row critical" key={`failed-${product.product_id}-${product.marketplace_code}`}>
                    <div><strong>{product.name || product.sku}</strong><span>{product.error_message || product.status}</span></div>
                    <small>{product.batch_request_id || product.last_checked_at || '-'}</small>
                    <ActionLink to={`/products/${product.product_id}`}>Urun</ActionLink>
                  </article>
                )}
              />
              <DrilldownList
                title="Rejected Products"
                items={data.rejected_products || []}
                emptyText="Rejected urun yok."
                renderItem={(product) => (
                  <article className="analytics-drilldown-row warning" key={`rejected-${product.product_id}-${product.marketplace_code}`}>
                    <div><strong>{product.name || product.sku}</strong><span>{product.error_message || product.status}</span></div>
                    <small>{product.batch_request_id || product.last_checked_at || '-'}</small>
                    <ActionLink to={`/api-logs?search=${encodeURIComponent(product.sku || product.barcode || product.batch_request_id || '')}`}>Log</ActionLink>
                  </article>
                )}
              />
              <DrilldownList
                title="Batch Problems"
                items={data.batch_problems || []}
                emptyText="Problemli batch yok."
                renderItem={(batch) => (
                  <article className="analytics-drilldown-row critical" key={`${batch.marketplace_code}-${batch.batch_request_id}`}>
                    <div><strong>{batch.batch_request_id || 'Batch yok'}</strong><span>{formatNumber(batch.failed_count)} failed · {formatNumber(batch.rejected_count)} rejected</span></div>
                    <small>{formatNumber(batch.problem_count)} problem</small>
                    <ActionLink to="/products/publish-queue">Queue</ActionLink>
                  </article>
                )}
              />
              <DrilldownList
                title="API Errors"
                items={data.api_errors || []}
                emptyText="API hatasi yok."
                renderItem={(log) => (
                  <article className={log.status_code >= 500 ? 'analytics-drilldown-row critical' : 'analytics-drilldown-row warning'} key={`api-${log.id}`}>
                    <div><strong>{log.method} {log.endpoint}</strong><span>{log.error_message || `HTTP ${log.status_code}`}</span></div>
                    <small>{formatNumber(log.duration_ms)}ms</small>
                    <ActionLink to={`/api-logs?search=${encodeURIComponent(log.endpoint || '')}`}>Log</ActionLink>
                  </article>
                )}
              />
              <DrilldownList
                title="Queue Failures"
                items={data.queue_failures || []}
                emptyText="Queue failure yok."
                renderItem={(run) => (
                  <article className="analytics-drilldown-row critical" key={`queue-${run.id}`}>
                    <div><strong>{run.type || 'sync'}</strong><span>{run.error_message || run.status}</span></div>
                    <small>{formatNumber(run.attempts)} attempt</small>
                    <ActionLink to="/queue">Queue</ActionLink>
                  </article>
                )}
              />
              <DrilldownList
                title="Webhook Failures"
                items={data.webhook_failures || []}
                emptyText="Webhook failure yok."
                renderItem={(webhook) => (
                  <article className="analytics-drilldown-row warning" key={`webhook-${webhook.id}`}>
                    <div><strong>{webhook.event || webhook.direction}</strong><span>{webhook.error_message || webhook.status}</span></div>
                    <small>{webhook.status}</small>
                    <ActionLink to="/api-logs">Log</ActionLink>
                  </article>
                )}
              />
              <DrilldownList
                title="Variant Problems"
                items={data.variant_problems?.latest_problem_children || []}
                emptyText="Problemli varyant yok."
                renderItem={(child, index) => (
                  <article className="analytics-drilldown-row warning" key={`variant-${child.product_id || index}`}>
                    <div><strong>{child.sku || child.barcode || 'Varyant'}</strong><span>{child.error_message || child.status}</span></div>
                    <small>{child.batch_request_id || child.last_checked_at || '-'}</small>
                    <ActionLink to={`/products/${child.product_id}`}>Coz</ActionLink>
                  </article>
                )}
              />
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

export function ReportsPage() {
  const { loading, error, run } = useAsync();
  const [filters, setFilters] = useState(defaultFilters);
  const [report, setReport] = useState(null);
  const [drilldown, setDrilldown] = useState(null);
  const [drilldownLoading, setDrilldownLoading] = useState(false);
  const [drilldownError, setDrilldownError] = useState('');

  const load = async () => {
    await run(async () => {
      const params = {
        from: filters.from || undefined,
        to: filters.to || undefined,
        marketplace_code: filters.marketplace_code || undefined,
      };
      setReport(await api.analytics.overview(params));
    });
  };

  const openDrilldown = async (marketplace) => {
    setDrilldownLoading(true);
    setDrilldownError('');
    setDrilldown(null);
    try {
      setDrilldown(await api.analytics.marketplaceDrilldown(marketplace, {
        from: filters.from || undefined,
        to: filters.to || undefined,
      }));
    } catch (requestError) {
      setDrilldownError(requestError.response?.data?.message || requestError.message || 'Drilldown verisi alinamadi.');
    } finally {
      setDrilldownLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const kpis = useMemo(() => {
    if (!report) return [];

    return [
      {
        icon: BarChart3,
        label: 'Satis',
        value: formatMoney(report.sales?.total_sales),
        detail: `${formatNumber(report.sales?.order_count)} siparis / ${formatMoney(report.sales?.avg_order_value)} ort.`,
        tone: 'success',
      },
      {
        icon: ShoppingCart,
        label: 'Siparis',
        value: formatNumber(sumValues([report.orders?.pending, report.orders?.preparing, report.orders?.shipped, report.orders?.delivered, report.orders?.cancelled])),
        detail: `${formatNumber(report.orders?.pending)} bekliyor, ${formatNumber(report.orders?.delivered)} teslim`,
      },
      {
        icon: WalletCards,
        label: 'Odeme',
        value: formatNumber(report.payments?.paid),
        detail: `${formatNumber(report.payments?.failed)} hatali, ${formatNumber(report.payments?.refunded)} iade`,
        tone: report.payments?.failed > 0 ? 'warning' : 'success',
      },
      {
        icon: Truck,
        label: 'Kargo',
        value: formatNumber(report.shipping?.delivered),
        detail: `${formatNumber(report.shipping?.pending)} bekliyor, ${formatNumber(report.shipping?.failed)} problemli`,
        tone: report.shipping?.failed > 0 ? 'critical' : 'neutral',
      },
      {
        icon: DatabaseZap,
        label: 'XML',
        value: formatNumber(report.imports?.successful_runs),
        detail: `${formatNumber(report.imports?.failed_runs)} hatali run, ${formatNumber(report.imports?.conflict_rows)} conflict`,
        tone: report.imports?.failed_runs > 0 || report.imports?.conflict_rows > 0 ? 'warning' : 'success',
      },
      {
        icon: Clock,
        label: 'Queue',
        value: formatNumber(report.queue?.pending_jobs),
        detail: `${formatNumber(report.queue?.failed_jobs)} failed, ${formatNumber(report.queue?.retry_jobs)} retry`,
        tone: report.queue?.failed_jobs > 0 ? 'critical' : 'neutral',
      },
      {
        icon: Webhook,
        label: 'Webhook',
        value: formatNumber(sumValues([report.webhooks?.inbound_success, report.webhooks?.outbound_success])),
        detail: `${formatNumber(sumValues([report.webhooks?.inbound_failed, report.webhooks?.outbound_failed]))} hatali teslimat`,
        tone: sumValues([report.webhooks?.inbound_failed, report.webhooks?.outbound_failed]) > 0 ? 'warning' : 'success',
      },
      {
        icon: PackageCheck,
        label: 'SaaS',
        value: formatNumber(report.saas?.active_subscriptions),
        detail: `${formatNumber(report.saas?.expiring_subscriptions)} bitecek, ${formatNumber(report.saas?.limit_risk_companies)} limit riski`,
        tone: report.saas?.limit_risk_companies > 0 ? 'warning' : 'neutral',
      },
    ];
  }, [report]);

  const healthCards = useMemo(() => {
    if (!report) return [];

    const xmlTone = report.imports?.failed_runs > 0 || report.imports?.conflict_rows > 0 ? 'critical' : report.imports?.filtered_rows > 0 ? 'warning' : 'healthy';
    const queueTone = report.queue?.failed_jobs > 0 ? 'critical' : report.queue?.pending_jobs > 0 || report.queue?.retry_jobs > 0 ? 'warning' : 'healthy';
    const apiTone = report.api?.api_errors > 0 ? 'critical' : report.api?.slow_requests > 0 ? 'warning' : 'healthy';
    const webhookFailures = sumValues([report.webhooks?.inbound_failed, report.webhooks?.outbound_failed]);
    const webhookTone = webhookFailures > 0 ? 'critical' : 'healthy';
    const marketplaceTone = report.marketplaces?.failed_accounts > 0 ? 'critical' : report.marketplaces?.active_accounts === 0 ? 'warning' : 'healthy';

    return [
      {
        title: 'XML Health',
        tone: xmlTone,
        description: 'Import run, filtre ve ownership conflict riskleri.',
        metrics: [
          { label: 'Basarili', value: formatNumber(report.imports?.successful_runs) },
          { label: 'Conflict', value: formatNumber(report.imports?.conflict_rows) },
        ],
      },
      {
        title: 'Queue Health',
        tone: queueTone,
        description: 'Bekleyen, failed ve retry operasyon kuyruklari.',
        metrics: [
          { label: 'Pending', value: formatNumber(report.queue?.pending_jobs) },
          { label: 'Failed', value: formatNumber(report.queue?.failed_jobs) },
        ],
      },
      {
        title: 'API Health',
        tone: apiTone,
        description: 'Provider API hata ve yavas istek sinyalleri.',
        metrics: [
          { label: 'Errors', value: formatNumber(report.api?.api_errors) },
          { label: 'Slow', value: formatNumber(report.api?.slow_requests) },
        ],
      },
      {
        title: 'Webhook Health',
        tone: webhookTone,
        description: 'Inbound ve outbound teslimat basari durumu.',
        metrics: [
          { label: 'Success', value: formatNumber(sumValues([report.webhooks?.inbound_success, report.webhooks?.outbound_success])) },
          { label: 'Failed', value: formatNumber(webhookFailures) },
        ],
      },
      {
        title: 'Marketplace Health',
        tone: marketplaceTone,
        description: 'Aktif hesaplar ve baglanti durumlari.',
        metrics: [
          { label: 'Aktif', value: formatNumber(report.marketplaces?.active_accounts) },
          { label: 'Hatali', value: formatNumber(report.marketplaces?.failed_accounts) },
        ],
      },
    ];
  }, [report]);

  const xmlKpis = useMemo(() => {
    if (!report?.xml_intelligence) return [];
    const xml = report.xml_intelligence;

    return [
      {
        icon: DatabaseZap,
        label: 'Source Health',
        value: `${formatNumber(xml.health_summary?.healthy_sources)} / ${formatNumber(xml.health_summary?.total_sources)}`,
        detail: `${formatNumber(xml.health_summary?.critical_sources)} kritik, ${formatNumber(xml.health_summary?.warning_sources)} dikkat`,
        tone: xml.health_summary?.critical_sources > 0 ? 'critical' : xml.health_summary?.warning_sources > 0 ? 'warning' : 'success',
      },
      {
        icon: Activity,
        label: 'Mapping Success',
        value: formatPercent(xml.mapping?.category_mapping_success_rate),
        detail: `Kategori ${formatPercent(xml.mapping?.category_mapping_success_rate)}, marka ${formatPercent(xml.mapping?.brand_mapping_success_rate)}`,
        tone: xml.mapping?.unmapped_category_count > 0 || xml.mapping?.unmapped_brand_count > 0 ? 'warning' : 'success',
      },
      {
        icon: ShieldAlert,
        label: 'Conflict Rate',
        value: formatPercent(xml.conflicts?.conflict_rate),
        detail: `${formatNumber(xml.conflicts?.total_conflicts)} ownership conflict`,
        tone: xml.conflicts?.total_conflicts > 0 ? 'critical' : 'success',
      },
      {
        icon: AlertTriangle,
        label: 'Filter Rate',
        value: formatPercent(xml.filters?.filter_rate),
        detail: `${formatNumber(xml.filters?.filtered_count)} filtrelenen satir`,
        tone: xml.filters?.filtered_count > 0 ? 'warning' : 'neutral',
      },
    ];
  }, [report]);

  const productKpis = useMemo(() => {
    if (!report?.product_intelligence) return [];
    const product = report.product_intelligence;
    const ty = product.marketplace_readiness?.trendyol || {};
    const hb = product.marketplace_readiness?.hepsiburada || {};

    return [
      {
        icon: PackageCheck,
        label: 'Readiness Health',
        value: formatPercent(product.readiness?.readiness_rate),
        detail: `${formatNumber(product.readiness?.ready_products)} hazir, ${formatNumber(product.readiness?.blocked_products)} blokeli`,
        tone: product.readiness?.blocked_products > 0 ? 'warning' : 'success',
      },
      {
        icon: DatabaseZap,
        label: 'Ownership Coverage',
        value: formatPercent(product.ownership?.source_product_code_coverage),
        detail: `${formatNumber(product.ownership?.xml_owned_products)} XML owned, ${formatNumber(product.ownership?.products_without_owner)} owner yok`,
        tone: product.ownership?.products_without_owner > 0 ? 'warning' : 'success',
      },
      {
        icon: BarChart3,
        label: 'Variant Health',
        value: `${formatNumber(product.variants?.ready_variant_children)} / ${formatNumber(product.variants?.child_count)}`,
        detail: `${formatNumber(product.variants?.parents_with_problem_children)} problemli parent`,
        tone: product.variants?.parents_with_problem_children > 0 ? 'critical' : 'success',
      },
      {
        icon: Activity,
        label: 'Marketplace Readiness',
        value: formatNumber(Number(ty.ready || 0) + Number(hb.ready || 0)),
        detail: `TY ${formatNumber(ty.ready)} hazir, HB ${formatNumber(hb.ready)} hazir`,
        tone: (ty.blocked || 0) + (hb.blocked || 0) > 0 ? 'warning' : 'success',
      },
    ];
  }, [report]);

  const marketplaceKpis = useMemo(() => {
    if (!report?.marketplace_intelligence) return [];
    const intelligence = report.marketplace_intelligence;
    const trendyol = intelligence.marketplaces?.trendyol || {};
    const hepsiburada = intelligence.marketplaces?.hepsiburada || {};
    const rejectedFailed = Number(intelligence.rejected_products?.total || 0) + Number(intelligence.failed_products?.total || 0);

    return [
      intelligence.marketplaces?.trendyol ? {
        icon: ShoppingCart,
        label: 'Trendyol Health',
        value: healthLabel(trendyol.health),
        detail: `${formatNumber(trendyol.approved)} approved, ${formatNumber(trendyol.rejected)} rejected`,
        tone: trendyol.health === 'critical' ? 'critical' : trendyol.health === 'warning' ? 'warning' : 'success',
        action: { label: `Neden ${healthLabel(trendyol.health)}?`, onClick: () => openDrilldown('trendyol') },
      } : null,
      intelligence.marketplaces?.hepsiburada ? {
        icon: ShoppingCart,
        label: 'Hepsiburada Health',
        value: healthLabel(hepsiburada.health),
        detail: `${formatNumber(hepsiburada.approved)} approved, ${formatNumber(hepsiburada.failed)} failed`,
        tone: hepsiburada.health === 'critical' ? 'critical' : hepsiburada.health === 'warning' ? 'warning' : 'success',
        action: { label: `Neden ${healthLabel(hepsiburada.health)}?`, onClick: () => openDrilldown('hepsiburada') },
      } : null,
      {
        icon: Activity,
        label: 'Batch Success',
        value: formatPercent(intelligence.batch_success?.batch_success_rate),
        detail: `${formatNumber(intelligence.batch_success?.products_with_batch)} batch urunu`,
        tone: Number(intelligence.batch_success?.failed_products || 0) + Number(intelligence.batch_success?.rejected_products || 0) > 0 ? 'warning' : 'success',
      },
      {
        icon: ShieldAlert,
        label: 'Rejected / Failed',
        value: formatNumber(rejectedFailed),
        detail: `${formatNumber(intelligence.variant_problems?.problem_children_count)} problemli varyant`,
        tone: rejectedFailed > 0 ? 'critical' : 'success',
      },
    ].filter(Boolean);
  }, [report, filters.from, filters.to]);

  const operationsKpis = useMemo(() => {
    if (!report?.operations_intelligence) return [];
    const operations = report.operations_intelligence;
    const webhookRate = Math.round(((Number(operations.webhooks?.inbound_success_rate || 0) + Number(operations.webhooks?.outbound_success_rate || 0)) / 2) * 10) / 10;

    return [
      {
        icon: Clock,
        label: 'Queue Health',
        value: healthLabel(operations.queue?.queue_risk),
        detail: `${formatNumber(operations.queue?.failed_jobs)} failed, ${formatNumber(operations.queue?.retry_jobs)} retry`,
        tone: operations.queue?.queue_risk === 'critical' ? 'critical' : operations.queue?.queue_risk === 'warning' ? 'warning' : 'success',
      },
      {
        icon: AlertTriangle,
        label: 'API Error Rate',
        value: formatPercent(operations.api?.error_rate),
        detail: `${formatNumber(operations.api?.status_5xx)} 5xx, ${formatNumber(operations.api?.slow_requests)} slow`,
        tone: operations.api?.status_5xx > 0 || operations.api?.error_rate >= 10 ? 'critical' : operations.api?.api_errors > 0 ? 'warning' : 'success',
      },
      {
        icon: Webhook,
        label: 'Webhook Reliability',
        value: formatPercent(webhookRate),
        detail: `${formatNumber(Number(operations.webhooks?.inbound_failed || 0) + Number(operations.webhooks?.outbound_failed || 0))} failed delivery`,
        tone: Number(operations.webhooks?.inbound_failed || 0) + Number(operations.webhooks?.outbound_failed || 0) > 0 ? 'warning' : 'success',
      },
      {
        icon: ShieldAlert,
        label: 'Risk Score',
        value: formatNumber(operations.risk_score?.score),
        detail: `${formatNumber(operations.risk_score?.factors?.length)} risk faktoru`,
        tone: operations.risk_score?.health === 'critical' ? 'critical' : operations.risk_score?.health === 'warning' ? 'warning' : 'success',
      },
    ];
  }, [report]);

  const financeKpis = useMemo(() => {
    if (!report?.finance_intelligence) return [];
    const finance = report.finance_intelligence;
    const providers = finance.provider_performance || [];
    const totalPayments = sumValues(providers.map((provider) => provider.total_payments));
    const successfulPayments = sumValues(providers.map((provider) => provider.successful));
    const providerSuccess = totalPayments > 0 ? (successfulPayments / totalPayments) * 100 : 0;

    return [
      {
        icon: WalletCards,
        label: 'Payment Health',
        value: healthLabel(finance.payment_health?.health),
        detail: `${formatNumber(finance.payment_health?.failed)} failed, ${formatNumber(finance.payment_health?.pending)} pending`,
        tone: finance.payment_health?.health === 'critical' ? 'critical' : finance.payment_health?.health === 'warning' ? 'warning' : 'success',
      },
      {
        icon: Activity,
        label: 'Provider Success',
        value: formatPercent(providerSuccess),
        detail: `${formatNumber(successfulPayments)} / ${formatNumber(totalPayments)} basarili`,
        tone: providerSuccess < 90 && totalPayments > 0 ? 'warning' : 'success',
      },
      {
        icon: ShieldAlert,
        label: 'Refund Rate',
        value: formatPercent(finance.refunds?.refund_rate),
        detail: `${formatMoney(finance.refunds?.refunded_amount)} iade`,
        tone: Number(finance.refunds?.refund_rate || 0) >= 10 ? 'warning' : 'success',
      },
      {
        icon: BarChart3,
        label: 'Commission Cost',
        value: formatMoney(finance.commissions?.total_commission_amount),
        detail: `Revenue orani ${formatPercent(finance.commissions?.commission_to_revenue_ratio)}`,
        tone: Number(finance.commissions?.commission_to_revenue_ratio || 0) >= 8 ? 'warning' : 'neutral',
      },
      {
        icon: DatabaseZap,
        label: 'Accounting Health',
        value: healthLabel(finance.accounting_health?.health),
        detail: `${formatNumber(finance.accounting_errors?.total_errors)} ERP hata`,
        tone: finance.accounting_health?.health === 'critical' ? 'critical' : finance.accounting_health?.health === 'warning' ? 'warning' : 'success',
      },
      {
        icon: PackageCheck,
        label: 'Invoice Success',
        value: formatPercent(finance.invoice_success?.invoice_success_rate),
        detail: `${formatNumber(finance.invoice_success?.issued)} issued, ${formatNumber(finance.invoice_success?.failed)} failed`,
        tone: Number(finance.invoice_success?.failed || 0) > 0 ? 'warning' : 'success',
      },
    ];
  }, [report]);

  const logisticsKpis = useMemo(() => {
    if (!report?.logistics_intelligence) return [];
    const logistics = report.logistics_intelligence;
    const carriers = logistics.carrier_performance || [];
    const totalShipments = sumValues(carriers.map((carrier) => carrier.total_shipments));
    const deliveredShipments = sumValues(carriers.map((carrier) => carrier.delivered));
    const carrierSuccess = totalShipments > 0 ? (deliveredShipments / totalShipments) * 100 : 0;

    return [
      {
        icon: Truck,
        label: 'Shipping Health',
        value: healthLabel(logistics.shipping_health?.health),
        detail: `${formatNumber(logistics.shipping_health?.failed_shipments)} failed, ${formatNumber(logistics.shipping_health?.delayed_shipments)} gecikmis`,
        tone: logistics.shipping_health?.health === 'critical' ? 'critical' : logistics.shipping_health?.health === 'warning' ? 'warning' : 'success',
      },
      {
        icon: Activity,
        label: 'Carrier Success',
        value: formatPercent(carrierSuccess),
        detail: `${formatNumber(deliveredShipments)} / ${formatNumber(totalShipments)} teslim`,
        tone: carrierSuccess < 90 && totalShipments > 0 ? 'warning' : 'success',
      },
      {
        icon: Clock,
        label: 'Delivery Speed',
        value: `${formatNumber(logistics.delivery_performance?.avg_delivery_time_hours)} saat`,
        detail: `${formatNumber(logistics.delivery_performance?.in_transit_count)} yolda`,
        tone: Number(logistics.delivery_performance?.delayed_shipments || 0) > 0 ? 'warning' : 'neutral',
      },
      {
        icon: ShieldAlert,
        label: 'Failed Shipments',
        value: formatNumber(logistics.failed_shipments?.failed_count),
        detail: `Failure ${formatPercent(logistics.failed_shipments?.failed_rate)}`,
        tone: Number(logistics.failed_shipments?.failed_count || 0) > 0 ? 'critical' : 'success',
      },
      {
        icon: AlertTriangle,
        label: 'Delayed Shipments',
        value: formatNumber(logistics.delivery_performance?.delayed_shipments),
        detail: `Risk ${formatNumber(logistics.logistics_risk?.score)} / 100`,
        tone: Number(logistics.delivery_performance?.delayed_shipments || 0) > 0 ? 'warning' : 'success',
      },
    ];
  }, [report]);

  return (
    <>
      <PageHeader
        title="Analytics Center"
        description="Satis, operasyon, XML, queue, API, webhook ve SaaS sagligini tek merkezde izleyin."
        actions={<button type="button" onClick={load} disabled={loading}><RefreshCcw size={16} /> Yenile</button>}
      />

      <section className="analytics-filter-bar">
        <label>
          <span>Tarih baslangic</span>
          <input type="date" value={filters.from} onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))} />
        </label>
        <label>
          <span>Tarih bitis</span>
          <input type="date" value={filters.to} onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))} />
        </label>
        <label>
          <span>Marketplace</span>
          <select value={filters.marketplace_code} onChange={(event) => setFilters((current) => ({ ...current, marketplace_code: event.target.value }))}>
            <option value="">Tum marketplace</option>
            <option value="trendyol">Trendyol</option>
            <option value="hepsiburada">Hepsiburada</option>
          </select>
        </label>
        <button type="button" className="secondary" onClick={load} disabled={loading}><Activity size={16} /> Uygula</button>
      </section>

      {error && <ErrorState message={error} onRetry={load} />}
      {loading && !report ? <LoadingState /> : null}

      {report && (
        <>
          <section className="analytics-kpi-grid">
            {kpis.map((kpi) => <KpiCard key={kpi.label} {...kpi} />)}
          </section>

          <section className="domain-health-grid">
            {healthCards.map((card) => <HealthCard key={card.title} {...card} />)}
          </section>

          <div className="analytics-overview-grid">
            <section className="panel analytics-chart-panel">
              <div className="panel-heading">
                <div>
                  <span>Trend</span>
                  <h2>Satis ve siparis hareketi</h2>
                </div>
              </div>
              <TrendBars series={report.sales?.trend || []} />
            </section>

            <section className="panel analytics-alert-panel">
              <div className="panel-heading">
                <div>
                  <span>Aksiyon</span>
                  <h2>Actionable Alerts</h2>
                </div>
              </div>
              {report.alerts?.length > 0 ? (
                <div className="analytics-alert-list">
                  {report.alerts.map((alert) => (
                    <article className={`analytics-alert-card ${alert.tone}`} key={alert.key}>
                      <ShieldAlert size={18} />
                      <div>
                        <strong>{alert.label}</strong>
                        <span>{formatNumber(alert.value)} kayit</span>
                        <small>{alertMessage(alert)}</small>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="analytics-empty-state">
                  <AlertTriangle size={20} />
                  <strong>Kritik aksiyon yok</strong>
                  <span>Secili aralikta failed import, queue, webhook veya subscription riski gorunmuyor.</span>
                </div>
              )}
            </section>
          </div>

          <IntelligenceSection
            title="XML Intelligence"
            description="XML kaynak sagligi, import performansi, mapping basarisi, filtre ve ownership conflict sinyalleri."
          >
            <section className="analytics-kpi-grid">
              {xmlKpis.map((kpi) => <KpiCard key={kpi.label} {...kpi} />)}
            </section>
            <div className="analytics-three-column">
              <InsightList
                title="Problemli kaynaklar"
                items={(report.xml_intelligence?.sources || []).filter((source) => source.health !== 'healthy').slice(0, 6)}
                emptyText="Kritik veya dikkat gerektiren XML kaynagi yok."
                renderItem={(source) => (
                  <article className={`analytics-insight-row ${source.health}`} key={source.source_id}>
                    <div>
                      <strong>{source.source_name}</strong>
                      <span>{source.supplier_name || 'Tedarikci yok'} · {source.last_status || 'durum yok'}</span>
                    </div>
                    <small>{source.last_error || source.last_import_at || 'Son import yok'}</small>
                  </article>
                )}
              />
              <InsightList
                title="Conflict kaynaklari"
                items={(report.xml_intelligence?.conflicts?.conflict_sources || []).slice(0, 6)}
                emptyText="Secili aralikta ownership conflict gorunmuyor."
                renderItem={(source) => (
                  <article className="analytics-insight-row critical" key={`${source.xml_source_id}-${source.source_name}`}>
                    <div>
                      <strong>{source.source_name || 'Bilinmeyen kaynak'}</strong>
                      <span>{source.supplier_name || 'Tedarikci yok'}</span>
                    </div>
                    <small>{formatNumber(source.conflict_count)} conflict</small>
                  </article>
                )}
              />
              <InsightList
                title="Son XML aktiviteleri"
                items={(report.xml_intelligence?.sources || []).slice(0, 6)}
                emptyText="XML aktivitesi bulunamadi."
                renderItem={(source) => (
                  <article className={`analytics-insight-row ${source.health}`} key={`activity-${source.source_id}`}>
                    <div>
                      <strong>{source.source_name}</strong>
                      <span>{source.last_import_at || 'Import bekleniyor'}</span>
                    </div>
                    <small>{healthLabel(source.health)}</small>
                  </article>
                )}
              />
            </div>
          </IntelligenceSection>

          <IntelligenceSection
            title="Product Intelligence"
            description="Urun readiness, XML ownership, varyant parent-child sagligi ve marketplace hazirlik sinyalleri."
          >
            <section className="analytics-kpi-grid">
              {productKpis.map((kpi) => <KpiCard key={kpi.label} {...kpi} />)}
            </section>
            <div className="analytics-three-column">
              <InsightList
                title="Problemli parent urunler"
                items={(report.product_intelligence?.parent_child?.problem_parents || []).slice(0, 6)}
                emptyText="Problemli parent/child rollup bulunmuyor."
                renderItem={(parent) => (
                  <article className={`analytics-insight-row ${parent.health}`} key={parent.product_id}>
                    <div>
                      <strong>{parent.name || parent.sku}</strong>
                      <span>{parent.ready_children}/{parent.total_children} varyant hazir · {parent.variant_group_key || 'group yok'}</span>
                    </div>
                    <small>{formatNumber(parent.problem_children)} problem</small>
                  </article>
                )}
              />
              <InsightList
                title="Readiness eksikleri"
                items={(report.product_intelligence?.missing_field_heatmap || []).filter((field) => field.count > 0).slice(0, 8)}
                emptyText="Secili kapsamda eksik readiness alani yok."
                renderItem={(field) => (
                  <article className="analytics-insight-row warning" key={field.field}>
                    <div>
                      <strong>{labels[field.field] || field.field}</strong>
                      <span>Marketplace readiness kontrolu</span>
                    </div>
                    <small>{formatNumber(field.count)} urun</small>
                  </article>
                )}
              />
              <InsightList
                title="Ownership eksikleri"
                items={[
                  { key: 'ownerless', label: 'Owner olmayan urunler', value: report.product_intelligence?.ownership?.products_without_owner },
                  { key: 'stale', label: 'Eski XML sync', value: report.product_intelligence?.ownership?.stale_xml_products },
                  { key: 'orphan', label: 'Orphan varyant', value: report.product_intelligence?.variants?.orphan_variants },
                ].filter((item) => Number(item.value || 0) > 0)}
                emptyText="Ownership ve varyant baglantilari temiz gorunuyor."
                renderItem={(item) => (
                  <article className="analytics-insight-row warning" key={item.key}>
                    <div>
                      <strong>{item.label}</strong>
                      <span>Aksiyon gerektirebilir</span>
                    </div>
                    <small>{formatNumber(item.value)}</small>
                  </article>
                )}
              />
            </div>
          </IntelligenceSection>

          <IntelligenceSection
            title="Finance Intelligence"
            description="Odeme sagligi, provider performansi, iade/komisyon maliyeti ve ERP/fatura hata sinyalleri."
          >
            <section className="analytics-kpi-grid">
              {financeKpis.map((kpi) => <KpiCard key={kpi.label} {...kpi} />)}
            </section>
            {report.finance_intelligence?.finance_risk?.factors?.length > 0 && (
              <section className={`analytics-risk-banner ${report.finance_intelligence.finance_risk.health}`}>
                <div>
                  <span>Finance Risk</span>
                  <strong>{formatNumber(report.finance_intelligence.finance_risk.score)} / 100</strong>
                </div>
                <p>{report.finance_intelligence.finance_risk.factors.map((factor) => factor.label).join(' · ')}</p>
              </section>
            )}
            <div className="analytics-three-column">
              <InsightList
                title="Problemli saglayicilar"
                items={(report.finance_intelligence?.provider_performance || [])
                  .filter((provider) => Number(provider.failed || 0) > 0 || Number(provider.failure_rate || 0) > 0 || provider.latest_error)
                  .slice(0, 6)}
                emptyText="Odeme saglayicilarinda problem sinyali yok."
                renderItem={(provider) => (
                  <article className={Number(provider.failure_rate || 0) >= 10 ? 'analytics-insight-row critical' : 'analytics-insight-row warning'} key={provider.provider_code}>
                    <div>
                      <strong>{provider.provider_name || provider.provider_code}</strong>
                      <span>{formatPercent(provider.success_rate)} success · {formatNumber(provider.failed)} failed</span>
                    </div>
                    <small>{provider.latest_error || `${formatMoney(provider.total_amount)} hacim`}</small>
                  </article>
                )}
              />
              <InsightList
                title="Son failed payments"
                items={(report.finance_intelligence?.payment_health?.latest_failed || []).slice(0, 6)}
                emptyText="Failed payment kaydi yok."
                renderItem={(payment) => (
                  <article className="analytics-insight-row critical" key={`payment-${payment.id}`}>
                    <div>
                      <strong>{payment.provider_code || 'Provider'}</strong>
                      <span>{payment.error_message || payment.status}</span>
                    </div>
                    <small>{formatMoney(payment.amount)}</small>
                  </article>
                )}
              />
              <InsightList
                title="Son ERP hatalari"
                items={(report.finance_intelligence?.accounting_errors?.latest_errors || []).slice(0, 6)}
                emptyText="ERP/fatura hata kaydi yok."
                renderItem={(error) => (
                  <article className="analytics-insight-row critical" key={`accounting-${error.id}`}>
                    <div>
                      <strong>{error.provider_code || 'ERP'}</strong>
                      <span>{error.error_message || error.status}</span>
                    </div>
                    <small>{formatNumber(error.duration_ms)}ms</small>
                  </article>
                )}
              />
            </div>
            <div className="analytics-three-column">
              <InsightList
                title="Refund trendleri"
                items={(report.finance_intelligence?.refunds?.refund_by_provider || []).slice(0, 6)}
                emptyText="Iade trendi gorunmuyor."
                renderItem={(refund) => (
                  <article className="analytics-insight-row warning" key={`refund-${refund.provider_code}`}>
                    <div>
                      <strong>{refund.provider_code}</strong>
                      <span>Provider bazli iade hacmi</span>
                    </div>
                    <small>{formatNumber(refund.count)} iade</small>
                  </article>
                )}
              />
              <InsightList
                title="Komisyon maliyeti"
                items={(report.finance_intelligence?.commissions?.commission_by_provider || []).slice(0, 6)}
                emptyText="Komisyon verisi bulunmuyor."
                renderItem={(commission) => (
                  <article className="analytics-insight-row neutral" key={`commission-${commission.provider_code}`}>
                    <div>
                      <strong>{commission.provider_code}</strong>
                      <span>Ortalama oran {formatPercent(commission.avg_commission_rate)}</span>
                    </div>
                    <small>{formatMoney(commission.commission_amount)}</small>
                  </article>
                )}
              />
              <InsightList
                title="Fatura basarisi"
                items={[
                  { key: 'issued', label: 'Issued', value: report.finance_intelligence?.invoice_success?.issued, tone: 'success' },
                  { key: 'failed', label: 'Failed', value: report.finance_intelligence?.invoice_success?.failed, tone: 'critical' },
                  { key: 'queued', label: 'Queued', value: report.finance_intelligence?.invoice_success?.queued, tone: 'warning' },
                  { key: 'return', label: 'Return invoices', value: report.finance_intelligence?.invoice_success?.return_invoices, tone: 'neutral' },
                ].filter((item) => Number(item.value || 0) > 0)}
                emptyText="Fatura aktivitesi bulunmuyor."
                renderItem={(item) => (
                  <article className={`analytics-insight-row ${item.tone}`} key={`invoice-${item.key}`}>
                    <div>
                      <strong>{item.label}</strong>
                      <span>Secili aralik</span>
                    </div>
                    <small>{formatNumber(item.value)}</small>
                  </article>
                )}
              />
            </div>
          </IntelligenceSection>

          <IntelligenceSection
            title="Logistics Intelligence"
            description="Kargo sagligi, tasiyici performansi, teslimat hizi, geciken ve hatali gonderi sinyalleri."
          >
            <section className="analytics-kpi-grid">
              {logisticsKpis.map((kpi) => <KpiCard key={kpi.label} {...kpi} />)}
            </section>
            {report.logistics_intelligence?.logistics_risk?.factors?.length > 0 && (
              <section className={`analytics-risk-banner ${report.logistics_intelligence.logistics_risk.health}`}>
                <div>
                  <span>Logistics Risk</span>
                  <strong>{formatNumber(report.logistics_intelligence.logistics_risk.score)} / 100</strong>
                </div>
                <p>{report.logistics_intelligence.logistics_risk.factors.map((factor) => factor.label).join(' · ')}</p>
              </section>
            )}
            <div className="analytics-three-column">
              <InsightList
                title="Problemli kargolar"
                items={(report.logistics_intelligence?.carrier_performance || [])
                  .filter((carrier) => Number(carrier.failed || 0) > 0 || Number(carrier.failure_rate || 0) > 0 || carrier.latest_error)
                  .slice(0, 6)}
                emptyText="Kargo tasiyicilarinda problem sinyali yok."
                renderItem={(carrier) => (
                  <article className={Number(carrier.failure_rate || 0) >= 10 ? 'analytics-insight-row critical' : 'analytics-insight-row warning'} key={carrier.carrier_code}>
                    <div>
                      <strong>{carrier.carrier_name || carrier.carrier_code}</strong>
                      <span>{formatPercent(carrier.delivery_success_rate)} teslim · {formatNumber(carrier.failed)} failed</span>
                    </div>
                    <small>{carrier.latest_error || `${formatNumber(carrier.total_shipments)} gonderi`}</small>
                  </article>
                )}
              />
              <InsightList
                title="Geciken gonderiler"
                items={(report.logistics_intelligence?.delivery_performance?.delayed_samples || []).slice(0, 6)}
                emptyText="Geciken gonderi yok."
                renderItem={(shipment) => (
                  <article className="analytics-insight-row warning" key={`delayed-${shipment.id}`}>
                    <div>
                      <strong>{shipment.carrier_code || 'Kargo'}</strong>
                      <span>{shipment.tracking_number || shipment.status}</span>
                    </div>
                    <small>{shipment.shipped_at || 'Tarih yok'}</small>
                  </article>
                )}
              />
              <InsightList
                title="Carrier hatalari"
                items={(report.logistics_intelligence?.carrier_performance || []).filter((carrier) => carrier.latest_error).slice(0, 6)}
                emptyText="Carrier hata kaydi yok."
                renderItem={(carrier) => (
                  <article className="analytics-insight-row critical" key={`carrier-error-${carrier.carrier_code}`}>
                    <div>
                      <strong>{carrier.carrier_name || carrier.carrier_code}</strong>
                      <span>{carrier.latest_error}</span>
                    </div>
                    <small>{formatPercent(carrier.failure_rate)}</small>
                  </article>
                )}
              />
            </div>
            <div className="analytics-three-column">
              <InsightList
                title="Failed shipments"
                items={(report.logistics_intelligence?.failed_shipments?.latest_failed || []).slice(0, 6)}
                emptyText="Failed shipment kaydi yok."
                renderItem={(shipment) => (
                  <article className="analytics-insight-row critical" key={`failed-shipment-${shipment.id}`}>
                    <div>
                      <strong>{shipment.carrier_code || 'Kargo'}</strong>
                      <span>{shipment.error_message || shipment.status}</span>
                    </div>
                    <small>{shipment.tracking_number || shipment.updated_at || 'tracking yok'}</small>
                  </article>
                )}
              />
              <InsightList
                title="Return trendleri"
                items={(report.logistics_intelligence?.carrier_performance || []).filter((carrier) => Number(carrier.returned || 0) > 0).slice(0, 6)}
                emptyText="Iade kargo trendi gorunmuyor."
                renderItem={(carrier) => (
                  <article className="analytics-insight-row warning" key={`return-${carrier.carrier_code}`}>
                    <div>
                      <strong>{carrier.carrier_name || carrier.carrier_code}</strong>
                      <span>Return volume</span>
                    </div>
                    <small>{formatNumber(carrier.returned)} iade</small>
                  </article>
                )}
              />
              <InsightList
                title="Logistics risk faktorleri"
                items={(report.logistics_intelligence?.logistics_risk?.factors || []).slice(0, 6)}
                emptyText="Lojistik risk skoru saglikli aralikta."
                renderItem={(factor) => (
                  <article className="analytics-insight-row warning" key={`logistics-risk-${factor.key}`}>
                    <div>
                      <strong>{factor.label}</strong>
                      <span>Risk agirligi {formatNumber(factor.weight)}</span>
                    </div>
                    <small>{formatNumber(factor.value)}</small>
                  </article>
                )}
              />
            </div>
          </IntelligenceSection>

          <IntelligenceSection
            title="Marketplace Intelligence"
            description="Trendyol ve Hepsiburada hesap sagligi, batch basari oranlari, rejected/failed urunler ve varyant problemleri."
          >
            <section className="analytics-kpi-grid">
              {marketplaceKpis.map((kpi) => <KpiCard key={kpi.label} {...kpi} />)}
            </section>
            <div className="analytics-three-column">
              <InsightList
                title="Problemli marketplace hesaplari"
                items={Object.entries(report.marketplace_intelligence?.marketplaces || {})
                  .map(([code, row]) => ({ code, ...row }))
                  .filter((row) => row.health !== 'healthy' || Number(row.failed_accounts || 0) > 0 || row.last_error)
                  .slice(0, 6)}
                emptyText="Marketplace hesaplarinda kritik sinyal yok."
                renderItem={(marketplace) => (
                  <article className={`analytics-insight-row ${marketplace.health}`} key={marketplace.code}>
                    <div>
                      <strong>{marketplaceLabel(marketplace.code)}</strong>
                      <span>{formatNumber(marketplace.failed_accounts)} failed account · {formatNumber(marketplace.api_errors)} API hata</span>
                    </div>
                    <small>{marketplace.last_error || healthLabel(marketplace.health)}</small>
                    <ActionLink to={`/marketplaces/${marketplace.code}`}>Yonet</ActionLink>
                  </article>
                )}
              />
              <InsightList
                title="Son batch problemleri"
                items={(report.marketplace_intelligence?.batch_success?.problem_batches || []).slice(0, 6)}
                emptyText="Problemli batch grubu bulunmuyor."
                renderItem={(batch) => (
                  <article className="analytics-insight-row critical" key={`${batch.marketplace_code}-${batch.batch_request_id}`}>
                    <div>
                      <strong>{batch.batch_request_id || 'Batch yok'}</strong>
                      <span>{marketplaceLabel(batch.marketplace_code)} · {formatNumber(batch.failed_count)} failed / {formatNumber(batch.rejected_count)} rejected</span>
                    </div>
                    <small>{formatNumber(batch.problem_count)} problem</small>
                    <ActionLink to="/products/publish-queue">Queue</ActionLink>
                  </article>
                )}
              />
              <InsightList
                title="Rejected product listesi"
                items={(report.marketplace_intelligence?.rejected_products?.latest || []).slice(0, 6)}
                emptyText="Rejected urun kaydi yok."
                renderItem={(product) => (
                  <article className="analytics-insight-row warning" key={`rejected-${product.product_id}-${product.marketplace_code}`}>
                    <div>
                      <strong>{product.name || product.sku}</strong>
                      <span>{marketplaceLabel(product.marketplace_code)} · {product.error_message || product.status}</span>
                    </div>
                    <small>{product.batch_request_id || product.last_checked_at || 'batch yok'}</small>
                    <ActionLink to={`/products/${product.product_id}`}>Detay</ActionLink>
                  </article>
                )}
              />
            </div>
            <div className="analytics-three-column">
              <InsightList
                title="Failed product listesi"
                items={(report.marketplace_intelligence?.failed_products?.latest || []).slice(0, 6)}
                emptyText="Failed/problematic urun kaydi yok."
                renderItem={(product) => (
                  <article className="analytics-insight-row critical" key={`failed-${product.product_id}-${product.marketplace_code}`}>
                    <div>
                      <strong>{product.name || product.sku}</strong>
                      <span>{marketplaceLabel(product.marketplace_code)} · {product.error_message || product.status}</span>
                    </div>
                    <small>{product.batch_request_id || product.last_checked_at || 'batch yok'}</small>
                    <ActionLink to={`/api-logs?search=${encodeURIComponent(product.sku || product.barcode || product.batch_request_id || '')}`}>Log</ActionLink>
                  </article>
                )}
              />
              <InsightList
                title="Variant problem listesi"
                items={(report.marketplace_intelligence?.variant_problems?.latest_problem_children || []).slice(0, 6)}
                emptyText="Problemli child varyant gorunmuyor."
                renderItem={(child, index) => (
                  <article className="analytics-insight-row warning" key={`variant-problem-${child.product_id || index}-${child.marketplace_code}`}>
                    <div>
                      <strong>{child.sku || child.barcode || 'Varyant'}</strong>
                      <span>{marketplaceLabel(child.marketplace_code)} · {child.error_message || child.status}</span>
                    </div>
                    <small>{child.batch_request_id || child.last_checked_at || 'batch yok'}</small>
                    <ActionLink to={`/products/${child.product_id}`}>Coz</ActionLink>
                  </article>
                )}
              />
              <InsightList
                title="Marketplace success oranlari"
                items={Object.entries(report.marketplace_intelligence?.marketplaces || {}).map(([code, row]) => ({ code, ...row }))}
                emptyText="Marketplace performans verisi yok."
                renderItem={(marketplace) => (
                  <article className={`analytics-insight-row ${marketplace.health}`} key={`success-${marketplace.code}`}>
                    <div>
                      <strong>{marketplaceLabel(marketplace.code)}</strong>
                      <span>Success {formatPercent(marketplace.success_rate)} · Readiness {formatPercent(marketplace.readiness_rate)}</span>
                    </div>
                    <small>{formatNumber(marketplace.approved)} approved</small>
                  </article>
                )}
              />
            </div>
          </IntelligenceSection>

          <IntelligenceSection
            title="Operations Intelligence"
            description="Queue, API hata trendleri, webhook guvenilirligi, operasyonel risk skoru ve aksiyon uyarilari."
          >
            <section className="analytics-kpi-grid">
              {operationsKpis.map((kpi) => <KpiCard key={kpi.label} {...kpi} />)}
            </section>
            {report.operations_intelligence?.risk_score?.factors?.length > 0 && (
              <section className={`analytics-risk-banner ${report.operations_intelligence.risk_score.health}`}>
                <div>
                  <span>Operational Risk</span>
                  <strong>{formatNumber(report.operations_intelligence.risk_score.score)} / 100</strong>
                </div>
                <p>{report.operations_intelligence.risk_score.factors.map((factor) => factor.label).join(' · ')}</p>
              </section>
            )}
            <div className="analytics-three-column">
              <InsightList
                title="Failed queue jobs"
                items={(report.operations_intelligence?.queue?.recent_failed_sync_runs || []).slice(0, 6)}
                emptyText="Failed sync run gorunmuyor."
                renderItem={(run) => (
                  <article className="analytics-insight-row critical" key={`queue-${run.id}`}>
                    <div>
                      <strong>{run.type || 'sync'}</strong>
                      <span>{marketplaceLabel(run.marketplace_code)} · {run.error_message || run.status}</span>
                    </div>
                    <small>{formatNumber(run.attempts)} attempt</small>
                    <ActionLink to="/queue">Queue</ActionLink>
                  </article>
                )}
              />
              <InsightList
                title="Top API error endpoints"
                items={(report.operations_intelligence?.api?.top_error_endpoints || []).slice(0, 6)}
                emptyText="API hata endpointi yok."
                renderItem={(endpoint) => (
                  <article className="analytics-insight-row warning" key={endpoint.endpoint}>
                    <div>
                      <strong>{endpoint.endpoint}</strong>
                      <span>Provider hata merkezi</span>
                    </div>
                    <small>{formatNumber(endpoint.count)} hata</small>
                    <ActionLink to={`/api-logs?search=${encodeURIComponent(endpoint.endpoint || '')}`}>Log</ActionLink>
                  </article>
                )}
              />
              <InsightList
                title="Slow / latest API errors"
                items={(report.operations_intelligence?.api?.latest_errors || []).slice(0, 6)}
                emptyText="Yavas veya hatali API kaydi yok."
                renderItem={(log) => (
                  <article className={log.status_code >= 500 ? 'analytics-insight-row critical' : 'analytics-insight-row warning'} key={`api-${log.id}`}>
                    <div>
                      <strong>{log.method} {log.endpoint}</strong>
                      <span>{marketplaceLabel(log.marketplace_code)} · {log.error_message || log.status_code}</span>
                    </div>
                    <small>{formatNumber(log.duration_ms)}ms</small>
                    <ActionLink to={`/api-logs?search=${encodeURIComponent(log.endpoint || '')}`}>Incele</ActionLink>
                  </article>
                )}
              />
            </div>
            <div className="analytics-three-column">
              <InsightList
                title="Failed webhooks"
                items={(report.operations_intelligence?.webhooks?.latest_failed_webhooks || []).slice(0, 6)}
                emptyText="Webhook teslimat problemi yok."
                renderItem={(webhook) => (
                  <article className="analytics-insight-row warning" key={`${webhook.direction}-${webhook.id}`}>
                    <div>
                      <strong>{webhook.event || webhook.direction}</strong>
                      <span>{webhook.direction} · {webhook.error_message || webhook.status}</span>
                    </div>
                    <small>{marketplaceLabel(webhook.marketplace_code)}</small>
                    <ActionLink to="/api-logs">Loglar</ActionLink>
                  </article>
                )}
              />
              <InsightList
                title="Operational alerts"
                items={(report.operations_intelligence?.alerts || []).slice(0, 8)}
                emptyText="Operasyonel alert yok."
                renderItem={(alert) => (
                  <article className={`analytics-insight-row ${alert.tone}`} key={`${alert.key}-${alert.marketplace_code || 'global'}`}>
                    <div>
                      <strong>{alert.label}</strong>
                      <span>{alert.action_hint}</span>
                    </div>
                    <small>{formatNumber(alert.value)}</small>
                    <ActionLink to={alert.target_path}>Aksiyon</ActionLink>
                  </article>
                )}
              />
              <InsightList
                title="Risk faktorleri"
                items={(report.operations_intelligence?.risk_score?.factors || []).slice(0, 6)}
                emptyText="Risk skoru saglikli aralikta."
                renderItem={(factor) => (
                  <article className="analytics-insight-row warning" key={factor.key}>
                    <div>
                      <strong>{factor.label}</strong>
                      <span>Risk agirligi {formatNumber(factor.weight)}</span>
                    </div>
                    <small>{formatNumber(factor.value)}</small>
                  </article>
                )}
              />
            </div>
          </IntelligenceSection>
        </>
      )}

      {(drilldown || drilldownLoading || drilldownError) && (
        <MarketplaceDrilldownDrawer
          data={drilldown}
          loading={drilldownLoading}
          error={drilldownError}
          onClose={() => {
            setDrilldown(null);
            setDrilldownError('');
          }}
        />
      )}
    </>
  );
}

export function CustomerReportsPage() {
  const { loading, error, run } = useAsync();
  const [report, setReport] = useState(null);

  const load = async () => {
    await run(async () => {
      setReport(await api.dashboard.report());
    });
  };

  useEffect(() => {
    load();
  }, []);

  const totals = useMemo(() => {
    if (!report) return { orders: 0, products: 0, shipments: 0 };

    return {
      orders: report.breakdowns.orders.reduce((sum, item) => sum + Number(item.value || 0), 0),
      products: report.breakdowns.products.reduce((sum, item) => sum + Number(item.value || 0), 0),
      shipments: report.breakdowns.shipping.reduce((sum, item) => sum + Number(item.value || 0), 0),
    };
  }, [report]);

  return (
    <>
      <PageHeader
        title="Raporlar"
        description="Satis, siparis, kargo ve urun durumlarinizi sade grafiklerle takip edin."
        actions={<button type="button" onClick={load} disabled={loading}><RefreshCcw size={16} /> Yenile</button>}
      />
      {error && <ErrorState message={error} onRetry={load} />}
      {loading && !report ? <LoadingState /> : null}
      {report && (
        <>
          <section className="customer-kpis">
            <div className="kpi-card"><span>Toplam Siparis</span><strong>{totals.orders}</strong><small>Tum siparisler</small></div>
            <div className="kpi-card"><span>Toplam Urun</span><strong>{totals.products}</strong><small>Katalog kaydi</small></div>
            <div className="kpi-card"><span>Kargo Kaydi</span><strong>{totals.shipments}</strong><small>Hazirlanan gonderiler</small></div>
            <div className="kpi-card"><span>Son 7 Gun Siparis</span><strong>{report.charts.orders.reduce((sum, item) => sum + Number(item.value || 0), 0)}</strong><small>Haftalik hareket</small></div>
          </section>

          <div className="split">
            <section className="panel">
              <h2>7 Gunluk Satis</h2>
              <TrendBars series={report.charts.sales} />
            </section>
            <section className="panel">
              <h2>7 Gunluk Siparis</h2>
              <TrendBars series={report.charts.orders} tone="secondary" />
            </section>
          </div>

          <div className="dashboard-grid">
            <Breakdown title="Siparis Durumu" items={report.breakdowns.orders} />
            <Breakdown title="Kargo Durumu" items={report.breakdowns.shipping} />
            <Breakdown title="Urun Durumu" items={report.breakdowns.products} />
          </div>
        </>
      )}
    </>
  );
}
