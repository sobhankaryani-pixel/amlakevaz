import {metadataTags,structuredText,type SeoMetadata} from './seoMetadata.js';
export function applyMetadata(metadata:SeoMetadata){
 document.title=metadata.title;
 for(const [attribute,key,value] of metadataTags(metadata)){
  const matches=Array.from(document.head.querySelectorAll<HTMLMetaElement>(`meta[${attribute}="${key}"]`));
  const element=matches.shift()||document.createElement('meta');
  matches.forEach(node=>node.remove());element.setAttribute(attribute,key);element.content=value;
  if(!element.parentNode)document.head.appendChild(element);
 }
 const links=Array.from(document.head.querySelectorAll<HTMLLinkElement>('link[rel="canonical"]'));
 const canonical=links.shift()||document.createElement('link');links.forEach(node=>node.remove());canonical.rel='canonical';canonical.href=metadata.url;
 if(!canonical.parentNode)document.head.appendChild(canonical);
 for(const script of document.head.querySelectorAll('script[type="application/ld+json"]')){
  let owned=script.id==='evaz-property-jsonld';
  try{owned ||= JSON.parse(script.textContent||'{}')['@type']==='RealEstateListing'}catch{}
  if(owned)script.remove();
 }
 if(metadata.structured){const script=document.createElement('script');script.id='evaz-property-jsonld';script.type='application/ld+json';script.textContent=structuredText(metadata.structured);document.head.appendChild(script)}
}
