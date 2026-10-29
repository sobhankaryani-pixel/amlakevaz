import type {Point} from './marketData';

type Region={name:string;slug:string};
export type PriceSeriesResult={regions:Region[];series:Record<string,Point[]>};

// One request per region for this page visit, shared across dashboard mounts.
// Reloading the page starts a fresh cache; failed requests can be retried.
const requests=new Map<string,Promise<PriceSeriesResult>>();
export function getPriceSeries(region:string):Promise<PriceSeriesResult>{
 const cached=requests.get(region);
 if(cached)return cached;
 const request=fetch(`https://api.evazmelk.ir/api/public/price-series?region=${encodeURIComponent(region)}`)
  .then(async response=>{
   if(!response.ok)throw new Error('Price request failed');
   return response.json() as Promise<PriceSeriesResult>;
  }).catch(error=>{requests.delete(region);throw error});
 requests.set(region,request);
 return request;
}
