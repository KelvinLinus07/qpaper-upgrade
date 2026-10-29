import React,{useEffect,useId,useMemo,useState} from 'react'
import {api} from '../lib/api.js'
import {Activity,BookOpen,CheckCircle2,FileText,Layers3,RefreshCw,BarChart3} from 'lucide-react'

const COLORS=['#4f46e5','#06b6d4','#f59e0b','#10b981','#a855f7','#f43f5e','#64748b','#84cc16']
const n=v=>Number(v)||0
const number=v=>n(v).toLocaleString()
const dateLabel=(value,grain)=>new Date(`${value}T12:00:00Z`).toLocaleDateString(undefined,grain==='month'?{month:'short',year:'2-digit'}:{day:'numeric',month:'short'})

function Stat({label,value,Icon,detail}){
 return <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-sm min-w-0"><div className="flex justify-between items-start gap-2"><p className="text-slate-500 text-sm font-medium">{label}</p><Icon size={20} className="text-indigo-500 shrink-0"/></div><p className="text-3xl font-extrabold mt-3 tabular-nums">{number(value)}</p>{detail&&<p className="text-xs text-slate-400 mt-1">{detail}</p>}</div>
}
function Card({title,subtitle,children}){
 return <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-sm min-w-0"><h3 className="font-bold text-lg">{title}</h3>{subtitle&&<p className="text-slate-500 text-sm mt-1">{subtitle}</p>}<div className="mt-6">{children}</div></section>
}
function Empty({label}){return <div className="min-h-[170px] flex flex-col justify-center items-center text-slate-400 text-center text-sm gap-2"><BarChart3 size={28}/>{label}</div>}

function Timeline({points,grain}){
 const pathId=useId().replace(/:/g,'')
 if(!points?.length)return <Empty label="No timeline data yet"/>
 const w=700,h=235,left=36,right=12,top=22,bottom=41
 const ymax=Math.max(1,...points.map(p=>n(p.count)))
 const x=i=>left+(points.length===1?0:i/(points.length-1))*(w-left-right)
 const y=v=>top+(1-n(v)/ymax)*(h-top-bottom)
 const xy=points.map((p,i)=>[x(i),y(p.count)])
 const line=xy.map(([px,py],i)=>`${i?'L':'M'}${px.toFixed(1)} ${py.toFixed(1)}`).join(' ')
 const area=`${line} L${x(points.length-1).toFixed(1)} ${h-bottom} L${x(0).toFixed(1)} ${h-bottom} Z`
 const labelIdx=[0,Math.floor((points.length-1)/2),points.length-1]
 return <><div className="w-full" role="img" aria-label={`Paper creation trend: ${points.reduce((s,p)=>s+n(p.count),0)} papers created across ${points.length} ${grain} periods`}>
 <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto max-h-[270px]" preserveAspectRatio="xMidYMid meet">
  <defs><linearGradient id={pathId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6366f1" stopOpacity="0.25"/><stop offset="100%" stopColor="#6366f1" stopOpacity="0.015"/></linearGradient></defs>
  {[0,.5,1].map(frac=><g key={frac}><line x1={left} x2={w-right} y1={y(ymax*frac)} y2={y(ymax*frac)} stroke="#e2e8f0" strokeDasharray="5 5"/><text textAnchor="end" x={left-10} y={y(ymax*frac)+4} fill="#64748b" fontSize="11">{Math.round(ymax*frac)}</text></g>)}
  <path d={area} fill={`url(#${pathId})`}/><path d={line} fill="none" stroke="#4f46e5" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
  {xy.map(([px,py],i)=><circle key={i} cx={px} cy={py} r={points.length>40?2.1:3.5} fill="#4f46e5" stroke="white" strokeWidth="1"><title>{dateLabel(points[i].date,grain)}: {points[i].count} paper{points[i].count===1?'':'s'}</title></circle>)}
  {[...new Set(labelIdx)].map(i=><text key={i} x={x(i)} y={h-13} fontSize="11" textAnchor={i===0?'start':i===points.length-1?'end':'middle'} fill="#64748b">{dateLabel(points[i].date,grain)}</text>)}
 </svg></div><p className="text-xs text-slate-500 mt-2">{number(points.reduce((s,p)=>s+n(p.count),0))} papers created in the selected period. Hover on points to inspect counts.</p></>
}
function Donut({published,drafts}){
 const total=n(published)+n(drafts),share=total?n(published)/total:0
 const circumference=2*Math.PI*66
 if(!total)return <Empty label="No papers to chart yet"/>
 return <div className="flex flex-col sm:flex-row xl:flex-col 2xl:flex-row justify-center items-center gap-5"><svg viewBox="0 0 190 190" width="170" height="170" role="img" aria-label={`${published} published and ${drafts} draft papers`} className="shrink-0"><circle cx="95" cy="95" r="66" fill="none" stroke="#e2e8f0" strokeWidth="19"/><circle cx="95" cy="95" r="66" fill="none" stroke="#4f46e5" strokeWidth="19" strokeDasharray={`${share*circumference} ${circumference}`} transform="rotate(-90 95 95)" strokeLinecap="round"/><text x="95" y="90" textAnchor="middle" fill="#0f172a" fontSize="26" fontWeight="800">{Math.round(share*100)}%</text><text x="95" y="111" textAnchor="middle" fill="#64748b" fontSize="12">published</text></svg><div className="space-y-3 min-w-[140px] text-sm"><div className="flex justify-between gap-5"><span className="flex items-center gap-2 text-slate-600"><span className="w-3 h-3 bg-indigo-600 rounded-full"/>Published</span><strong>{number(published)}</strong></div><div className="flex justify-between gap-5"><span className="flex items-center gap-2 text-slate-600"><span className="w-3 h-3 bg-slate-200 rounded-full"/>Drafts</span><strong>{number(drafts)}</strong></div></div></div>
}
function Bars({data,label='items'}){
 if(!data?.some(item=>n(item.count)>0))return <Empty label={`No ${label} to chart yet`}/>
 const max=Math.max(...data.map(item=>n(item.count)),1)
 return <div className="space-y-4">{data.map((item,i)=><div key={item.label} className="min-w-0"><div className="flex justify-between gap-3 text-sm mb-1.5"><span className="truncate font-medium text-slate-700" title={item.label}>{item.label}</span><span className="text-slate-500 tabular-nums shrink-0">{number(item.count)}</span></div><div className="h-3 bg-slate-100 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{width:`${100*n(item.count)/max}%`,backgroundColor:COLORS[i%COLORS.length]}}/></div></div>)}</div>
}

export default function AnalyticsPanel({compact=false,role='teacher'}){
 const [days,setDays]=useState(90),[data,setData]=useState(null),[busy,setBusy]=useState(true),[error,setError]=useState(''),[refreshKey,setRefreshKey]=useState(0)
 useEffect(()=>{let alive=true;setBusy(true);api(`/analytics?days=${days}`).then(r=>{if(alive){setData(r);setError('')}}).catch(err=>{if(alive)setError(err.message)}).finally(()=>{if(alive)setBusy(false)});return()=>{alive=false}},[days,refreshKey])
 const stats=data?.summary||{}
 return <section className={compact?'mt-9':'space-y-8'} aria-label="Examination analytics">
  <div className="flex flex-wrap gap-4 justify-between items-center mb-5"><div>{compact?<><h2 className="font-bold text-xl sm:text-2xl">Paper analytics</h2><p className="text-slate-500 text-sm mt-1">Creation trends and publication status</p></>:<><p className="eyebrow-new">LIVE DATABASE METRICS</p><h1 className="text-3xl sm:text-4xl font-extrabold mt-2">Examination analytics</h1><p className="text-sm text-slate-500 mt-2">{role==='admin'?'Platform-wide totals':role==='student'?'Published examinations only':'Your papers and personal question bank'} · Aggregated from PostgreSQL</p></>}</div><div className="flex gap-2 items-center flex-wrap"><div className="flex items-center rounded-xl border border-slate-200 bg-white p-1" aria-label="Analytics period">{[30,90,365].map(value=><button type="button" key={value} onClick={()=>setDays(value)} aria-pressed={days===value} className={`text-xs sm:text-sm font-semibold rounded-lg px-3 py-2 ${days===value?'bg-indigo-600 text-white':'text-slate-600 hover:bg-slate-100'}`}>{value===365?'1 year':`${value} days`}</button>)}</div><button title="Refresh charts" aria-label="Refresh charts" onClick={()=>setRefreshKey(k=>k+1)} className="border border-slate-200 bg-white rounded-lg p-2.5 hover:bg-indigo-50" disabled={busy}><RefreshCw size={18} className={`text-slate-500 ${busy?'animate-spin':''}`}/></button></div></div>
  {error&&<p className="error-new" role="alert">Could not load analytics: {error}</p>}
  {busy&&!data&&<p className="text-slate-500 p-7 rounded-xl border bg-white" role="status">Loading live analytics…</p>}
  {data&&<>
   {!compact&&<div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4 mb-7"><Stat label={role==='student'?'Published papers':'Total papers'} value={stats.papers} Icon={FileText}/><Stat label="Published" value={stats.published} Icon={CheckCircle2}/><Stat label="Questions in papers" value={stats.questions} Icon={BookOpen}/>{role==='student'?<Stat label="Subjects" value={stats.subjects} Icon={Layers3}/>:<><Stat label="Question bank" value={stats.bankQuestions} Icon={Layers3}/><Stat label="Custom templates" value={stats.customTemplates} Icon={Activity}/></>}</div>}
   <div className={`grid gap-5 ${compact?'lg:grid-cols-[minmax(0,2fr)_minmax(270px,1fr)]':'xl:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]'}`}><Card title="Papers created" subtitle={`New papers over the last ${days} days`}>{<Timeline points={data.timeline} grain={data.granularity}/>}</Card><Card title="Paper status" subtitle="All-time published versus drafts"><Donut published={stats.published} drafts={stats.drafts}/></Card></div>
   {!compact&&<div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3 mt-5"><Card title="Papers by subject" subtitle="Most-used subjects"><Bars data={data.subjects} label="subjects"/></Card><Card title="Question types" subtitle="Distribution across saved papers"><Bars data={data.questionTypes} label="questions"/></Card>{role!=='student'&&<Card title="Question bank difficulty" subtitle="Easy, medium and hard bank questions"><Bars data={data.bankDifficulty} label="bank questions"/></Card>}</div>}
   {busy&&<p className="text-xs text-slate-400 mt-3" role="status">Updating charts…</p>}
  </>}
 </section>
}
