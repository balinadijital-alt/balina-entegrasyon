import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';

export function CredentialInput({ value, onChange, placeholder }) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="credential-input">
      <input type={visible ? 'text' : 'password'} value={value} onChange={onChange} placeholder={placeholder} autoComplete="new-password" />
      <button type="button" className="icon-button" onClick={() => setVisible((current) => !current)} aria-label={visible ? 'Gizle' : 'Goster'}>
        {visible ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </div>
  );
}
