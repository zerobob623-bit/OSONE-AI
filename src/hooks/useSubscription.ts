import { useCallback, useEffect, useState } from 'react';
import { auth } from '../firebase';
import { BillingInterval, OsonePlanId, PaidFeature, planHasFeature } from '../lib/planos';
import type { User } from '../types';

export interface SubscriptionSnapshot {
  plan: OsonePlanId;
  status: 'free' | 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid' | 'incomplete' | 'incomplete_expired' | 'paused';
  currentPeriodEnd: string | null;
  billingEnabled: boolean;
  configurationMissing?: string[];
}

const FREE_SNAPSHOT: SubscriptionSnapshot = {
  plan: 'free',
  status: 'free',
  currentPeriodEnd: null,
  billingEnabled: false
};

const baseUrl = String(import.meta.env.VITE_OSONE_BILLING_URL || '').replace(/\/$/, '');

async function firebaseToken(): Promise<string> {
  const firebaseUser = auth?.currentUser;
  if (!firebaseUser?.getIdToken) throw new Error('Entre com sua conta Google para assinar ou restaurar seu plano.');
  return firebaseUser.getIdToken();
}

export function useSubscription(user: User | null) {
  const [subscription, setSubscription] = useState<SubscriptionSnapshot>(FREE_SNAPSHOT);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const request = useCallback(async (path: string, init?: RequestInit) => {
    const token = await firebaseToken();
    const response = await fetch(`${baseUrl}/api/billing${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(init?.headers || {})
      }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Falha na cobrança (HTTP ${response.status}).`);
    return data;
  }, []);

  const refresh = useCallback(async () => {
    if (!user || user.isLocal || !auth?.currentUser) {
      setSubscription(FREE_SNAPSHOT);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await request('/status');
      setSubscription({ ...FREE_SNAPSHOT, ...data });
    } catch (err: any) {
      setSubscription(FREE_SNAPSHOT);
      setError(err?.message || 'Não foi possível consultar a assinatura.');
    } finally {
      setLoading(false);
    }
  }, [request, user]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh]);

  const openCheckout = useCallback(async (plan: Exclude<OsonePlanId, 'free'>, interval: BillingInterval) => {
    setLoading(true);
    setError('');
    try {
      const data = await request('/checkout', {
        method: 'POST',
        body: JSON.stringify({ plan, interval })
      });
      const popup = window.open(data.url, '_blank');
      if (!popup) throw new Error('O navegador bloqueou a página de pagamento. Libere pop-ups e tente novamente.');
      popup.opener = null;
    } catch (err: any) {
      setError(err?.message || 'Não foi possível abrir o pagamento.');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [request]);

  const openPortal = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await request('/portal', { method: 'POST', body: '{}' });
      const popup = window.open(data.url, '_blank');
      if (!popup) throw new Error('O navegador bloqueou o portal. Libere pop-ups e tente novamente.');
      popup.opener = null;
    } catch (err: any) {
      setError(err?.message || 'Não foi possível abrir o portal da assinatura.');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [request]);

  const hasFeature = useCallback(
    (feature: PaidFeature) => planHasFeature(subscription.plan, feature) && ['active', 'trialing', 'past_due'].includes(subscription.status),
    [subscription]
  );

  return { subscription, loading, error, refresh, openCheckout, openPortal, hasFeature };
}
