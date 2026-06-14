import { useMemo, useState } from 'react';
import { BookOpen, CheckCircle2, ExternalLink, HelpCircle, Search, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { DetailItem } from '../../components/DetailItem.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { ReferenceModuleNav } from '../../components/ReferenceModuleNav.jsx';
import { SoftEmpty } from '../../components/SoftEmpty.jsx';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import { StatusPill } from '../../components/StatusPill.jsx';
import { featuredHelpArticleIds, helpCenterArticles, helpCenterCategories } from '../../data/helpCenterContent.js';

function badgeTone(type) {
  if (type === 'Sorun çözme') return 'failed';
  if (type === 'Adım adım rehber') return 'running';
  if (type === 'Teknik referans') return 'created';
  return 'active';
}

function difficultyTone(difficulty) {
  if (difficulty === 'İleri') return 'blocked';
  if (difficulty === 'Orta') return 'running';
  return 'ready';
}

function searchableText(article) {
  return [
    article.title,
    article.category,
    article.type,
    article.shortDescription,
    ...(article.tags || []),
    ...(article.content || []),
  ].join(' ').toLowerCase();
}

export function HelpCenterPage() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('Tum konular');
  const [type, setType] = useState('');
  const [selectedId, setSelectedId] = useState(featuredHelpArticleIds[0] || helpCenterArticles[0]?.id);

  const articleTypes = useMemo(() => [...new Set(helpCenterArticles.map((article) => article.type))], []);
  const featuredArticles = useMemo(
    () => featuredHelpArticleIds
      .map((id) => helpCenterArticles.find((article) => article.id === id))
      .filter(Boolean),
    [],
  );

  const filteredArticles = useMemo(() => helpCenterArticles.filter((article) => {
    const query = search.trim().toLowerCase();
    const matchesCategory = category === 'Tum konular' || article.category === category;
    const matchesType = !type || article.type === type;
    const matchesSearch = !query || searchableText(article).includes(query);

    return matchesCategory && matchesType && matchesSearch;
  }), [category, search, type]);

  const selectedArticle = useMemo(
    () => helpCenterArticles.find((article) => article.id === selectedId) || filteredArticles[0] || helpCenterArticles[0],
    [filteredArticles, selectedId],
  );

  const categoryCounts = useMemo(() => helpCenterCategories.reduce((counts, item) => ({
    ...counts,
    [item]: item === 'Tum konular' ? helpCenterArticles.length : helpCenterArticles.filter((article) => article.category === item).length,
  }), {}), []);

  return (
    <>
      <PageHeader
        title="Yardım Merkezi"
        description="Operasyon ekipleri için ürün, pazaryeri, import, sipariş, kargo, ödeme, webhook ve queue rehberleri."
      />
      <ReferenceModuleNav section="resources" />

      <section className="developer-hero panel help-center-hero">
        <div>
          <span className="eyebrow"><HelpCircle size={15} /> Operasyon Yardım Merkezi</span>
          <h2>Eski panel notları ve yeni SaaS operasyon rehberleri tek yerde.</h2>
          <p>Bu alan Developer Center'dan ayrıdır; teknik doküman yerine günlük kullanım, sorun çözme ve kontrollü operasyon adımlarına odaklanır.</p>
        </div>
        <div className="developer-hero-stats">
          <div><strong>{helpCenterArticles.length}</strong><span>yardım içeriği</span></div>
          <div><strong>{helpCenterCategories.length - 1}</strong><span>kategori</span></div>
          <div><strong>{featuredArticles.length}</strong><span>popüler rehber</span></div>
        </div>
      </section>

      <section className="panel resource-filter-panel">
        <div className="resource-search">
          <Search size={18} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Yardım konusu, ekran, hata veya etiket ara" />
        </div>
        <div className="resource-category-tabs">
          {articleTypes.map((item) => (
            <button type="button" className={item === type ? 'active' : ''} onClick={() => setType((current) => (current === item ? '' : item))} key={item}>
              {item}
            </button>
          ))}
        </div>
      </section>

      <section className="help-center-layout">
        <aside className="panel help-category-panel">
          <div className="section-title-row">
            <h2>Kategoriler</h2>
            <StatusBadge tone="created" label="Read-only" />
          </div>
          <div className="help-category-list">
            {helpCenterCategories.map((item) => (
              <button type="button" className={item === category ? 'active' : ''} onClick={() => setCategory(item)} key={item}>
                <span>{item}</span>
                <strong>{categoryCounts[item] || 0}</strong>
              </button>
            ))}
          </div>
        </aside>

        <section className="help-article-column">
          <div className="panel">
            <div className="section-title-row">
              <h2>Popüler içerikler</h2>
              <StatusPill tone="ready" label="Önerilen" />
            </div>
            <div className="help-featured-grid">
              {featuredArticles.map((article) => (
                <button type="button" className={article.id === selectedArticle?.id ? 'help-feature-card active' : 'help-feature-card'} key={article.id} onClick={() => setSelectedId(article.id)}>
                  <BookOpen size={18} />
                  <strong>{article.title}</strong>
                  <span>{article.shortDescription}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="section-title-row">
              <h2>İçerik envanteri</h2>
              <span className="muted-text">{filteredArticles.length} içerik</span>
            </div>
            <div className="help-article-list">
              {filteredArticles.length === 0 ? (
                <SoftEmpty icon={<BookOpen size={24} />} title="İçerik bulunamadı" text="Arama metnini, kategori veya tip filtresini temizleyerek tekrar deneyin." />
              ) : filteredArticles.map((article) => (
                <button type="button" className={article.id === selectedArticle?.id ? 'help-article-row active' : 'help-article-row'} key={article.id} onClick={() => setSelectedId(article.id)}>
                  <span className={`badge ${badgeTone(article.type)}`}>{article.type}</span>
                  <div>
                    <strong>{article.title}</strong>
                    <small>{article.shortDescription}</small>
                  </div>
                  <StatusPill tone={difficultyTone(article.difficulty)} label={article.difficulty} />
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="panel help-detail-panel">
          {selectedArticle ? (
            <>
              <div className="help-detail-heading">
                <div>
                  <span className={`badge ${badgeTone(selectedArticle.type)}`}>{selectedArticle.type}</span>
                  <h2>{selectedArticle.title}</h2>
                  <p>{selectedArticle.shortDescription}</p>
                </div>
                <StatusPill tone={difficultyTone(selectedArticle.difficulty)} label={selectedArticle.difficulty} />
              </div>

              <div className="detail-grid two">
                <DetailItem className="detail-card" label="Kategori" value={selectedArticle.category} />
                <DetailItem className="detail-card" label="Güncelleme" value={selectedArticle.updatedAt} />
              </div>

              <div className="help-content-block">
                {selectedArticle.content.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              </div>

              <div className="help-tag-list">
                {selectedArticle.tags.map((tag) => <span key={tag}>#{tag}</span>)}
              </div>

              <div className="help-related-section">
                <h3>İlgili ekranlar</h3>
                <div className="resource-links">
                  {selectedArticle.relatedLinks.map((link) => (
                    <Link to={link.href} key={link.href}>{link.label} <ExternalLink size={14} /></Link>
                  ))}
                </div>
              </div>

              <div className="help-related-section">
                <h3>Route referansları</h3>
                <div className="help-route-list">
                  {selectedArticle.relatedScreens.map((screen) => <code key={screen}>{screen}</code>)}
                </div>
              </div>

              <div className="soft-empty help-feedback-box">
                <CheckCircle2 size={20} />
                <strong>Bu içerik yardımcı oldu mu?</strong>
                <span>Bu ilk sürüm read-only çalışır; geri bildirim akışı ileride CMS veya destek modülüne bağlanabilir.</span>
              </div>
            </>
          ) : (
            <SoftEmpty icon={<BookOpen size={24} />} title="İçerik seçilmedi" text="Soldaki listeden bir yardım içeriği seçin." />
          )}
        </section>
      </section>
    </>
  );
}
