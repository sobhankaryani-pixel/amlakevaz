export type SampleProperty = {
 public_code?: string | null;
 property_code?: string | null;
 property_type?: string | null;
 sample_photo_index?: number | null;
 sample_land_fronts?: number | null;
};

const photos = {
 land: ['land', 'land-2', 'land-3', 'land-4', 'land-5', 'land-6'],
 cornerLand: ['land-corner-1', 'land-corner-2'],
 threeFrontLand: ['land-three-fronts-1', 'land-three-fronts-2'],
 house: ['house', 'house-2', 'house-3', 'house-4'],
 mehr: ['mehr', 'mehr-2'],
 garden: ['garden', 'garden-2'],
};

export function propertySamplePhoto(property: SampleProperty) {
 const code = property.property_code?.toLowerCase() || '';
 const label = property.property_type || '';
 let options: string[];
 if (code === 'urban_garden' || /باغ شهری/.test(label)) options = photos.garden;
 else if (code === 'mehr_housing' || /مهر/.test(label)) options = photos.mehr;
 else if (['raw_land', 'land', 'residential_land', 'commercial_land'].includes(code) || /زمین/.test(label)) {
  options = property.sample_land_fronts === 3 ? photos.threeFrontLand
   : property.sample_land_fronts === 2 ? photos.cornerLand : photos.land;
 } else if (['villa_house', 'villa', 'house', 'apartment'].includes(code) || /خانه|ویلایی|آپارتمان/.test(label)) options = photos.house;
 else return null;

 let seed = 0;
 for (const character of property.public_code || '') {
  seed = (seed * 10 + (/^[0-9]$/.test(character) ? Number(character) : character.charCodeAt(0))) % options.length;
 }
 const index = (seed + (property.sample_photo_index || 0)) % options.length;
 return `/visual/property-sample-${options[index]}.webp`;
}
