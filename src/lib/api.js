const ROOT = import.meta.env.VITE_API_URL || '/api'
export async function api(path,{method='GET',body,...opts}={}){
 const response=await fetch(`${ROOT}${path}`,{method,credentials:'include',headers:{'X-QPaper-Request':'1',...(body instanceof FormData?{}:{'Content-Type':'application/json'})},body:body instanceof FormData?body:body===undefined?undefined:JSON.stringify(body),...opts})
 const data=await response.json().catch(()=>({}))
 if(!response.ok)throw new Error(data.error||`Request failed (${response.status})`)
 return data
}
