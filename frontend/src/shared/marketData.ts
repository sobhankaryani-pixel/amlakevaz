export type Point={period:string;value_toman:number;count:number|null};
export function validPoints(points:Point[]):Point[]{
 return points.filter(p=>p.value_toman!=null&&Number.isFinite(Number(p.value_toman))&&Number(p.value_toman)>0).slice().sort((a,b)=>a.period.localeCompare(b.period));
}
export function changeInfo(points:Point[]){
 const data=validPoints(points);
 if(data.length<2)return {label:'—',tone:'none',detail:'برای محاسبهٔ تغییر، حداقل دو دورهٔ معتبر لازم است.'};
 const previous=data[data.length-2],latest=data[data.length-1];
 const change=(Number(latest.value_toman)/Number(previous.value_toman)-1)*100;
 const rounded=Math.round(Math.abs(change)*10)/10;
 return {label:`${change>0?'+':change<0?'−':''}${rounded.toLocaleString('fa-IR',{maximumFractionDigits:1})}٪`,tone:change>0?'up':change<0?'down':'flat',detail:`تغییر از ${previous.period} تا ${latest.period}`};
}
