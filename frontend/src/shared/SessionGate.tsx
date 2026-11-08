import type {ReactNode} from 'react';
export default function SessionGate({loading,error,retry,children}:{loading:boolean;error:string;retry:()=>void;children:ReactNode}){
 if(loading)return <section className="content-section"><p className="state-message" role="status">در حال بررسی حساب کاربری…</p></section>;
 if(error)return <section className="content-section"><div className="state-message" role="alert"><p>{error}</p><button type="button" onClick={retry}>بررسی دوبارهٔ حساب</button></div></section>;
 return children;
}
