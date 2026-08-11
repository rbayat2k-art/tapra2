import { useState } from 'react';
import { CustomersView } from '../../components/CustomersView';
import type { Customer, User } from '../../types';
import { SaasCustomerWorkspace } from './SaasCustomerWorkspace';

interface CustomerSourceViewProps {
  customers: Customer[];
  users: User[];
  currentUser: User;
  onUpdateCustomers(customers: Customer[]): void;
}

export function CustomerSourceView(props: CustomerSourceViewProps) {
  const [source, setSource] = useState<'saas' | 'prototype'>('saas');
  return (
    <div className="space-y-4">
      <nav aria-label="منبع داده مشتریان" className="inline-flex rounded-xl border border-slate-700 bg-slate-900 p-1 text-xs dir-rtl">
        <button onClick={() => setSource('saas')} className={`rounded-lg px-3 py-2 font-bold ${source === 'saas' ? 'bg-emerald-600 text-white' : 'text-slate-400'}`}>SaaS / PostgreSQL</button>
        <button onClick={() => setSource('prototype')} className={`rounded-lg px-3 py-2 font-bold ${source === 'prototype' ? 'bg-amber-600 text-white' : 'text-slate-400'}`}>Prototype / localStorage</button>
      </nav>
      {source === 'saas' ? <SaasCustomerWorkspace /> : <CustomersView {...props} />}
    </div>
  );
}
