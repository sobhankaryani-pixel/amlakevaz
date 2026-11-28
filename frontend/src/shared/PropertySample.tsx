import { propertySamplePhoto, type SampleProperty } from './propertySamplePhotos';

export default function PropertySample({property, className = ''}:{property:SampleProperty; className?:string}){
 const photo = propertySamplePhoto(property);
 return photo?<div className={`property-sample ${className}`}>
  <img src={photo} alt="تصویر نمونه برای نوع ملک" loading="lazy" decoding="async"/>
  <span>تصویر نمونه</span>
 </div>:<div className={className+' listing-image-empty'}>تصویری برای این ملک ثبت نشده است</div>;
}
