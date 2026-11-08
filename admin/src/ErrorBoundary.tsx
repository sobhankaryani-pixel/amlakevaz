import {Component,type ErrorInfo,type ReactNode} from 'react';
export default class ErrorBoundary extends Component<{children:ReactNode},{failed:boolean}>{
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true}}
 componentDidCatch(error:Error,info:ErrorInfo){console.error('Application rendering failed',error,info.componentStack)}
 render(){return this.state.failed?<section className="app-recovery" dir="rtl" role="alert"><h1>نمایش صفحه با مشکل روبه‌رو شد</h1><p>صفحه را دوباره باز کنید. اگر مشکل ادامه داشت با ما تماس بگیرید.</p><button type="button" onClick={()=>window.location.reload()}>تلاش مجدد</button><a href="/">صفحهٔ اصلی</a><a href="tel:09212745755">تماس با ما</a></section>:this.props.children}
}
