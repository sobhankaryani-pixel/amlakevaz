export type Attribution = {source?:string;medium?:string;campaign?:string;referrer?:string};
export function cleanAttribution(value:unknown):Attribution;
export function attributionFor(search:string,referrer:string,prior:Attribution|null):Attribution;
export function campaignChanged(prior:Attribution|null,next:Attribution):boolean;
