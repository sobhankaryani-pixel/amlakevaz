// The iframe owns a real narrow viewport, so the site's existing responsive
// styles, matchMedia queries and sticky navigation work without duplicate UI.
const device=document.querySelector('#device'),page=document.querySelector('#page'),fit=document.querySelector('#fit');
const frame=document.querySelector('#site'),phone=document.querySelector('#phone'),slot=document.querySelector('#slot');
const toolbar=document.querySelector('.preview-toolbar'),hint=document.querySelector('.preview-hint');
const dimensions=document.querySelector('#dimensions'),status=document.querySelector('#status');
const presets=new Set(['360x800','390x844','430x932']);
const pages=new Set(Array.from(page.options,option=>option.value));
const params=new URLSearchParams(location.search);
if(presets.has(params.get('size')))device.value=params.get('size');
fit.checked=params.get('fit')!=='0';

function safePage(value){
  if(typeof value!=='string'||!value.startsWith('/')||value.startsWith('//'))return '/';
  try{
    const url=new URL(value,location.origin);
    if(url.origin!==location.origin)return '/';
    const path=url.pathname.replace(/\/$/,'')||'/';
    if(!pages.has(path)&&!/^\/properties\/[^/]+$/.test(path))return '/';
    return path+url.search+url.hash;
  }catch{return '/'}
}
let currentPage=safePage(params.get('page')||'/'),unbind=()=>{};
function remember(){
  const url=new URL(location.href);url.search='';
  url.searchParams.set('page',currentPage);url.searchParams.set('size',device.value);
  if(!fit.checked)url.searchParams.set('fit','0');
  history.replaceState(null,'',url.pathname+url.search);
}
function selectCurrentPage(){
  const path=new URL(currentPage,location.origin).pathname;
  const previous=page.querySelector('option[data-current]');if(previous)previous.remove();
  if(pages.has(path))page.value=path;
  else{const option=new Option('آگهی فعلی',currentPage);option.dataset.current='true';page.add(option);page.value=currentPage}
}
function layout(){
  const [width,height]=device.value.split('x').map(Number),outerWidth=width+16,outerHeight=height+16;
  const availableWidth=Math.max(100,document.documentElement.clientWidth-32);
  const availableHeight=Math.max(120,window.innerHeight-toolbar.getBoundingClientRect().height-hint.getBoundingClientRect().height-80);
  const scale=fit.checked?Math.min(1,availableWidth/outerWidth,availableHeight/outerHeight):1;
  phone.style.width=outerWidth+'px';phone.style.height=outerHeight+'px';phone.style.transform=`scale(${scale})`;
  slot.style.width=outerWidth*scale+'px';slot.style.height=outerHeight*scale+'px';
  dimensions.textContent=`${width} × ${height} px · ${Math.round(scale*100)}%`;
}
function openPage(value){
  currentPage=safePage(value);selectCurrentPage();remember();status.textContent='در حال باز کردن سایت…';frame.src=currentPage;
}
function syncPage(){
  try{
    const child=frame.contentWindow.location;
    if(child.origin!==location.origin)return;
    currentPage=safePage(child.pathname+child.search+child.hash);selectCurrentPage();remember();
    status.textContent='آمادهٔ مشاهده و اسکرین‌شات';
  }catch{status.textContent='برای ادامه، یکی از صفحات بالا را انتخاب کن.'}
}
frame.addEventListener('load',()=>{
  unbind();syncPage();
  try{
    const child=frame.contentWindow;
    // Phones use overlay scrollbars. Hide the desktop scrollbar only inside
    // this preview so it does not take space away from the mobile layout.
    const scrollbars=child.document.createElement('style');
    scrollbars.textContent='html{scrollbar-width:none}html::-webkit-scrollbar{display:none}';
    child.document.head.append(scrollbars);
    child.addEventListener('evaz:navigate',syncPage);child.addEventListener('popstate',syncPage);child.addEventListener('hashchange',syncPage);
    // Search filters use replaceState. Read the resulting URL after the normal
    // control event, without replacing or altering the application's history API.
    const afterControl=()=>requestAnimationFrame(syncPage);
    child.document.addEventListener('change',afterControl);child.document.addEventListener('submit',afterControl);
    unbind=()=>{try{child.removeEventListener('evaz:navigate',syncPage);child.removeEventListener('popstate',syncPage);child.removeEventListener('hashchange',syncPage);child.document.removeEventListener('change',afterControl);child.document.removeEventListener('submit',afterControl)}catch{}};
  }catch{}
});
page.addEventListener('change',()=>openPage(page.value));
device.addEventListener('change',()=>{layout();remember()});fit.addEventListener('change',()=>{layout();remember()});
document.querySelector('#reload').addEventListener('click',()=>openPage(currentPage));
document.querySelector('#copy').addEventListener('click',async()=>{
  syncPage();remember();
  try{await navigator.clipboard.writeText(location.href);status.textContent='لینک همین صفحه و اندازه کپی شد.'}
  catch{status.textContent='لینک را از نوار آدرس مرورگر کپی کن.'}
});
window.addEventListener('resize',layout);
if('ResizeObserver' in window)new ResizeObserver(layout).observe(toolbar);
layout();openPage(currentPage);
