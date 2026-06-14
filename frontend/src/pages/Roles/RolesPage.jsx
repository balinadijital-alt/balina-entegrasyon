import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, KeyRound, Search, ShieldCheck, SlidersHorizontal, Users } from 'lucide-react';
import { api, asArray } from '../../api/client.js';
import { DataTable } from '../../components/DataTable.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { ReferenceModuleNav } from '../../components/ReferenceModuleNav.jsx';
import { useAsync } from '../../hooks/useAsync.js';

export function RolesPage() {
  const { loading, error, run } = useAsync();
  const [roles, setRoles] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedRoleId, setSelectedRoleId] = useState(null);

  const load = async () => {
    await run(async () => {
      const response = await api.roles.list();
      const rows = asArray(response);
      setRoles(rows);
      setSelectedRoleId((current) => current || rows[0]?.id || rows[0]?.name || null);
    });
  };

  useEffect(() => {
    load();
  }, []);

  const filteredRoles = useMemo(() => roles.filter((role) => {
    const query = search.trim().toLowerCase();
    return !query || [
      role.name,
      role.guard_name,
      ...(role.permissions || []).map((permission) => permission.name),
    ].some((value) => String(value || '').toLowerCase().includes(query));
  }), [roles, search]);

  const selectedRole = useMemo(() => roles.find((role) => (role.id || role.name) === selectedRoleId) || filteredRoles[0] || null, [roles, filteredRoles, selectedRoleId]);
  const permissionCount = roles.reduce((sum, role) => sum + (role.permissions?.length || 0), 0);

  return (
    <>
      <PageHeader title="Rol ve Yetki Yonetimi" />
      <ReferenceModuleNav section="admin" />

      <section className="admin-reference-hero">
        <div>
          <span>Yetki matrisi</span>
          <h2>Kullanicilarin hangi islemleri yapabilecegini net sekilde takip edin.</h2>
          <p>Rolleri arayin, yetki kapsamlarini karsilastirin ve secili rolun izinlerini sag panelden okuyun.</p>
        </div>
      </section>

      <section className="admin-reference-summary">
        <div><ShieldCheck size={20} /><span>Rol sayisi</span><strong>{roles.length}</strong><small>Tanimli yetki grubu</small></div>
        <div><KeyRound size={20} /><span>Yetki atamasi</span><strong>{permissionCount}</strong><small>Rollere bagli izinler</small></div>
        <div><Users size={20} /><span>Gorunen rol</span><strong>{filteredRoles.length}</strong><small>Arama sonucu</small></div>
        <div><CheckCircle2 size={20} /><span>Secili rol</span><strong>{selectedRole ? selectedRole.permissions?.length || 0 : 0}</strong><small>Bu role bagli yetki</small></div>
      </section>

      <section className="admin-reference-filter">
        <div className="admin-reference-filter-title">
          <div>
            <span><SlidersHorizontal size={16} /> Filtreleme</span>
            <strong>Rol veya yetki ara</strong>
          </div>
          <small>Rol adi, guard veya izin adina gore arama yapin.</small>
        </div>
        <div className="admin-reference-filter-grid compact">
          <label className="admin-reference-search">
            <span>Arama</span>
            <div><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rol veya yetki ara" /></div>
          </label>
        </div>
      </section>

      {error && <ErrorState message={error} onRetry={load} />}
      <section className="admin-reference-layout">
        <div className="admin-reference-table">
          {loading && roles.length === 0 ? <LoadingState /> : (
          <DataTable
            rows={filteredRoles}
            emptyTitle="Rol bulunamadi"
            emptyText="Arama filtresini temizleyerek tum rolleri gorebilirsiniz."
            columns={[
              { key: 'name', label: 'Rol', render: (row) => <button type="button" className="admin-row-button" onClick={() => setSelectedRoleId(row.id || row.name)}>{row.name}</button> },
              { key: 'guard_name', label: 'Guard' },
              { key: 'permissions', label: 'Yetki Sayisi', render: (row) => row.permissions?.length || 0 },
            ]}
          />
          )}
        </div>
        <aside className="admin-reference-form">
          <div className="admin-reference-form-title">
            <div>
              <span><KeyRound size={16} /> Secili rol</span>
              <strong>{selectedRole?.name || 'Rol secin'}</strong>
            </div>
            <small>Bu role bagli izinler operasyon ekranlarindaki erisimi belirler.</small>
          </div>
          {selectedRole ? (
            <div className="role-permission-list">
              {(selectedRole.permissions || []).length === 0 ? <span className="muted">Bu role bagli yetki yok.</span> : null}
              {(selectedRole.permissions || []).map((permission) => (
                <span key={permission.id || permission.name}><CheckCircle2 size={14} /> {permission.name}</span>
              ))}
            </div>
          ) : (
            <div className="empty-state compact">Rol detayi icin listeden secim yapin.</div>
          )}
        </aside>
      </section>
    </>
  );
}
