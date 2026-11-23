type SampleProperty = {property_code?: string | null; property_type?: string | null};

export default function PropertySample({property, className = ''}:{property:SampleProperty; className?:string}){
 const code=property.property_code?.toLowerCase()||'';
 const label=property.property_type||'';
 const kind=/مهر/.test(label)||code==='mehr_housing'?'mehr'
  :/زمین/.test(label)||['raw_land','land','residential_land','commercial_land'].includes(code)?'land'
  :/خانه|ویلایی|آپارتمان/.test(label)||['villa_house','villa','house','apartment'].includes(code)?'house'
  :null;
 return kind?<div className={`property-sample ${className}`}>
  <img src={`/visual/property-sample-${kind}.webp`} alt="تصویر نمونه برای نوع ملک" loading="lazy" decoding="async"/>
  <span>تصویر نمونه</span>
 </div>:<div className={className+' listing-image-empty'}>تصویری برای این ملک ثبت نشده است</div>;
}
