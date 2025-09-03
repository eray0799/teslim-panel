import React from 'react'
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js'
import { Pie } from 'react-chartjs-2'

ChartJS.register(ArcElement, Tooltip, Legend)

export default function PublicDashboard({ stats }) {
  const data = {
    labels: ['Teslim', 'Bekleyen'],
    datasets: [{ label: 'Durum', data: [stats.teslim, stats.bekleyen], borderWidth: 1 }]
  }
  return (
    <section className="container" style={{marginTop:16}}>
      <div className="card" style={{padding:16}}>
        <h2 style={{marginTop:0}}>Genel Durum</h2>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
          <div>
            <div style={{fontSize:14,opacity:.8}}>Bugün Özet</div>
            <div style={{display:'flex',gap:12,marginTop:8}}>
              <div className="card" style={{padding:12}}>
                <div style={{fontSize:12,opacity:.7}}>Teslim</div>
                <div style={{fontSize:24,fontWeight:700}}>{stats.teslim}</div>
              </div>
              <div className="card" style={{padding:12}}>
                <div style={{fontSize:12,opacity:.7}}>Bekleyen</div>
                <div style={{fontSize:24,fontWeight:700}}>{stats.bekleyen}</div>
              </div>
            </div>
          </div>
          <div style={{maxWidth:420,justifySelf:'end'}}><Pie data={data} /></div>
        </div>
      </div>
    </section>
  )
}
