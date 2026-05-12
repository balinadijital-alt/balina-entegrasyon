import { ExternalLink } from 'lucide-react';

export function ResourceCard({ resource }) {
  const Icon = resource.icon;

  return (
    <article className="resource-card">
      <div className="resource-card-head">
        <span className="resource-icon"><Icon size={19} /></span>
        <span className={`badge ${resource.statusTone}`}>{resource.status}</span>
      </div>
      <div>
        <strong>{resource.title}</strong>
        <p>{resource.description}</p>
      </div>
      <div className="resource-meta">
        <span>{resource.category}</span>
        <span>{resource.environment}</span>
      </div>
      <div className="resource-links">
        {resource.links.map((link) => (
          <a href={link.href} target="_blank" rel="noreferrer" key={link.href}>
            {link.label} <ExternalLink size={14} />
          </a>
        ))}
      </div>
    </article>
  );
}
