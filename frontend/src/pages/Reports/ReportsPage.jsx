import { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, BarChart3, Clock, DatabaseZap, PackageCheck, RefreshCcw, ShieldAlert, ShoppingCart, Truck, WalletCards, Webhook } from 'lucide-react';
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

function KpiCard({ icon: Icon, label, value, detail, tone = 'neutral' }) {
  return (
    <article className={`analytics-kpi-card ${tone}`}>
      <div className="analytics-kpi-icon"><Icon size={18} /></div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
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

export function ReportsPage() {
  const { loading, error, run } = useAsync();
  const [filters, setFilters] = useState(defaultFilters);
  const [report, setReport] = useState(null);

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
        </>
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
