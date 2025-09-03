import React from 'react'

export default function Header({
  session, isAdminView, onToggleAdmin, onLoginClick, onLogout
}) {
  return (
    <header style={{
      position:'sticky',top:0,zIndex:50,backdropFilter:'blur(6px)',
      borderBottom:'1px solid #1e2a3a',background:'rgba(11,15,20,.7)'
    }}>
      <div className="container" style={{display:'flex',alignItems:'center',gap:12}}>
        <div style={{display:'flex',alignItems:'center',gap:12,flex:1}}>
          <div style={{width:36,height:36,borderRadius:10,background:'#122033',
            display:'grid',placeItems:'center',fontWeight:700}}>TP</div>
          <div>
            <div style={{fontWeight:700}}>Teslim Panel</div>
            <div style={{fontSize:12,opacity:.7}}>Tek link — sağ üstten Admin</div>
          </div>
        </div>

        <div style={{display:'flex',alignItems:'center',gap:10}}>
          {session && (
            <button onClick={onToggleAdmin} title="Admin panelini aç/kapat" style={{
              fontSize:12,padding:'6px 10px',borderRadius:10,border:'1px solid #274056',
              background:isAdminView?'#0e2338':'#0b1a29',color:'#cfe6ff',cursor:'pointer'
            }}>
              {isAdminView ? 'Panel: AÇIK' : 'Panel: KAPALI'}
            </button>
          )}
          {!session ? (
            <button onClick={onLoginClick} style={{
              fontSize:12,padding:'6px 10px',borderRadius:10,border:'1px solid #274056',
              background:'#0b1a29',color:'#cfe6ff',cursor:'pointer'
            }}>
              Admin Giriş
            </button>
          ) : (
            <button onClick={onLogout} style={{
              fontSize:12,padding:'6px 10px',borderRadius:10,border:'1px solid #402727',
              background:'#29110b',color:'#ffd4cf',cursor:'pointer'
            }}>
              Çıkış
            </button>
          )}
        </div>
      </div>
    </header>
  )
}
