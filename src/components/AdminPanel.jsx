import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function AdminPanel({ isAllowed }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!isAllowed) return
    ;(async () => {
      setLoading(true); setError(null)
      const { data, error } = await supabase
        .from('teslimatlar')
        .select('*')
        .order('id', { ascending: true })
        .limit(200)
      if (error) setError(error.message)
      else setRows(data || [])
      setLoading(false)
    })()
  }, [isAllowed])

  async function quickUpdateStatus(id, newVal) {
    const { error } = await supabase
      .from('teslimatlar')
      .update({ durum: newVal })
      .eq('id', id)
    if (!error) setRows(rs => rs.map(r => r.id === id ? { ...r, durum: newVal } : r))
    else alert('Güncellenemedi: ' + error.message)
  }

  if (!isAllowed) {
    return (
      <section className="container" style={{marginTop:16}}>
        <div className="card" style={{padding:16,border:'1px solid #5a2'}}>
          <b>Giriş başarılı; ancak bu hesap admin yetkili değil.</b><br/>
          Yetkili e-postayı <code>VITE_ADMIN_ALLOWED_EMAILS</code> listesine ekle.
        </div>
      </section>
    )
  }

  return (
    <section className="container" style={{marginTop:16}}>
      <div className="card" style={{padding:16}}>
        <h2 style={{marginTop:0}}>Admin Panel</h2>
        {loading && <div style={{opacity:.7}}>Yükleniyor…</div>}
        {error && <div style={{color:'#f99'}}>Hata: {error}</div>}
        {!loading && !error && (
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead>
                <tr style={{textAlign:'left'}}>
                  <th style={{borderBottom:'1px solid #22364d',padding:'8px'}}>ID</th>
                  <th style={{borderBottom:'1px solid #22364d',padding:'8px'}}>Müşteri</th>
                  <th style={{borderBottom:'1px solid #22364d',padding:'8px'}}>Blok</th>
                  <th style={{borderBottom:'1px solid #22364d',padding:'8px'}}>Daire</th>
                  <th style={{borderBottom:'1px solid #22364d',padding:'8px'}}>Durum</th>
                  <th style={{borderBottom:'1px solid #22364d',padding:'8px'}}>İşlem</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id}>
                    <td style={{borderBottom:'1px solid #1b2a3d',padding:'8px'}}>{r.id}</td>
                    <td style={{borderBottom:'1px solid #1b2a3d',padding:'8px'}}>{r.musteri ?? '-'}</td>
                    <td style={{borderBottom:'1px solid #1b2a3d',padding:'8px'}}>{r.blok ?? '-'}</td>
                    <td style={{borderBottom:'1px solid #1b2a3d',padding:'8px'}}>{r.daire ?? '-'}</td>
                    <td style={{borderBottom:'1px solid #1b2a3d',padding:'8px'}}>{r.durum ?? '-'}</td>
                    <td style={{borderBottom:'1px solid #1b2a3d',padding:'8px'}}>
                      <button onClick={() => quickUpdateStatus(r.id, 'Teslim')} style={{
                        fontSize:12,padding:'6px 10px',borderRadius:10,border:'1px solid #274056',
                        background:'#0b1a29',color:'#cfe6ff',cursor:'pointer'
                      }}>
                        Teslim yap
                      </button>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={6} style={{padding:'12px',opacity:.7}}>Kayıt yok.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}
