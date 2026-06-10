import { useMemo, useState } from 'react';
import { Activity, BookOpen, CheckCircle2, ExternalLink, FileCode2, GitBranch, Link2, Search, ServerCog, Workflow } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader.jsx';
import { apiKnowledgeFoundations, apiKnowledgeProviders, trendyolKnowledgeTopics } from '../../data/apiKnowledgeContent.js';

function badgeTone(value) {
  if (value === 'Tam matris') return 'ready';
  if (value === 'Foundation') return 'created';
  return 'active';
}

function MethodList({ title, items }) {
  return (
    <section className="api-doc-section">
      <h3>{title}</h3>
      <div className="api-chip-list">
        {items.map((item) => <code key={item}>{item}</code>)}
      </div>
    </section>
  );
}

function ImpactList({ icon: Icon, title, items }) {
  return (
    <div className="api-impact-card">
      <div>
        <Icon size={17} />
        <strong>{title}</strong>
      </div>
      <ul>
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </div>
  );
}

function FoundationPanel({ provider }) {
  return (
    <section className="api-foundation-panel panel">
      <span className="eyebrow"><BookOpen size={15} /> Foundation</span>
      <h2>{provider.title}</h2>
      <p>{provider.summary}</p>
      <div className="api-route-list">
        {provider.screens.map((screen) => <Link to={screen} key={screen}>{screen}</Link>)}
      </div>
    </section>
  );
}

export function ApiKnowledgeCenterPage() {
  const [provider, setProvider] = useState('trendyol');
  const [topicId, setTopicId] = useState('products');
  const [search, setSearch] = useState('');

  const filteredTopics = useMemo(() => trendyolKnowledgeTopics.filter((topic) => {
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return [
      topic.title,
      topic.summary,
      ...topic.externalEndpoints,
      ...topic.backendServices,
      ...topic.apiEndpoints,
      ...topic.frontendScreens,
      ...topic.usedIn,
      ...topic.affects,
    ].join(' ').toLowerCase().includes(query);
  }), [search]);

  const selectedTopic = useMemo(
    () => filteredTopics.find((topic) => topic.id === topicId) || filteredTopics[0] || trendyolKnowledgeTopics[0],
    [filteredTopics, topicId],
  );
  const selectedProvider = apiKnowledgeProviders.find((item) => item.key === provider);
  const foundation = apiKnowledgeFoundations[provider];

  return (
    <>
      <PageHeader
        title="API Knowledge Center"
        description="Provider endpointleri, sistemde kullanildiklari ekranlar, queue iliskileri ve readiness etkileri icin teknik bilgi merkezi."
        actions={<Link className="button-link secondary-link" to="/help-center"><BookOpen size={16} /> Yardim Merkezi</Link>}
      />

      <section className="api-knowledge-hero panel">
        <div>
          <span className="eyebrow"><ServerCog size={15} /> Developer Hub</span>
          <h2>Endpointten ekrana kadar izlenebilir entegrasyon haritasi.</h2>
          <p>Bu merkez bilgi amaclidir; provider cagrisi yapmaz, backend is mantigini degistirmez ve operasyon yardim merkezinden ayri calisir.</p>
        </div>
        <div className="developer-hero-stats">
          <div><strong>{trendyolKnowledgeTopics.length}</strong><span>Trendyol konu</span></div>
          <div><strong>8</strong><span>provider sekmesi</span></div>
          <div><strong>0</strong><span>canli provider cagrisi</span></div>
        </div>
      </section>

      <section className="api-provider-tabs panel">
        {apiKnowledgeProviders.map((item) => (
          <button
            type="button"
            className={item.key === provider ? 'active' : ''}
            key={item.key}
            onClick={() => {
              setProvider(item.key);
              setTopicId('products');
            }}
          >
            <span>{item.label}</span>
            <small className={`badge ${badgeTone(item.status)}`}>{item.status}</small>
          </button>
        ))}
      </section>

      {provider !== 'trendyol' ? (
        <FoundationPanel provider={foundation} />
      ) : (
        <section className="api-knowledge-layout">
          <aside className="panel api-doc-nav">
            <label className="resource-search compact-search">
              <Search size={16} />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Endpoint, servis veya ekran ara" />
            </label>
            <div className="api-topic-list">
              {filteredTopics.map((topic) => (
                <button type="button" className={topic.id === selectedTopic?.id ? 'active' : ''} onClick={() => setTopicId(topic.id)} key={topic.id}>
                  <strong>{topic.title}</strong>
                  <span>{topic.externalEndpoints.length} endpoint</span>
                </button>
              ))}
            </div>
          </aside>

          <main className="panel api-doc-content">
            <div className="api-doc-heading">
              <span className="badge ready">Trendyol</span>
              <h2>{selectedTopic.title}</h2>
              <p>{selectedTopic.summary}</p>
            </div>

            <MethodList title="Kullanilan dis endpointler" items={selectedTopic.externalEndpoints} />
            <MethodList title="Backend service / kaynak" items={selectedTopic.backendServices} />
            <MethodList title="Balina API endpointleri" items={selectedTopic.apiEndpoints} />
            <MethodList title="Frontend ekranlari" items={selectedTopic.frontendScreens} />

            <section className="api-doc-section">
              <h3>Tipik hata kodlari</h3>
              <div className="api-error-grid">
                {selectedTopic.errors.map((error) => <span key={error}>{error}</span>)}
              </div>
            </section>

            <section className="api-doc-section">
              <h3>Rate limit bilgisi</h3>
              <p className="api-note">{selectedTopic.rateLimit}</p>
            </section>

            <section className="api-doc-section">
              <h3>Resmi dokumanlar</h3>
              <div className="resource-links">
                {selectedTopic.docs.map((doc) => <a href={doc.href} key={doc.href} target="_blank" rel="noreferrer">{doc.label} <ExternalLink size={14} /></a>)}
              </div>
            </section>
          </main>

          <aside className="panel api-info-panel">
            <ImpactList icon={Link2} title="Bu endpoint projede nerede kullaniliyor?" items={selectedTopic.usedIn} />
            <ImpactList icon={Activity} title="Bu alan hangi ekrani etkiliyor?" items={selectedTopic.affects} />
            <ImpactList icon={Workflow} title="Queue / sync iliskisi" items={selectedTopic.queueRelations} />
            <ImpactList icon={CheckCircle2} title="Readiness etkisi" items={selectedTopic.readinessImpact} />

            <div className="api-impact-card">
              <div>
                <GitBranch size={17} />
                <strong>Ilgili ekranlara git</strong>
              </div>
              <div className="api-route-list">
                {selectedTopic.frontendScreens.map((screen) => <Link to={screen} key={screen}>{screen}</Link>)}
              </div>
            </div>

            <div className="api-impact-card">
              <div>
                <FileCode2 size={17} />
                <strong>Kaynak notu</strong>
              </div>
              <p>Bu sayfa statik bilgi merkezidir. Provider API cagrisi, payload degisikligi veya backend is mantigi eklemez.</p>
            </div>
          </aside>
        </section>
      )}
    </>
  );
}
