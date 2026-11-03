// Both roles are authenticated by the backend. Never fall back on network/server errors.
export async function authenticatePanel(username:string,password:string,request:typeof fetch){
 const body=JSON.stringify({username:username.trim(),password});
 const options:RequestInit={method:'POST',headers:{'Content-Type':'application/json'},body};
 const admin=await request('https://backend.evazmelk.ir/api/auth/login',options);
 if(admin.ok){const data=await admin.json();if(typeof data.access_token!=='string'||!['owner','admin','data_entry','analyst','editor','viewer'].includes(data.role))throw Error('پاسخ ورود معتبر نیست.');return {kind:'admin' as const,token:data.access_token};}
 if(admin.status!==401)throw Error(admin.status===429?'تعداد تلاش‌های ورود زیاد است؛ کمی بعد دوباره تلاش کنید.':'ورود انجام نشد؛ دوباره تلاش کنید.');
 const agency=await request('https://backend.evazmelk.ir/api/agency/login',{...options,credentials:'include'});
 if(!agency.ok)throw Error(agency.status===401?'نام کاربری یا رمز عبور نادرست است.':agency.status===429?'تعداد تلاش‌های ورود زیاد است؛ کمی بعد دوباره تلاش کنید.':'ورود انجام نشد؛ دوباره تلاش کنید.');
 const data=await agency.json();if(!data.user?.id)throw Error('پاسخ ورود معتبر نیست.');
 return {kind:'agency' as const,user:data.user};
}
