import HeaderIcon from '../shared/HeaderIcon';
import './desktop-home.css';

type Props = {
 onSearch: () => void;
 onMap: () => void;
};

export default function DesktopHomeHero({onSearch,onMap}:Props){
 return <section className="desktop-home-hero" aria-labelledby="desktop-home-title">
  <picture className="desktop-home-hero-media">
   <source media="(min-width:1250px)" srcSet="/visual/evaz-urban-banner-wide.webp" width="1920" height="480"/>
   <img src="/visual/evaz-urban-banner-standard.webp" alt="" width="1440" height="480" fetchPriority="high"/>
  </picture>
  <div className="desktop-home-hero-copy">
   <p className="desktop-home-eyebrow">املاک خودمونی · ویژهٔ اوز</p>
   <h1 id="desktop-home-title">بازار املاک اوز،<br/> <em>شفاف‌تر</em> از همیشه</h1>
   <p className="desktop-home-subtitle">از جست‌وجوی ملک تا انتخابی مطمئن</p>
   <div className="desktop-home-hero-actions">
    <button type="button" onClick={onSearch}><HeaderIcon name="search"/>جست‌وجوی ملک</button>
    <button type="button" onClick={onMap}><HeaderIcon name="areas"/>املاک روی نقشه</button>
   </div>
  </div>
 </section>;
}
