
import { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabaseClient';

// Grafikler
import 'chart.js/auto';
import { Chart as ChartJS } from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import { Pie } from 'react-chartjs-2';
ChartJS.register(ChartDataLabels);

// Tablo adı (.env ile override edebilirsin)
const TABLE = import.meta.env.VITE_TABLE_NAME || 'teslimatlar';

const CANDIDATES = {
  id: ['id', 'unit_id', 'uuid'],
  label: ['daire_no', 'daire', 'no', 'label', 'adi', 'ad', 'bagimsiz_bolum', 'bb_no'],
  blok: ['blok', 'blok_no', 'block', 'block_no', 'blok_adi', 'blokadi'],
  malik: ['malik', 'mâlik', 'malık', 'MALİK'],
  musteri: ['musteri', 'müşteri', 'MÜŞTERİ', 'musteri_adi', 'musteri_ad'],
  durum: ['durum', 'status'],
  aciklama: ['aciklama', 'açıklama', 'AÇIKLAMA', 'not', 'aciklama_not'],
  randevuTarih: ['randevu_tarihi', 'randevu', 'randevu_date', 'tarih', 'date'],
  randevuSaat: ['randevu_saati', 'randevu_saat', 'saat', 'time'],
  tip: ['tip', 'kategori', 'tur', 'type'], // Konut/Ticari
  updatedAt: ['updated_at', 'guncellendi', 'guncelleme_tarihi'],
  proje: ['proje', 'project', 'project_name', 'proje_adi', 'pars_no', 'parsel', 'site', 'site_adi'], // Proje/Parsel
};

function findCol(row, names) {
  const keys = Object.keys(row || {});
  for (const n of names) {
    const hit = keys.find((k) => k.toLowerCase() === n.toLowerCase());
    if (hit) return hit;
  }
  return null;
}
function detectCols(sample) {
  return {
    id: findCol(sample, CANDIDATES.id) || 'id',
    label: findCol(sample, CANDIDATES.label) || findCol(sample, CANDIDATES.id) || 'id',
    blok: findCol(sample, CANDIDATES.blok),
    malik: findCol(sample, CANDIDATES.malik),
    musteri: findCol(sample, CANDIDATES.musteri),
    durum: findCol(sample, CANDIDATES.durum),
    aciklama: findCol(sample, CANDIDATES.aciklama),
    randevuTarih: findCol(sample, CANDIDATES.randevuTarih),
    randevuSaat: findCol(sample, CANDIDATES.randevuSaat),
    tip: findCol(sample, CANDIDATES.tip),
    updatedAt: findCol(sample, CANDIDATES.updatedAt),
    proje: findCol(sample, CANDIDATES.proje),
  };
}

// Etiket: yalnızca blok + no (proje gizli)
function composeLabel(row, cols) {
  if (!cols) return '';
  const unitStr = (row?.[cols.label] ?? '').toString().trim();
  const blokStr = cols.blok ? (row?.[cols.blok] ?? '').toString().trim() : '';
  let label = '';
  if (blokStr && unitStr) label = `${blokStr} ${unitStr}`;
  else if (blokStr) label = blokStr;
  else if (unitStr) label = unitStr;
  if (!label) return `#${row?.[cols.id] ?? ''}`;
  return label.trim();
}

// Proje kökü: "2115/1" -> "2115", "2116-2" -> "2116", yoksa "—"
function getProjectRoot(val) {
  const s = (val ?? '').toString().trim();
  if (!s) return '—';
  const bySlash = s.split('/')[0].trim();
  const m = bySlash.match(/^(\d{4})/);
  return (m ? m[1] : bySlash) || '—';
}

// İSTENEN BAŞLIK EŞLEME: 2115 => 2115/1, 2116 => 2116/2
const ROOT_LABEL_MAP = {
  '2115': '2115/1',
  '2116': '2116/2',
};

// Sıralama: proje → blok → no
function sortUnits(units, cols) {
  if (!cols) return units ?? [];
  return [...(units ?? [])].sort((a, b) => {
    if (cols.proje) {
      const pA = getProjectRoot(a[cols.proje] ?? '');
      const pB = getProjectRoot(b[cols.proje] ?? '');
      const cP = pA.localeCompare(pB, undefined, { numeric: true, sensitivity: 'base' });
      if (cP !== 0) return cP;
    }
    const blokA = (a[cols.blok] ?? '').toString();
    const blokB = (b[cols.blok] ?? '').toString();
    const cB = blokA.localeCompare(blokB, undefined, { sensitivity: 'base' });
    if (cB !== 0) return cB;

    const noAraw = (a[cols.label] ?? '').toString().trim();
    const noBraw = (b[cols.label] ?? '').toString().trim();
    const noA = parseInt(noAraw, 10);
    const noB = parseInt(noBraw, 10);
    if (!Number.isNaN(noA) && !Number.isNaN(noB)) return noA - noB;
    return noAraw.localeCompare(noBraw, undefined, { numeric: true, sensitivity: 'base' });
  });
}

function pad2(n) { return String(n).padStart(2, '0'); }
function normalizeDateInput(val) {
  if (!val) return '';
  try {
    if (typeof val === 'string') return val.slice(0, 10);
    if (val instanceof Date) {
      const y = val.getFullYear(); const m = pad2(val.getMonth() + 1); const d = pad2(val.getDate());
      return `${y}-${m}-${d}`;
    }
  } catch {}
  return '';
}
function normalizeTimeInput(val) {
  if (!val) return '';
  if (typeof val === 'string') {
    const hhmm = val.split(':').slice(0, 2).join(':');
    return hhmm || '';
  }
  return '';
}

/* Takvim yardımcıları */
const TR_DAY_SHORT = ['Paz', 'Pts', 'Sal', 'Çar', 'Per', 'Cum', 'Cts'];
function startOfDay(d) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function ymd(d) { return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
function getWeekDays(weekStart) {
  const start = startOfWeek(weekStart);
  return Array.from({ length: 7 }, (_, i) => {
    const dt = addDays(start, i);
    return { date: dt, key: ymd(dt), label: `${TR_DAY_SHORT[dt.getDay()]} ${pad2(dt.getDate())}.${pad2(dt.getMonth()+1)}` };
  });
}
function timeToMinutes(timeStr) {
  if (!timeStr) return Number.POSITIVE_INFINITY;
  const [h, m] = timeStr.split(':').map((s) => parseInt(s, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return Number.POSITIVE_INFINITY;
  return h * 60 + m;
}
function startOfWeek(d) {
  const dt = startOfDay(d);
  const day = dt.getDay(); // 0 Pazar..6 Cumartesi
  const diff = (day === 0 ? -6 : 1 - day); // Pazartesi başlangıç
  const monday = new Date(dt);
  monday.setDate(dt.getDate() + diff);
  return startOfDay(monday);
}

/* Kurala göre Tip (Konut/Ticari) türetici
   Ticari: B 37–43, C 1–10, '-' 33–39; diğerleri Konut */
function deriveTipFromRule(blokVal, noVal) {
  const blok = (blokVal ?? '').toString().trim();
  const no = parseInt((noVal ?? '').toString().trim(), 10);
  if (Number.isNaN(no)) return 'Konut';
  if (blok === 'B' && no >= 37 && no <= 43) return 'Ticari';
  if (blok === 'C' && no >= 1 && no <= 10) return 'Ticari';
  if (blok === '-' && no >= 33 && no <= 39) return 'Ticari';
  return 'Konut';
}

function isDelivered(value) {
  if (!value) return false;
  const s = value.toString().toLowerCase();
  return s.includes('teslim');
}
function inRange(dateStr, fromYmd, toYmd) {
  if (!dateStr) return false;
  const d = dateStr.slice(0,10);
  return d >= fromYmd && d <= toYmd;
}

// --- Yüzdeli, büyük ve ortalanmış pie ---
function DeliveredPie({ title, delivered, total }) {
  const remaining = Math.max(0, (total || 0) - (delivered || 0));
  const data = useMemo(() => ({
    labels: ['Teslim', 'Kalan'],
    datasets: [{
      data: [delivered || 0, remaining],
      backgroundColor: ['#16a34a', '#f97316'],   // Yeşil (Teslim) & Turuncu (Kalan)
      borderColor: ['#166534', '#ea580c'],
      borderWidth: 2,
    }],
  }), [delivered, remaining]);

  const options = useMemo(() => ({
    responsive: true,
    plugins: {
      legend: { position: 'bottom', labels: { color: '#E6ECFF', font: { size: 14 } } },
      title: { display: false }, // Chart.js başlığını kapat -> çift başlık sorunu çözülür
      datalabels: {
        color: '#ffffff',
        font: { weight: 'bold', size: 14 },
        formatter: (value, context) => {
          const ds = context.chart.data.datasets[0].data;
          const sum = ds.reduce((a, b) => Number(a) + Number(b), 0);
          if (!sum) return '0%';
          const pct = (value / sum) * 100;
          return `${pct.toFixed(1)}%`;
        },
        anchor: 'center',
        align: 'center',
        textStrokeColor: '#000',
        textStrokeWidth: 2,
        clamp: true,
      },
    },
  }), [title]);

  return (
    <div style={styles.tipItem}>
      <div style={{ ...styles.tipTitle, fontSize: 18, textAlign: 'center' }}>{title}</div>
      <div style={styles.centeredPieWrap}>
        <Pie data={data} options={options} />
      </div>
      <div style={styles.tipRow}><span>Toplam:</span><b>{total || 0}</b></div>
      <div style={styles.tipRow}><span>Teslim:</span><b>{delivered || 0}</b></div>
      <div style={styles.tipRow}><span>Kalan:</span><b>{remaining}</b></div>
    </div>
  );
}

export default function App() {
  const [units, setUnits] = useState([]);
  const [cols, setCols] = useState(null);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState(null);

  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);
  const [saveErr, setSaveErr] = useState(null);

  // ---- Haftalık gezinme: state + butonlar ----
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [agenda, setAgenda] = useState({ days: getWeekDays(weekStart), itemsByDay: {} });
  const [agendaLoading, setAgendaLoading] = useState(false);
  const [agendaError, setAgendaError] = useState(null);

  // ---- Mini Admin (Auth) state'leri ----
  const [isAdmin, setIsAdmin] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPass, setAuthPass] = useState('');
  const [authErr, setAuthErr] = useState(null);
  const [authLoading, setAuthLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setIsAdmin(!!data?.session);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAdmin(!!session);
    });
    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  async function handleLogin(e) {
    e?.preventDefault?.();
    setAuthErr(null);
    setAuthLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: authEmail.trim(),
      password: authPass,
    });
    setAuthLoading(false);
    if (error) setAuthErr(error.message);
    else setAuthOpen(false);
  }
  async function handleLogout() {
    await supabase.auth.signOut();
    setAuthOpen(false);
  }

  // İlk yükleme
  useEffect(() => {
    let ignore = false;
    (async () => {
      setLoadingList(true);
      setListError(null);

      const sampleRes = await supabase.from(TABLE).select('*').limit(1);
      if (ignore) return;

      if (sampleRes.error) {
        setListError(sampleRes.error.message);
        setUnits([]);
        setLoadingList(false);
        return;
      }

      let detected = null;
      if ((sampleRes.data || []).length > 0) {
        detected = detectCols(sampleRes.data[0]);
        setCols(detected);
      }

      const { data, error } = await supabase.from(TABLE).select('*');
      if (ignore) return;

      if (error) {
        setListError(error.message);
        setUnits([]);
      } else {
        const currentCols = detected ?? ((data || []).length ? detectCols(data[0]) : null);
        if (currentCols) setCols(currentCols);
        const sorted = currentCols ? sortUnits(data || [], currentCols) : (data || []);
        setUnits(sorted);
        if (sorted.length > 0 && currentCols) setSelectedId(sorted[0][currentCols.id]);
      }
      setLoadingList(false);
    })();
    return () => { ignore = true; };
  }, []);

  // Seçili kaydın detayını çek
  useEffect(() => {
    if (!selectedId || !cols) { setDetail(null); return; }
    let ignore = false;
    (async () => {
      setDetailLoading(true);
      const { data, error } = await supabase
        .from(TABLE)
        .select('*')
        .eq(cols.id, selectedId)
        .single();
      if (ignore) return;
      if (error) {
        setDetail(null);
      } else {
        const base = {
          [cols.id]: data[cols.id],
          ...(cols.proje ? { [cols.proje]: data[cols.proje] ?? '' } : {}),
          ...(cols.blok ? { [cols.blok]: data[cols.blok] ?? '' } : {}),
          ...(cols.label ? { [cols.label]: data[cols.label] ?? '' } : {}),
          ...(cols.malik ? { [cols.malik]: data[cols.malik] ?? '' } : {}),
          ...(cols.musteri ? { [cols.musteri]: data[cols.musteri] ?? '' } : {}),
          ...(cols.durum ? { [cols.durum]: data[cols.durum] ?? '' } : {}),
          ...(cols.aciklama ? { [cols.aciklama]: data[cols.aciklama] ?? '' } : {}),
          ...(cols.randevuTarih ? { [cols.randevuTarih]: normalizeDateInput(data[cols.randevuTarih]) } : {}),
          ...(cols.randevuSaat ? { [cols.randevuSaat]: normalizeTimeInput(data[cols.randevuSaat]) } : {}),
        };
        if (cols.tip) base[cols.tip] = data[cols.tip] ?? '';
        else if (cols.blok && cols.label) base.__tipDerived = deriveTipFromRule(base[cols.blok], base[cols.label]);
        setDetail(base);
      }
      setDetailLoading(false);
    })();
    return () => { ignore = true; };
  }, [selectedId, cols]);

  // Haftalık takvim (gezilebilir)
  useEffect(() => {
    if (!cols || !cols.randevuTarih) return;
    let ignore = false;
    (async () => {
      setAgendaLoading(true);
      setAgendaError(null);
      const days = getWeekDays(weekStart);
      const from = days[0].key;
      const to = days[days.length - 1].key;

      const { data, error } = await supabase
        .from(TABLE)
        .select('*')
        .gte(cols.randevuTarih, from)
        .lte(cols.randevuTarih, to);

      if (ignore) return;
      if (error) {
        setAgenda({ days, itemsByDay: {} });
        setAgendaError(error.message);
      } else {
        const itemsByDay = {};
        for (const d of days) itemsByDay[d.key] = [];
        for (const row of data || []) {
          const dateKey = normalizeDateInput(row[cols.randevuTarih]);
          if (!dateKey || !(dateKey in itemsByDay)) continue;
          itemsByDay[dateKey].push({
            id: row[cols.id],
            label: composeLabel(row, cols),
            saat: cols.randevuSaat ? normalizeTimeInput(row[cols.randevuSaat]) : '',
            musteri: cols.musteri ? (row[cols.musteri] ?? '') : '',
            durum: cols.durum ? (row[cols.durum] ?? '') : '',
            tip: cols.tip ? (row[cols.tip] ?? '') : (cols.blok && cols.label ? deriveTipFromRule(row[cols.blok], row[cols.label]) : ''),
            proje: cols.proje ? (row[cols.proje] ?? '') : '',
          });
        }
        for (const key of Object.keys(itemsByDay)) {
          itemsByDay[key].sort((a, b) => timeToMinutes(a.saat) - timeToMinutes(b.saat));
        }
        setAgenda({ days, itemsByDay });
      }
      setAgendaLoading(false);
    })();
    return () => { ignore = true; };
  }, [cols, units.length, saveMsg, weekStart]);

  const handleChange = (key, val) => setDetail((d) => ({ ...d, [key]: val }));

  // Kayıt kaydetme (misafir: sadece Durum; admin: tüm alanlar)
  const handleSave = async () => {
    if (!detail || !cols) return;
    setSaveLoading(true);
    setSaveErr(null);
    setSaveMsg(null);

    const payload = {};
    if (isAdmin) {
      if (cols.proje) payload[cols.proje] = (detail[cols.proje] ?? '').toString().trim() || null;
      if (cols.blok) payload[cols.blok] = (detail[cols.blok] ?? '').toString().trim() || null;
      if (cols.label) payload[cols.label] = (detail[cols.label] ?? '').toString().trim() || null;
      if (cols.malik) payload[cols.malik] = (detail[cols.malik] ?? '').trim() || null;
      if (cols.musteri) payload[cols.musteri] = (detail[cols.musteri] ?? '').trim() || null;
      if (cols.durum) payload[cols.durum] = (detail[cols.durum] ?? '').trim() || null;
      if (cols.aciklama) payload[cols.aciklama] = (detail[cols.aciklama] ?? '').trim() || null;
      if (cols.randevuTarih) payload[cols.randevuTarih] = detail[cols.randevuTarih] || null;
      if (cols.randevuSaat) payload[cols.randevuSaat] = detail[cols.randevuSaat] || null;
      if (cols.tip) payload[cols.tip] = (detail[cols.tip] ?? '').toString().trim() || null;
    } else {
      if (cols.durum) payload[cols.durum] = (detail[cols.durum] ?? '').trim() || null;
    }
    if (cols.updatedAt) payload[cols.updatedAt] = new Date().toISOString();

    const { error } = await supabase.from(TABLE).update(payload).eq(cols.id, detail[cols.id]);
    if (error) setSaveErr(error.message);
    else {
      setSaveMsg('Kaydedildi.');
      await refreshList();
    }
    setSaveLoading(false);
  };

  const refreshList = async () => {
    const { data } = await supabase.from(TABLE).select('*');
    const sorted = cols ? sortUnits(data || [], cols) : (data || []);
    setUnits(sorted);
  };

  // Rapor: genel + tip + (Proje kökü → Malik grubu → Toplam)
  const report = useMemo(() => {
    if (!cols) return null;
    const total = units.length;

    // Durum kırılımı
    const statusCounts = {};
    for (const u of units) {
      const v = cols.durum ? (u[cols.durum] ?? '—') : '—';
      const key = (v || '—').toString();
      statusCounts[key] = (statusCounts[key] || 0) + 1;
    }

    // Teslim sayısı
    const delivered = units.reduce((acc, u) => acc + (isDelivered(cols?.durum ? u[cols.durum] : null) ? 1 : 0), 0);
    const remaining = Math.max(total - delivered, 0);
    const pct = total > 0 ? Math.round((delivered / total) * 100) : 0;

    // Tip tespiti (kolon yoksa kural)
    const tipGetter = (u) => {
      if (cols.tip) return (u[cols.tip] ?? '').toString().trim() || deriveTipFromRule(cols.blok ? u[cols.blok] : '', cols.label ? u[cols.label] : '');
      return deriveTipFromRule(cols.blok ? u[cols.blok] : '', cols.label ? u[cols.label] : '');
    };

    // Konut/Ticari üst toplamları
    const tipGroups = { Konut: { total: 0, delivered: 0 }, Ticari: { total: 0, delivered: 0 } };

    // Kırılım: Tip → ProjeKökü → MalikGrubu(24 / diğerleri) + Toplam
    const breakdown = { Konut: {}, Ticari: {} };

    for (const u of units) {
      const t = tipGetter(u).toLowerCase().includes('ticari') ? 'Ticari' : 'Konut';
      tipGroups[t].total += 1;
      const isDel = isDelivered(cols?.durum ? u[cols.durum] : null);
      if (isDel) tipGroups[t].delivered += 1;

      const projRoot = cols.proje ? getProjectRoot(u[cols.proje]) : '—';
      const malikStr = (cols.malik ? (u[cols.malik] ?? '') : '').toString().toLowerCase();
      const isOwner24 = malikStr.includes('24 gayrimenkul'); // case-insensitive arama

      if (!breakdown[t][projRoot]) {
        breakdown[t][projRoot] = {
          owner24: { total: 0, delivered: 0 },
          others: { total: 0, delivered: 0 },
          total: { total: 0, delivered: 0 },
        };
      }
      const node = breakdown[t][projRoot];
      const grp = isOwner24 ? 'owner24' : 'others';

      node[grp].total += 1;
      node.total.total += 1;
      if (isDel) {
        node[grp].delivered += 1;
        node.total.delivered += 1;
      }
    }

    // Yüzdeleri hesapla
    const pctOf = (a, b) => (b ? Math.round((a / b) * 100) : 0);
    for (const tip of ['Konut', 'Ticari']) {
      for (const root of Object.keys(breakdown[tip])) {
        const n = breakdown[tip][root];
        n.owner24.pct = pctOf(n.owner24.delivered, n.owner24.total);
        n.others.pct = pctOf(n.others.delivered, n.others.total);
        n.total.pct = pctOf(n.total.delivered, n.total.total);
      }
    }

    // Tip toplam yüzdeleri
    const tipStats = {
      Konut: {
        total: tipGroups.Konut.total,
        delivered: tipGroups.Konut.delivered,
        pct: tipGroups.Konut.total ? Math.round((tipGroups.Konut.delivered / tipGroups.Konut.total) * 100) : 0,
      },
      Ticari: {
        total: tipGroups.Ticari.total,
        delivered: tipGroups.Ticari.delivered,
        pct: tipGroups.Ticari.total ? Math.round((tipGroups.Ticari.delivered / tipGroups.Ticari.total) * 100) : 0,
      },
    };

    // --- ÖZEL: 2115 ve 2116 için toplamlar (tip ayırmadan) ---
    const sectionTotals = { '2115': { total: 0, delivered: 0 }, '2116': { total: 0, delivered: 0 } };
    for (const u of units) {
      const root = cols.proje ? getProjectRoot(u[cols.proje]) : null;
      if (!root || !(root in sectionTotals)) continue;
      sectionTotals[root].total += 1;
      if (isDelivered(cols?.durum ? u[cols.durum] : null)) sectionTotals[root].delivered += 1;
    }

    return { total, delivered, remaining, pct, statusCounts, tipStats, breakdown, sectionTotals };
  }, [units, cols]);

  const selectedLabel = useMemo(() => {
    if (!cols) return '';
    const row = units.find((u) => u[cols.id] === selectedId);
    if (!row) return '';
    return composeLabel(row, cols);
  }, [units, selectedId, cols]);

  // Yardımcı render: Tip → (2115/1, 2116/2, ...) kartları
  function TipBreakdown({ tip, data }) {
    const roots = Object.keys(data || {}).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
    if (roots.length === 0) return null;
    return (
      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>{tip}</div>
        <div style={styles.projeGrid}>
          {roots.map((root) => {
            const node = data[root];
            const title = ROOT_LABEL_MAP[root] || root; // 2115 -> 2115/1, 2116 -> 2116/2
            return (
              <div key={`${tip}-${root}`} style={styles.tipItem}>
                <div style={styles.tipTitle}>{title}</div>
                <div style={styles.tipRow}><span>24 Gayrimenkul:</span>
                  <b> Toplam {node.owner24.total} · Teslim {node.owner24.delivered} · %{node.owner24.pct}</b>
                </div>
                <div style={styles.tipRow}><span>Diğerleri:</span>
                  <b> Toplam {node.others.total} · Teslim {node.others.delivered} · %{node.others.pct}</b>
                </div>
                <div style={{ ...styles.tipRow, borderTop: '1px dashed rgba(255,255,255,0.12)', paddingTop: 6, marginTop: 6 }}>
                  <span>Toplam:</span>
                  <b> Toplam {node.total.total} · Teslim {node.total.delivered} · %{node.total.pct}</b>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div style={styles.wrap}>
      {/* ---- Sağ üst mini admin alanı ---- */}
      <div style={styles.adminBar}>
        {!isAdmin ? (
          <>
            <button
              onClick={() => setAuthOpen(v => !v)}
              style={{...styles.saveBtn, padding:"8px 12px"}}
              title="Admin Girişi"
            >
              Admin
            </button>
            {authOpen && (
              <form onSubmit={handleLogin} style={styles.adminForm}>
                <div style={{display:"grid", gap:8, minWidth:240}}>
                  <input
                    style={styles.input}
                    placeholder="E-posta"
                    value={authEmail}
                    onChange={(e)=>setAuthEmail(e.target.value)}
                    type="email"
                    autoComplete="username"
                  />
                  <input
                    style={styles.input}
                    placeholder="Şifre"
                    value={authPass}
                    onChange={(e)=>setAuthPass(e.target.value)}
                    type="password"
                    autoComplete="current-password"
                  />
                  <button type="submit" disabled={authLoading} style={styles.saveBtn}>
                    {authLoading ? "Giriş yapılıyor…" : "Giriş Yap"}
                  </button>
                  {authErr && <div style={styles.error}>{authErr}</div>}
                  <div style={{fontSize:12, color:"#94A3B8"}}>
                    Giriş yapmadan yalnızca <b>Durum</b> alanını değiştirebilirsiniz.
                  </div>
                </div>
              </form>
            )}
          </>
        ) : (
          <>
            <div style={{fontSize:12, color:"#94A3B8"}}>Admin aktif</div>
            <button onClick={handleLogout} style={{...styles.saveBtn, padding:"8px 12px"}}>Çıkış</button>
          </>
        )}
      </div>

      <aside style={styles.sidebar}>
        <div style={styles.sideHeader}>Bağımsız Bölümler</div>
        {loadingList && <div style={styles.muted}>Yükleniyor…</div>}
        {listError && <div style={styles.error}>Hata: {listError}</div>}
        <div style={styles.list}>
          {units.map((u) => {
            const isActive = cols && u[cols.id] === selectedId;
            const labelText = cols ? composeLabel(u, cols) : '';
            return (
              <button
                key={cols ? u[cols.id] : Math.random()}
                style={{ ...styles.listItem, ...(isActive ? styles.listItemActive : {}) }}
                onClick={() => cols && setSelectedId(u[cols.id])}
                title={labelText}
              >
                {labelText}
              </button>
            );
          })}
        </div>
      </aside>

      <main style={styles.main}>
        {/* ------- TESLİM DURUM İCMALİ ------- */}
        {report && (
          <section style={styles.reportCard}>
            <div style={styles.reportTop}>
              <h3 style={{ margin: 0 }}>Teslim Durum İcmali</h3>
              <div style={styles.reportKPIs}>
                <KPI label="Toplam" value={report.total} />
                <KPI label="Teslim" value={report.delivered} />
                <KPI label="Kalan" value={report.remaining} />
                <KPI label="Tamamlanma" value={`${report.pct}%`} />
              </div>
            </div>

            {/* ÖZEL: 2115/1 ve 2116/2 pie grafikleri (yüzdeli, büyük ve ortalı) */}
            <div style={styles.tipGrid}>
              <DeliveredPie
                title="2115/1 — Teslim vs Kalan"
                delivered={report.sectionTotals['2115']?.delivered || 0}
                total={report.sectionTotals['2115']?.total || 0}
              />
              <DeliveredPie
                title="2116/2 — Teslim vs Kalan"
                delivered={report.sectionTotals['2116']?.delivered || 0}
                total={report.sectionTotals['2116']?.total || 0}
              />
            </div>

            {/* Konut/Ticari toplam kırılımı (genel) */}
            <div style={styles.tipGrid}>
              <div style={styles.tipItem}>
                <div style={{ ...styles.tipTitle, fontSize: 16, textAlign: 'center' }}>Konut (Genel)</div>
                <div style={styles.tipRow}><span>Toplam:</span><b>{report.tipStats.Konut.total}</b></div>
                <div style={styles.tipRow}><span>Teslim:</span><b>{report.tipStats.Konut.delivered}</b></div>
                <div style={styles.tipRow}><span>Tamamlanma:</span><b>{report.tipStats.Konut.pct}%</b></div>
              </div>
              <div style={styles.tipItem}>
                <div style={{ ...styles.tipTitle, fontSize: 16, textAlign: 'center' }}>Ticari (Genel)</div>
                <div style={styles.tipRow}><span>Toplam:</span><b>{report.tipStats.Ticari.total}</b></div>
                <div style={styles.tipRow}><span>Teslim:</span><b>{report.tipStats.Ticari.delivered}</b></div>
                <div style={styles.tipRow}><span>Tamamlanma:</span><b>{report.tipStats.Ticari.pct}%</b></div>
              </div>
            </div>

            {/* İstenen özel kırılım: Proje kökü → Malik grubu → Toplam (başlık eşlemeli) */}
            <TipBreakdown tip="Konut" data={report.breakdown.Konut} />
            <TipBreakdown tip="Ticari" data={report.breakdown.Ticari} />

            {/* Durum kırılımı */}
            <div style={styles.statusGrid}>
              {Object.entries(report.statusCounts).map(([name, count]) => (
                <div key={name} style={styles.statusItem}>
                  <div style={styles.statusName}>{name || '—'}</div>
                  <div style={styles.statusCount}>{count}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ------- Haftalık Randevu Takvimi ------- */}
        {cols?.randevuTarih ? (
          <section style={styles.agendaCard}>
            <div style={styles.agendaHeader}>
              <h3 style={{ margin: 0 }}>Randevular (Haftalık)</h3>
              <div style={{ display:'flex', gap:8, marginLeft:'auto' }}>
                <button style={styles.saveBtn} onClick={() => setWeekStart(addDays(weekStart, -7))}>◀ Önceki Hafta</button>
                <button style={styles.saveBtn} onClick={() => setWeekStart(startOfWeek(new Date()))}>Bugün</button>
                <button style={styles.saveBtn} onClick={() => setWeekStart(addDays(weekStart, 7))}>Sonraki Hafta ▶</button>
              </div>
            </div>
            <div style={{ ...styles.muted, marginBottom:6 }}>
              {ymd(getWeekDays(weekStart)[0].date)} – {ymd(getWeekDays(weekStart)[6].date)}
            </div>
            <div style={styles.agendaGrid}>
              {getWeekDays(weekStart).map((d) => {
                const items = agenda.itemsByDay[d.key] || [];
                const isToday = ymd(startOfDay(new Date())) === d.key;
                return (
                  <div key={d.key} style={{ ...styles.agendaCol, outline: isToday ? '2px solid rgba(99,102,241,0.35)' : 'none' }}>
                    <div style={styles.agendaDayHeader}>{d.label}</div>
                    <div style={styles.agendaItems}>
                      {items.length === 0 ? (
                        <div style={styles.agendaEmpty}>—</div>
                      ) : (
                        items.map((it) => (
                          <div key={it.id + (it.saat || '')} style={styles.agendaItem}>
                            <div style={styles.agendaItemTop}>
                              <span style={styles.agendaItemTime}>{it.saat || '--:--'}</span>
                              <span style={styles.agendaItemTag}>{it.label}</span>
                            </div>
                            {(it.musteri || it.durum) && (
                              <div style={styles.agendaItemMeta}>
                                {it.musteri && <span>{it.musteri}</span>}
                                {it.musteri && it.durum && <span> · </span>}
                                {it.durum && <span>{it.durum}</span>}
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : (
          <div style={{ ...styles.muted, marginBottom: 8 }}>
            Takvim için <code>randevu_tarihi</code> kolonu bulunamadı.
          </div>
        )}

        {/* ------- Detay Paneli ------- */}
        <div style={styles.header}>
          <h2 style={{ margin: 0 }}>Detay Paneli</h2>
          <div style={styles.subtle}>Seçili: {selectedLabel || '-'}</div>
        </div>

        {cols && !cols.tip && (
          <div style={{ ...styles.warn, marginBottom: 8 }}>
            Not: <code>tip/kategori/tur/type</code> kolonu bulunamadı. “Konut/Ticari” kuraldan hesaplanıyor.
          </div>
        )}

        {cols && !detailLoading && detail && (
          <div style={styles.form}>
            {cols.proje && (
              <Field
                label="Proje/Parsel"
                value={detail[cols.proje]}
                onChange={(v) => handleChange(cols.proje, v)}
                placeholder="Örn: 2115/1"
                disabled={!isAdmin}
              />
            )}
            {cols.blok && (
              <Field
                label="Blok"
                value={detail[cols.blok]}
                onChange={(v) => handleChange(cols.blok, v)}
                placeholder="Örn: A"
                disabled={!isAdmin}
              />
            )}
            {cols.label && (
              <Field
                label="Bağımsız Bölüm / No"
                value={detail[cols.label]}
                onChange={(v) => handleChange(cols.label, v)}
                placeholder="Örn: 1"
                disabled={!isAdmin}
              />
            )}

            {/* Tip: varsa düzenlenebilir; yoksa kuraldan readonly */}
            {cols.tip ? (
              <Field
                label="Tip"
                value={detail[cols.tip] ?? ''}
                onChange={(v) => handleChange(cols.tip, v)}
                placeholder="Konut / Ticari"
                disabled={!isAdmin}
              />
            ) : (
              <div style={styles.field}>
                <label style={styles.label}>Tip (otomatik)</label>
                <input
                  style={styles.input}
                  value={deriveTipFromRule(detail?.[cols?.blok], detail?.[cols?.label])}
                  readOnly
                />
              </div>
            )}

            {cols.malik && (
              <Field
                label="Malik"
                value={detail[cols.malik]}
                onChange={(v) => handleChange(cols.malik, v)}
                placeholder="Malik adı"
                disabled={!isAdmin}
              />
            )}
            {cols.musteri && (
              <Field
                label="Müşteri"
                value={detail[cols.musteri]}
                onChange={(v) => handleChange(cols.musteri, v)}
                placeholder="Müşteri adı"
                disabled={!isAdmin}
              />
            )}

            {/* DURUM: misafir de değiştirebilir */}
            {cols.durum && (
              <Field
                label="Durum"
                value={detail[cols.durum]}
                onChange={(v) => handleChange(cols.durum, v)}
                placeholder="Örn: Randevu Verildi, Teslim Edildi…"
                disabled={false}
              />
            )}

            {cols.aciklama && (
              <TextArea
                label="Açıklama"
                value={detail[cols.aciklama]}
                onChange={(v) => handleChange(cols.aciklama, v)}
                placeholder="Kısa not"
                rows={4}
                disabled={!isAdmin}
              />
            )}

            <div style={styles.row}>
              {cols.randevuTarih && (
                <div style={{ ...styles.col, marginRight: 8 }}>
                  <label style={styles.label}>Randevu Tarihi</label>
                  <input
                    type="date"
                    value={detail[cols.randevuTarih] || ''}
                    onChange={(e) => handleChange(cols.randevuTarih, e.target.value || null)}
                    style={{...styles.input, opacity: !isAdmin ? .6 : 1}}
                    disabled={!isAdmin}
                  />
                </div>
              )}
              {cols.randevuSaat && (
                <div style={{ ...styles.col, marginLeft: 8 }}>
                  <label style={styles.label}>Randevu Saati</label>
                  <input
                    type="time"
                    value={detail[cols.randevuSaat] || ''}
                    onChange={(e) => handleChange(cols.randevuSaat, e.target.value || null)}
                    style={{...styles.input, opacity: !isAdmin ? .6 : 1}}
                    disabled={!isAdmin}
                  />
                </div>
              )}
            </div>

            <div style={styles.actions}>
              <button onClick={handleSave} disabled={saveLoading} style={styles.saveBtn}>
                {saveLoading ? 'Kaydediliyor…' : 'Kaydet'}
              </button>
              {saveMsg && <span style={styles.ok}>{saveMsg}</span>}
              {saveErr && <span style={styles.error}>{saveErr}</span>}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function KPI({ label, value }) {
  return (
    <div style={styles.kpi}>
      <div style={styles.kpiLabel}>{label}</div>
      <div style={styles.kpiValue}>{value}</div>
    </div>
  );
}
function Field({ label, value, onChange, placeholder, disabled }) {
  return (
    <div style={styles.field}>
      <label style={styles.label}>{label}</label>
      <input
        style={{...styles.input, opacity: disabled ? .6 : 1}}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
      />
    </div>
  );
}
function TextArea({ label, value, onChange, placeholder, rows = 3, disabled }) {
  return (
    <div style={styles.field}>
      <label style={styles.label}>{label}</label>
      <textarea
        style={{ ...styles.input, height: 'auto', paddingTop: 10, opacity: disabled ? .6 : 1 }}
        rows={rows}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
      />
    </div>
  );
}

const styles = {
  wrap: {
    display: 'flex',
    height: '100vh',
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
    background: '#0B1020',
    color: '#E6ECFF',
  },
  adminBar: {
    position: 'fixed', top: 10, right: 10, zIndex: 1000,
    display: 'flex', alignItems: 'center', gap: 8
  },
  adminForm: {
    background: 'rgba(0,0,0,0.6)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 12, padding: 12, backdropFilter: 'blur(6px)'
  },
  sidebar: {
    width: 320,
    borderRight: '1px solid rgba(255,255,255,0.08)',
    padding: 12,
    overflow: 'auto',
    background: 'linear-gradient(180deg, #0C1226 0%, #0B1020 100%)',
  },
  sideHeader: {
    fontSize: 14,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: '#94A3B8',
    marginBottom: 8,
  },
  list: { display: 'grid', gap: 8 },
  listItem: {
    textAlign: 'left',
    padding: '10px 12px',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 10,
    color: '#E6ECFF',
    cursor: 'pointer',
  },
  listItemActive: {
    background: 'rgba(99,102,241,0.15)',
    borderColor: 'rgba(99,102,241,0.35)',
  },
  main: { flex: 1, padding: 24, overflow: 'auto' },
  header: { marginTop: 16, marginBottom: 16 },
  subtle: { color: '#94A3B8', fontSize: 12, marginTop: 4 },

  /* Raporlama */
  reportCard: {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  reportTop: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 12,
  },
  reportKPIs: { display: 'grid', gridTemplateColumns: 'repeat(4, auto)', gap: 12 },
  kpi: {
    background: 'rgba(255,255,255,0.02)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 10,
    padding: '8px 10px',
    minWidth: 90,
  },
  kpiLabel: { fontSize: 12, color: '#9AA6B2' },
  kpiValue: { fontSize: 18, fontWeight: 700 },

  tipGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 8,
    marginBottom: 8,
  },
  projeGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: 8,
    marginBottom: 8,
  },
  tipItem: {
    background: 'rgba(255,255,255,0.02)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 10,
    padding: 10,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  tipTitle: { fontSize: 13, fontWeight: 700, marginBottom: 6, textAlign: 'center' },
  tipRow: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#E6ECFF', justifyContent: 'space-between' },
  centeredPieWrap: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: 260,
    width: '100%',
    marginBottom: 12,
  },

  statusGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(5, 1fr)',
    gap: 8,
    marginTop: 8,
  },
  statusItem: {
    background: 'rgba(255,255,255,0.02)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 10,
    padding: 8,
  },
  statusName: { fontSize: 12, color: '#9AA6B2', marginBottom: 4 },
  statusCount: { fontSize: 16, fontWeight: 700 },

  /* Takvim */
  agendaCard: {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 12,
    padding: 12,
  },
  agendaHeader: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 },
  agendaGrid: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 },
  agendaCol: {
    background: 'rgba(255,255,255,0.02)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 10,
    padding: 8,
    minHeight: 120,
  },
  agendaDayHeader: { fontSize: 12, color: '#9AA6B2', marginBottom: 6 },
  agendaItems: { display: 'grid', gap: 6 },
  agendaEmpty: { color: '#94A3B8', fontSize: 12 },
  agendaItem: {
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 8,
    padding: 8,
  },
  agendaItemTop: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 },
  agendaItemTime: { fontVariantNumeric: 'tabular-nums', fontSize: 13, opacity: 0.9 },
  agendaItemTag: {
    fontSize: 13,
    background: 'rgba(99,102,241,0.20)',
    border: '1px solid rgba(99,102,241,0.35)',
    padding: '2px 6px',
    borderRadius: 6,
  },
  agendaItemMeta: { fontSize: 12, color: '#94A3B8' },

  /* Form */
  form: { maxWidth: 720, display: 'grid', gap: 12, marginTop: 16 },
  field: { display: 'grid', gap: 6 },
  label: { fontSize: 12, color: '#9AA6B2' },
  input: {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 10,
    color: '#E6ECFF',
    padding: '10px 12px',
    outline: 'none',
  },
  row: { display: 'flex' },
  col: { flex: 1, display: 'grid', gap: 6 },
  actions: { display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 },
  saveBtn: {
    background: 'rgba(99,102,241,0.25)',
    border: '1px solid rgba(99,102,241,0.45)',
    borderRadius: 10,
    padding: '10px 16px',
    color: '#E6ECFF',
    cursor: 'pointer',
  },
  ok: { color: '#4ADE80', fontSize: 13 },
  error: { color: '#FCA5A5', fontSize: 13 },
  muted: { color: '#94A3B8' },
  warn: { color: '#FCD34D', fontSize: 13 },
};
