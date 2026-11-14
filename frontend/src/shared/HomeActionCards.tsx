import HomeMapSection from './HomeMapSection';
export default function HomeActionCards({onRegister,onMap}:{onRegister:()=>void;onMap:()=>void}){
 return <div className="content-section home-actions-row"><section className="home-action-card seller-action-card"><figure className="home-action-picture"><img src="/visual/sell-property-symbol-v1.webp" width="1663" height="945" loading="lazy" decoding="async" alt="تصویر نمادین ثبت ملک برای فروش؛ خانه، کلید و فرم ثبت"/></figure><div className="home-action-copy"><span className="section-kicker">برای فروشندگان</span><h2>ملک خود را جهت فروش ثبت کنید</h2><button type="button" className="home-action-primary" onClick={onRegister}>ثبت ملک</button></div></section><HomeMapSection onFullMap={onMap}/></div>
}
