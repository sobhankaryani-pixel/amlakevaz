import {validPoints,type Point} from './marketData';
export const MARKET_WINDOWS=[1,3,6,12] as const;
export type MarketWindow=typeof MARKET_WINDOWS[number];
function monthIndex(period:string){
 const match=/^(\d{4})\/(\d{2})$/.exec(period);
 if(!match||Number(match[2])<1||Number(match[2])>12)return null;
 return Number(match[1])*12+Number(match[2])-1;
}
export function latestPeriod(series:Record<string,Point[]>){
 return Object.values(series).flatMap(validPoints).map(p=>p.period).filter(p=>monthIndex(p)!==null).sort().at(-1)||'';
}
// Include the starting month as the comparison baseline: one month = two endpoints.
// Missing months remain missing; never interpolate or substitute another segment.
export function windowPoints(points:Point[],months:MarketWindow,endPeriod:string){
 const end=monthIndex(endPeriod);if(end===null)return [];
 return validPoints(points).filter(p=>{const month=monthIndex(p.period);return month!==null&&month>=end-months&&month<=end});
}
export function windowChange(points:Point[]){
 const data=validPoints(points),first=data[0],last=data.at(-1);
 if(!first||!last||data.length<2)return {label:'—',tone:'none',detail:'برای محاسبهٔ تغییر، حداقل دو ماهِ دارای قیمت لازم است.'};
 const delta=(Number(last.value_toman)/Number(first.value_toman)-1)*100;
 const rounded=Math.round(Math.abs(delta)*10)/10;
 return {label:`${delta>0?'+':delta<0?'−':''}${rounded.toLocaleString('fa-IR',{maximumFractionDigits:1})}٪`,tone:delta>0?'up':delta<0?'down':'flat',detail:`تغییر از ${first.period} تا ${last.period}`};
}
export function pointMonth(period:string){return monthIndex(period)??0}
