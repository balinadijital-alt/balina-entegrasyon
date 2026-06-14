import { useEffect, useState } from 'react';
import { AlertTriangle, Building2, RefreshCcw, ShieldCheck, TrendingUp, Truck, Users, WalletCards } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client.js';
import { ErrorState } from '../../components/ErrorState.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { ReferenceModuleNav } from '../../components/ReferenceModuleNav.jsx';
import { useAsync } from '../../hooks/useAsync.js';

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

function healthLabel(health) {
  if (health === 'critical') return 'Kritik';
  if (health === 'warning') return 'Dikkat';
  return 'Saglikli';
}

function Kpi({ icon: Icon, label, value, detail, tone = 'neutral' }) {
  return (
    <article className={`executive-kpi-card ${tone}`}>
      <div className="executive-kpi-icon"><Icon size={18} /></div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function HealthTile({ label, data }) {
  return (
    <article className={`executive-health-tile ${data?.health || 'healthy'}`}>
      <div>
        <span>{label}</span>
        <strong>{data?.score ?? 100}</strong>
      </div>
      <em>{healthLabel(data?.health)}</em>
      <small>{formatNumber(data?.risk_count)} risk sinyali</small>
    </article>
  );
}

function Scorecard({ tenant }) {
  return (
    <article className={`executive-tenant-card ${tenant.health}`}>
      <div className="executive-tenant-heading">
        <div>
          <strong>{tenant.company_name}</strong>
          <span>{tenant.plan_name || tenant.plan} / {tenant.subscription_status}</span>
        </div>
        <em>{healthLabel(tenant.health)}</em>
      </div>
      <div className="executive-tenant-metrics">
        <div><strong>{tenant.risk_score}</strong><span>Risk</span></div>
        <div><strong>{formatPercent(tenant.usage_rate)}</strong><span>Kullanim</span></div>
        <div><strong>{formatMoney(tenant.revenue)}</strong><span>Ciro</span></div>
        <div><strong>{formatNumber(tenant.order_volume)}</strong><span>Siparis</span></div>
      </div>
      <div className="executive-reason-list">
        {(tenant.top_reasons || []).length > 0 ? tenant.top_reasons.map((reason) => (
          <span key={reason.key}>{reason.label}: {formatNumber(reason.value)}</span>
        )) : <span>Risk sinyali yok</span>}
      </div>
    </article>
  );
}

function SignalList({ title, items, valueKey = 'revenue', formatter = formatMoney }) {
  return (
    <section className="panel executive-signal-panel">
      <div className="panel-heading">
        <div>
          <span>Growth signal</span>
          <h2>{title}</h2>
        </div>
      </div>
      <div className="executive-signal-list">
        {items?.length > 0 ? items.map((item) => (
          <div className={`executive-signal-row ${item.health}`} key={`${title}-${item.company_id}`}>
            <div>
              <strong>{item.company_name}</strong>
              <span>{item.plan} / {item.subscription_status}</span>
            </div>
            <small>{formatter(item[valueKey])}</small>
          </div>
        )) : (
          <div className="analytics-empty-state compact">
            <strong>Veri yok</strong>
            <span>Bu sinyal icin aday bulunmuyor.</span>
          </div>
        )}
      </div>
    </section>
  );
}

export function ExecutiveDashboardPage() {
  const [filters, setFilters] = useState(defaultFilters);
  const [data, setData] = useState(null);
  const { loading, error, run } = useAsync();

  const load = () => run(async () => {
    const response = await api.analytics.executive(filters);
    setData(response);
  });

  useEffect(() => {
    load();
  }, []);

  const summary = data?.executive_summary || {};
  const business = data?.business_metrics || {};
  const saas = data?.saas_intelligence || {};
  const risk = data?.risk_overview || {};
  const health = data?.health_scores || {};
  const growth = data?.growth_signals || {};
  const tenants = data?.tenant_scorecards || [];
  const finance = data?.finance_intelligence || {};
  const logistics = data?.logistics_intelligence || {};

  return (
    <>
      <PageHeader
        title="Executive Dashboard"
        description="Platform sagligi, buyume sinyalleri ve tenant risklerini tek stratejik ekranda izleyin."
        actions={<button className="primary" type="button" onClick={load}><RefreshCcw size={16} /> Yenile</button>}
      />
      <ReferenceModuleNav section="admin" />

      <div className="analytics-filter-bar executive-filter-bar">
        <label>
          <span>Baslangic</span>
          <input type="date" value={filters.from} onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))} />
        </label>
        <label>
          <span>Bitis</span>
          <input type="date" value={filters.to} onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))} />
        </label>
        <button type="button" className="secondary" onClick={load}><RefreshCcw size={16} /> Uygula</button>
      </div>

      {error && <ErrorState message={error} />}
      {loading && !data ? <LoadingState label="Executive dashboard hazirlaniyor..." /> : null}

      {data && (
        <div className="executive-dashboard">
          <section className="executive-hero">
            <div>
              <span>System health</span>
              <h2>{healthLabel(summary.system_health)}</h2>
              <p>Risk skoru {formatNumber(summary.executive_risk_score)}. Bu ekran runtime aggregate kullanir; provider cagrisi veya billing islemi baslatmaz.</p>
            </div>
            <div className="executive-hero-metrics">
              <div><strong>{formatMoney(business.total_revenue)}</strong><span>Toplam ciro</span></div>
              <div><strong>{formatNumber(business.order_count)}</strong><span>Siparis</span></div>
              <div><strong>{formatMoney(business.avg_order_value)}</strong><span>Ortalama sepet</span></div>
            </div>
          </section>

          <section className="executive-kpi-strip">
            <Kpi icon={WalletCards} label="Revenue" value={formatMoney(summary.total_revenue)} detail="Secili tarih araligi" tone="success" />
            <Kpi icon={TrendingUp} label="Orders" value={formatNumber(summary.order_count)} detail="Tum kanallar" />
            <Kpi icon={Building2} label="Active companies" value={formatNumber(summary.active_companies)} detail="Aktif tenant" />
            <Kpi icon={Users} label="Active subscriptions" value={formatNumber(summary.active_subscriptions)} detail="Active + trial" />
            <Kpi icon={AlertTriangle} label="Risk score" value={formatNumber(summary.executive_risk_score)} detail={healthLabel(summary.system_health)} tone={summary.system_health} />
            <Kpi icon={WalletCards} label="Payment Health" value={healthLabel(finance.payment_health?.health || data.payment_health)} detail={`Refund ${formatPercent(finance.refund_rate)}`} tone={finance.payment_health?.health || data.payment_health || 'healthy'} />
            <Kpi icon={AlertTriangle} label="Finance Risk" value={formatNumber(data.finance_risk?.score || summary.finance_risk_score)} detail={healthLabel(data.finance_health)} tone={data.finance_health || data.finance_risk?.health || 'healthy'} />
            <Kpi icon={Truck} label="Shipping Health" value={healthLabel(logistics.shipping_health?.health || data.shipping_health)} detail={`${formatNumber(logistics.delayed_shipments)} gecikmis`} tone={logistics.shipping_health?.health || data.shipping_health || 'healthy'} />
            <Kpi icon={AlertTriangle} label="Logistics Risk" value={formatNumber(data.logistics_risk?.score || summary.logistics_risk_score)} detail={healthLabel(data.logistics_health)} tone={data.logistics_health || data.logistics_risk?.health || 'healthy'} />
          </section>

          <section className="executive-command-grid">
            <article className={`executive-risk-center ${summary.system_health}`}>
              <div className="analytics-section-heading">
                <div>
                  <span>Risk command center</span>
                  <h2>Ust seviye risk dagilimi</h2>
                  <p>Risk kaynaklari tenant scorecard sinyallerinden runtime olarak turetilir.</p>
                </div>
              </div>
              <div className="executive-risk-grid">
                <div><strong>{formatNumber(risk.critical_companies)}</strong><span>Critical tenants</span></div>
                <div><strong>{formatNumber(risk.warning_companies)}</strong><span>Warning tenants</span></div>
                <div><strong>{formatNumber(risk.marketplace_risk)}</strong><span>Marketplace risk</span></div>
                <div><strong>{formatNumber(risk.xml_risk)}</strong><span>XML risk</span></div>
                <div><strong>{formatNumber(risk.queue_risk)}</strong><span>Queue risk</span></div>
                <div><strong>{formatNumber(risk.api_risk)}</strong><span>API risk</span></div>
                <div><strong>{formatNumber(risk.webhook_risk)}</strong><span>Webhook risk</span></div>
                <div><strong>{formatNumber(risk.finance_risk)}</strong><span>Finance risk</span></div>
                <div><strong>{formatNumber(risk.logistics_risk)}</strong><span>Logistics risk</span></div>
              </div>
            </article>

            <article className="panel executive-plan-panel">
              <div className="panel-heading">
                <div>
                  <span>SaaS intelligence</span>
                  <h2>Plan ve lisans sagligi</h2>
                </div>
              </div>
              <div className="executive-plan-list">
                {(saas.plan_distribution || []).map((plan) => (
                  <div key={plan.plan}>
                    <strong>{plan.label}</strong>
                    <span>{formatNumber(plan.count)} abonelik</span>
                  </div>
                ))}
              </div>
              <div className="executive-license-strip">
                <div><strong>{formatNumber(saas.subscription_health?.expiring)}</strong><span>Yakinda bitecek</span></div>
                <div><strong>{formatNumber(saas.usage_limit_summary?.limit_risk_companies)}</strong><span>Limit riski</span></div>
                <div><strong>{formatNumber(saas.license_risk?.risk_companies)}</strong><span>Lisans riski</span></div>
              </div>
            </article>
          </section>

          <section className="executive-health-map">
            <HealthTile label="SaaS" data={health.saas_health} />
            <HealthTile label="Marketplace" data={health.marketplace_health} />
            <HealthTile label="XML" data={health.xml_health} />
            <HealthTile label="Operations" data={health.operations_health} />
            <HealthTile label="API" data={health.api_health} />
            <HealthTile label="Webhook" data={health.webhook_health} />
            <HealthTile label="Finance" data={health.finance_health} />
            <HealthTile label="Payment" data={health.payment_health} />
            <HealthTile label="Accounting" data={health.accounting_health} />
            <HealthTile label="Logistics" data={health.logistics_health} />
            <HealthTile label="Shipping" data={health.shipping_health} />
          </section>

          <section className="executive-section">
            <div className="analytics-section-heading">
              <div>
                <span>Tenant scorecards</span>
                <h2>Firma bazli is sagligi</h2>
                <p>En fazla 50 firma risk skoruna gore siralanir. Tenant kullanici sadece kendi firmasini gorur.</p>
              </div>
              <Link className="analytics-action-link" to="/reports">Analytics Center</Link>
            </div>
            <div className="executive-tenant-grid">
              {tenants.length > 0 ? tenants.map((tenant) => <Scorecard tenant={tenant} key={tenant.company_id} />) : (
                <div className="analytics-empty-state">
                  <strong>Tenant bulunamadi</strong>
                  <span>Secili filtreler icin scorecard verisi yok.</span>
                </div>
              )}
            </div>
          </section>

          <section className="executive-section">
            <div className="analytics-section-heading">
              <div>
                <span>Growth signals</span>
                <h2>Buyume ve churn sinyalleri</h2>
                <p>Kullanim, ciro, deneme ve risk sinyalleri uzerinden aksiyon adaylari.</p>
              </div>
            </div>
            <div className="executive-growth-grid">
              <SignalList title="Top revenue" items={growth.top_revenue_companies} valueKey="revenue" formatter={formatMoney} />
              <SignalList title="High usage" items={growth.high_usage_companies} valueKey="usage_rate" formatter={formatPercent} />
              <SignalList title="Upgrade candidates" items={growth.upgrade_candidates} valueKey="usage_rate" formatter={formatPercent} />
              <SignalList title="Trial to paid" items={growth.trial_to_paid_candidates} valueKey="revenue" formatter={formatMoney} />
              <SignalList title="Churn risk" items={growth.churn_risk_companies} valueKey="risk_score" formatter={formatNumber} />
            </div>
          </section>

          <section className="executive-section">
            <div className="analytics-section-heading">
              <div>
                <span>Top risks</span>
                <h2>En kritik aksiyonlar</h2>
              </div>
            </div>
            <div className="executive-risk-list">
              {(data.top_risks || []).length > 0 ? data.top_risks.map((item) => (
                <div className={`executive-risk-row ${item.health}`} key={`${item.company_id}-${item.key}`}>
                  <div>
                    <strong>{item.company_name}</strong>
                    <span>{item.label}</span>
                  </div>
                  <small>{formatNumber(item.value)}</small>
                </div>
              )) : (
                <div className="analytics-empty-state compact">
                  <ShieldCheck size={20} />
                  <strong>Risk sinyali yok</strong>
                  <span>Secili aralikta kritik aksiyon bulunmuyor.</span>
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
