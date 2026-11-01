export const RESIDENCE_CITIES=['اوز','کهنه','کهنه جدید','قلات','اسلام آباد','گلار','کوره','بیدشهر','هود','هیرم','فیشور','محلچه','گراش','لار'] as const;
export function validResidenceCity(value:unknown):value is string{return typeof value==='string'&&(RESIDENCE_CITIES as readonly string[]).includes(value)}
