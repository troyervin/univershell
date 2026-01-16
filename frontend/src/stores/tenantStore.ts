import { create } from 'zustand';
import api from '../lib/api';

interface Tenant {
  id: string;
  name: string;
  displayName: string;
  description?: string;
  type: 'ACTIVE_DIRECTORY' | 'MICROSOFT_365' | 'HYBRID';
}

interface TenantState {
  tenants: Tenant[];
  selectedTenant: Tenant | null;
  loading: boolean;
  fetchTenants: () => Promise<void>;
  selectTenant: (tenant: Tenant) => void;
}

export const useTenantStore = create<TenantState>((set) => ({
  tenants: [],
  selectedTenant: null,
  loading: false,

  fetchTenants: async () => {
    set({ loading: true });
    try {
      const response = await api.get('/tenants');
      const tenants = response.data;
      set({ tenants, loading: false });

      // Auto-select first tenant if none selected
      if (tenants.length > 0 && !useTenantStore.getState().selectedTenant) {
        set({ selectedTenant: tenants[0] });
      }
    } catch (error) {
      console.error('Failed to fetch tenants:', error);
      set({ loading: false });
    }
  },

  selectTenant: (tenant: Tenant) => {
    set({ selectedTenant: tenant });
  },
}));
