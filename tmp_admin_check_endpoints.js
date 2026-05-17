const endpoints=['/api/admin/dashboard/kpis','/api/admin/notices','/api/admin/staff','/api/admin/booths','/api/events','/api/admin/audit-logs'];
(async()=>{
  const base='http://localhost:8080';
  const login=await (await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'0000',password:'0000'})}).then(r=>r.json()));
  console.log('login', !!login.token);
  const tok='Bearer '+login.token;
  for(const e of endpoints){
    const r=await fetch(base+e,{headers:{Authorization:tok}});
    console.log(e,r.status);
    const t=await r.text();
    console.log(t.slice(0,180));
  }
})();
