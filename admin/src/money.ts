export function moneyDigits(value:string){return value.replace(/[۰-۹٠-٩]/g,c=>String(c.charCodeAt(0)-(c>='۰'&&c<='۹'?1776:1632))).replace(/[^0-9]/g,'').replace(/^0+(?=\d)/,'').slice(0,16)}
export function formatMoney(value:string|number){const raw=moneyDigits(String(value));return raw.replace(/\B(?=(\d{3})+(?!\d))/g,'٬')}
export function areaField(kind:string){return kind==='shop'?'commercial_area_m2':['apartment','mehr','national'].includes(kind)?'building_area_m2':'area_m2'}
export function priceUpdate<T extends Record<string,string>>(form:T,key:string,value:string):T{
 const next={...form,[key]:key==='asking_price_toman'||key==='price_per_m2_toman'?moneyDigits(value):value} as Record<string,string>;
 if(key==='asking_price_toman')next.price_basis='total';
 if(key==='price_per_m2_toman')next.price_basis='unit';
 next.price_error='';
 const anchor=Number(next.price_basis==='unit'?next.price_per_m2_toman:next.asking_price_toman);
 if(!Number.isFinite(anchor)||anchor>9000000000000000){next.price_error='مبلغ واردشده بیش از حد مجاز است.';return next as T}
 const area=Number(next[areaField(next.kind)]);
 if(!Number.isFinite(area)||area<=0)return next as T;
 if(next.price_basis==='unit'){const total=Math.round(Number(next.price_per_m2_toman)*area);if(!Number.isFinite(total)||total>9000000000000000){next.asking_price_toman='';next.price_error='قیمت کل محاسبه‌شده بیش از حد مجاز است.'}else next.asking_price_toman=next.price_per_m2_toman?String(total):'';}
 else next.price_per_m2_toman=next.asking_price_toman?String(Math.round(Number(next.asking_price_toman)/area)):'';
 return next as T;
}
export function priceText(key:string,value:unknown){return /(?:price|budget|value).*toman/.test(key)&&value!=null&&value!==''?formatMoney(String(value))+' تومان':String(value??'')}
