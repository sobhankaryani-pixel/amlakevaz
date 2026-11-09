import {useLayoutEffect,useRef,type InputHTMLAttributes} from 'react';
import {formatMoney,moneyDigits} from './money';
type Props=Omit<InputHTMLAttributes<HTMLInputElement>,'value'|'onChange'|'type'> & {value:string;onValue:(value:string)=>void};
export default function MoneyInput({value,onValue,...props}:Props){
 const ref=useRef<HTMLInputElement>(null),caret=useRef<number|null>(null);const formatted=formatMoney(value);
 useLayoutEffect(()=>{if(caret.current==null||!ref.current)return;let n=caret.current,pos=0;while(pos<formatted.length&&n>0){if(/[0-9]/.test(formatted[pos]))n--;pos++}ref.current.setSelectionRange(pos,pos);caret.current=null});
 return <input {...props} ref={ref} type="text" inputMode="numeric" dir="ltr" value={formatted} onChange={e=>{caret.current=moneyDigits(e.target.value.slice(0,e.target.selectionStart??e.target.value.length)).length;onValue(moneyDigits(e.target.value))}}/>;
}
