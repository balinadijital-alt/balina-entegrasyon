import { useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { DataTable } from '../../components/DataTable.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';

export function RolesPage() {
  const [roles, setRoles] = useState([]);

  useEffect(() => {
    api('/roles').then(setRoles);
  }, []);

  return (
    <>
      <PageHeader title="Rol ve Yetki Yonetimi" />
      <DataTable
        rows={roles}
        columns={[
          { key: 'name', label: 'Rol' },
          { key: 'guard_name', label: 'Guard' },
          { key: 'permissions', label: 'Yetkiler', render: (row) => row.permissions?.map((permission) => permission.name).join(', ') },
        ]}
      />
    </>
  );
}
