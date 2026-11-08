export type Audience='seller'|'agency';
export const RESET_KEY='evaz:private-reset:v1';
const prefixes=['evaz:seller-draft:v1:','evaz-agency:'];
type Store=Pick<Storage,'length'|'key'|'getItem'|'setItem'|'removeItem'>;
function browserStore(name:'localStorage'|'sessionStorage'):Store|undefined{try{return globalThis[name]}catch{return undefined}}
function keys(store:Store){const result:string[]=[];for(let i=0;i<store.length;i++){const k=store.key(i);if(k)result.push(k)}return result}
export function draftEpoch(store=browserStore('localStorage')){try{return store?.getItem(RESET_KEY)||''}catch{return ''}}
export function clearPrivateData(role:Audience,local=browserStore('localStorage'),session=browserStore('sessionStorage'),notify=true){
 let cleared=true;
 // The marker contains no identity. Writers from an older mounted form stop immediately.
 try{if(local&&notify)local.setItem(RESET_KEY,JSON.stringify({role,nonce:crypto.randomUUID()}))}catch{cleared=false}
 for(const store of [local,session]){if(!store)continue;try{for(const key of keys(store))if(key.startsWith(role==='seller'?prefixes[0]:prefixes[1])||(notify&&key==='evaz:seller-otp:v1'))store.removeItem(key)}catch{cleared=false}}
 return cleared;
}
export function prunePrivateDrafts(role:Audience,userId:string,store=browserStore('localStorage'),now=Date.now()){
 if(!store)return;const prefix=role==='seller'?prefixes[0]:prefixes[1],own=prefix+userId+(role==='agency'?':':'');
 try{for(const key of keys(store)){if(!key.startsWith(prefix))continue;
  if(role==='seller'?key!==own&&key!==own+':request-id':!key.startsWith(own)){store.removeItem(key);continue}
  try{const data=JSON.parse(store.getItem(key)||'null');const valid=key.endsWith(':request-id')?data&&Number.isFinite(data.expires)&&data.expires>now:data&&Number.isFinite(data.savedAt)&&data.savedAt<=now+60000&&now-data.savedAt<=7*86400000;if(!valid)store.removeItem(key)}catch{store.removeItem(key)}
 }}catch{}
}
export function installPrivatePageGuard(){
 if(typeof window==='undefined')return()=>{};
 const reset=(event:StorageEvent)=>{if(event.key===RESET_KEY&&event.newValue){try{globalThis.sessionStorage.removeItem('evaz:seller-otp:v1')}catch{}window.location.reload()}else if(event.key==='evazmelk_admin_token'&&event.oldValue!==event.newValue)window.location.reload()};
 const restored=(event:PageTransitionEvent)=>{if(event.persisted&&/^\/(account|register|agency|management)(\/|$)/.test(window.location.pathname))window.location.reload()};
 window.addEventListener('storage',reset);window.addEventListener('pageshow',restored);
 return()=>{window.removeEventListener('storage',reset);window.removeEventListener('pageshow',restored)};
}
