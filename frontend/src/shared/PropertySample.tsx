import {useState} from 'react';
import './property-sample.css';
type SampleProperty = {land_frontage?:string|null; public_code?:string|null; usage_type?:string|null; property_code?: string | null; property_type?: string | null};

// Initial rotation for the posted batch, newest first within each sample pool.
const batchRotation:Record<string,string[]> = {
 residential: ['40','39','37','36','35','34','33','32','31','30','26','25','24','23','22','21','20'],
 through: ['38','28','27'],
 villa: ['15','14'],
 garden: ['19','18','17','16'],
 apartment: ['12','11'],
};

export default function PropertySample({property, className = '', changeable=false}:{property:SampleProperty; className?:string; changeable?:boolean}){
 const code=property.property_code?.toLowerCase()||'';
 const label=property.property_type||'';
 const kind=code==='urban_garden'||/باغ شهری/.test(label)?'garden'
  :/مهر/.test(label)||code==='mehr_housing'?'mehr'
  :/زمین/.test(label)||['raw_land','land','residential_land','commercial_land'].includes(code)?'land'
  :/خانه|ویلایی|آپارتمان/.test(label)||['villa_house','villa','house','apartment'].includes(code)?'house'
  :null;
 const residential=kind==='land'&&code!=='commercial_land'&&
  (property.usage_type==='مسکونی'||(!property.usage_type&&(code==='residential_land'||/مسکونی/.test(label))));
 const villa=kind==='house'&&(['villa_house','villa','house'].includes(code)||/ویلایی/.test(label));
 const hash=Array.from(property.public_code||'').reduce((value,char)=>Math.imul(value,31)+char.charCodeAt(0)|0,0);
 const apartment=kind==='house'&&!villa&&(code==='apartment'||/آپارتمان/.test(label));
 const pool=residential
  ?property.land_frontage==='through'?'through':property.land_frontage==='corner'?'corner':property.land_frontage==='single'?'residential':null
  :villa?'villa':kind==='garden'?'garden':apartment?'apartment':null;
 const range=pool?({through:[9,2],corner:[7,2],residential:[1,6],villa:[1,4],garden:[1,4],apartment:[1,2]}[pool]):null;
 const position=pool?(batchRotation[pool]?.indexOf(property.public_code||'')??-1):-1;
 const initial=position>=0?position:hash>>>0;
 const storageKey=property.public_code?`evaz:property-sample:${position>=0?'batch:':''}${property.public_code}`:null;
 const [offset,setOffset]=useState(()=>{
  if(!storageKey)return 0;
  try{return Number(localStorage.getItem(storageKey))>>>0}catch{return 0}
 });
 const sample=range?`${residential?'residential':pool}-${range[0]+(initial+offset)%range[1]}`:kind;
 function next(){
  const value=(offset+1)>>>0;
  setOffset(value);
  if(storageKey)try{localStorage.setItem(storageKey,String(value))}catch{}
 }
 return kind?<><div className={`property-sample ${className}`}>
  <img src={`/visual/property-sample-${sample}.webp`} alt="تصویر نمونه برای نوع ملک" loading="lazy" decoding="async"/>
  <span>تصویر نمونه</span>
 </div>{changeable&&range&&<button type="button" className="change-property-sample" onClick={next}>تغییر عکس نمونه</button>}</>:<div className={className+' listing-image-empty'}>تصویری برای این ملک ثبت نشده است</div>;
}
