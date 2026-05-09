import { useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { DataTable } from '../../components/DataTable.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { useAsync } from '../../hooks/useAsync.js';

export function RolesPage() {
  const { loading, error, run } = useAsync();
  const [roles, setRoles] = useState([]);

  const load = async () => {
    await run(async () => {
      setRoles(await api.roles.list());
    });
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <>
      <PageHeader title="Rol ve Yetki Yonetimi" />
      {error && <ErrorState message={error} onRetry={load} />}
      {loading && roles.length === 0 ? <LoadingState /> : (
      <DataTable
        rows={roles}
        columns={[
          { key: 'name', label: 'Rol' },
          { key: 'guard_name', label: 'Guard' },
          { key: 'permissions', label: 'Yetkiler', render: (row) => row.permissions?.map((permission) => permission.name).join(', ') },
        ]}
      />
      )}
    </>
  );
}
