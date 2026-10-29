import React,{useEffect,useState} from 'react'
import {HashRouter,Routes,Route,Navigate,useLocation,useNavigate,useSearchParams} from 'react-router-dom'
import Builder from './App.jsx'
import PublicPages from './components/PublicPages.jsx'
import AuthPage from './components/AuthPage.jsx'
import Dashboard from './components/Dashboard.jsx'
import BankPage from './components/BankPage.jsx'
import TemplatePage from './components/TemplatePage.jsx'
import AnalyticsPanel from './components/AnalyticsPanel.jsx'
import AdminPage from './components/AdminPage.jsx'
import WorkspaceLayout from './components/WorkspaceLayout.jsx'
import {api} from './lib/api.js'

function Application(){
 const [user,setUser]=useState(null),[checking,setChecking]=useState(true)
 const nav=useNavigate(),loc=useLocation(),[params]=useSearchParams()
 useEffect(()=>{let active=true;api('/auth/me').then(r=>{if(active)setUser(r.user)}).catch(()=>{}).finally(()=>{if(active)setChecking(false)});return()=>{active=false}},[])
 useEffect(()=>{window.scrollTo({top:0,behavior:'instant'})},[loc.pathname])
 async function logout(){try{await api('/auth/logout',{method:'POST'})}finally{setUser(null);nav('/')}}
 const onEdit=id=>nav(id?`/builder?id=${encodeURIComponent(id)}`:'/builder')
 const guard=children=>!user?<Navigate to="/login" state={{from:loc.pathname}} replace/>:children
 if(checking)return <div className="min-h-screen grid place-items-center text-brand-600 text-xl font-bold">Loading QPaper Studio…</div>
 return <Routes>
  <Route path="/" element={<PublicPages page="home" user={user}/>}/>
  <Route path="/about" element={<PublicPages page="about" user={user}/>}/>
  <Route path="/contact" element={<PublicPages page="contact" user={user}/>}/>
  <Route path="/login" element={user?<Navigate to="/dashboard" replace/>:<AuthPage onLogin={u=>{setUser(u);nav('/dashboard')}}/>}/>
  <Route path="/register" element={user?<Navigate to="/dashboard" replace/>:<AuthPage mode="register" onLogin={u=>{setUser(u);nav('/dashboard')}}/>}/>
  <Route path="/forgot-password" element={<AuthPage mode="forgot"/>}/>
  <Route path="/reset-password/:token" element={<AuthPage mode="reset"/>}/>
  <Route path="/invite/:token" element={<AuthPage mode="invite" onLogin={u=>{setUser(u);nav('/login')}}/>}/>
  <Route path="/builder" element={guard(<Builder key={params.get('id')||'new'} user={user} onLogout={logout} onDashboard={()=>nav('/dashboard')} paperId={params.get('id')} templateId={params.get('template')} onPaperId={id=>nav(`/builder?id=${encodeURIComponent(id)}`,{replace:true})} readOnly={user?.role==='student'}/>)}/>
  <Route path="/dashboard" element={guard(<WorkspaceLayout user={user} onLogout={logout}><Dashboard user={user} onEdit={onEdit}/></WorkspaceLayout>)}/>
  <Route path="/bank" element={guard(user?.role==='student'?<Navigate to="/dashboard"/>:<WorkspaceLayout user={user} onLogout={logout}><BankPage/></WorkspaceLayout>)}/>
  <Route path="/templates" element={guard(user?.role==='student'?<Navigate to="/dashboard" replace/>:<WorkspaceLayout user={user} onLogout={logout}><TemplatePage user={user}/></WorkspaceLayout>)}/>
  <Route path="/analytics" element={guard(<WorkspaceLayout user={user} onLogout={logout}><AnalyticsPanel role={user?.role}/></WorkspaceLayout>)}/>
  <Route path="/admin" element={guard(user?.role!=='admin'?<Navigate to="/dashboard"/>:<WorkspaceLayout user={user} onLogout={logout}><AdminPage user={user}/></WorkspaceLayout>)}/>
  <Route path="*" element={<PublicPages page="not-found" user={user}/>}/>
 </Routes>
}
export default function Root(){return <HashRouter><Application/></HashRouter>}
