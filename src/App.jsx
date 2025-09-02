import { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabaseClient';
import { Auth } from '@supabase/auth-ui-react';

import 'chart.js/auto';
import { Pie } from 'react-chartjs-2';

const TABLE = 'teslimatlar';
const MODE = import.meta.env.VITE_MODE || 'public';
const IS_PUBLIC = MODE === 'public';

function isDelivered(value) {
  if (!value) return false;
  return value.toString().toLowerCase().includes('teslim');
}

export default function App() {
  const [units, setUnits] = useState([]);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session || null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess || null);
    });
    return () => sub?.subscription?.unsubscribe();
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.from(TABLE).select('*');
      if (!error) setUnits(data || []);
      setLoading(false);
    })();
  }, []);

  if (!IS_PUBLIC && !session) {
    return (
      <div style={{ maxWidth: 420, margin: '60px auto', color: '#E6ECFF' }}>
        <h2 style={{ textAlign: 'center', marginBottom: 16 }}>Admin Giriş</h2>
        <div style={{ background:'#0B1020', border:'1px solid rgba(255,255,255,0.1)', borderRadius:12, padding:16 }}>
          <Auth supabaseClient={supabase} providers={[]} />
        </div>
      </div>
    );
  }

  const report = useMemo(() => {
    const total = units.length;
    const delivered = units.filter(u => isDelivered(u.durum)).length;
    const remaining = total - delivered;
    const pct = total ? Math.round((delivered / total) * 100) : 0;
    return { total, delivered, remaining, pct };
  }, [units]);

  const pieData = report ? {
    labels: ['Teslim', 'Kalan'],
    datasets: [{
      data:[report.delivered, report.remaining],
      backgroundColor:['#34D399','#FCA5A5']
    }]
  } : null;

  return (
    <div style={{ padding:20, background:'#0B1020', color:'#E6ECFF', minHeight:'100vh' }}>
      <h1>Teslim Paneli ({IS_PUBLIC ? 'Public' : 'Admin'})</h1>
      {report && (
        <div>
          <p>Toplam: {report.total}</p>
          <p>Teslim: {report.delivered}</p>
          <p>Kalan: {report.remaining}</p>
          <p>Tamamlanma: %{report.pct}</p>
        </div>
      )}
      {pieData && <Pie data={pieData} />}
      {loading && <p>Yükleniyor…</p>}
      <ul>
        {units.map(u => (
          <li key={u.id}>{u.blok} {u.no} — {u.durum}</li>
        ))}
      </ul>
    </div>
  );
}
