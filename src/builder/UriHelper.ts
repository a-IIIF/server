import config from '../lib/Config';

const prefixPresentationUrl = `${config.baseUrl}/iiif/presentation`;
const prefixImageUrl = `${config.baseUrl}/iiif/image`;
const prefixSearchUrl = `${config.baseUrl}/iiif/search`;
const prefixAuthUrl = `${config.baseUrl}/iiif/auth`;
const prefixFileUrl = `${config.baseUrl}/file`;
const prefixIconUrl = `${config.baseUrl}/file-icon`;
const prefixTextUrl = `${config.baseUrl}/text`;

const annoType = (type?: string, language?: string | null) => type ? '/' + type + (language ? '_' + language : '') : '';

export const collectionUri = (id: string) => `${prefixPresentationUrl}/collection/${id}`;
export const manifestUri = (id: string) => `${prefixPresentationUrl}/${id}/manifest`;
export const canvasUri = (id: string, page: number) => `${prefixPresentationUrl}/${id}/canvas/${page}`;
export const annoPageUri = (id: string, childId: string) => `${prefixPresentationUrl}/${id}/annopage/${childId}`;
export const annoCollUri = (id: string, type: string, language?: string | null) =>
    `${prefixPresentationUrl}/annocoll/${id}${annoType(type, language)}`;
export const annoUri = (id: string, childId: string, page: number = 0) =>
    `${prefixPresentationUrl}/${id}/annotation/${childId}/${page}`;

export const imageUri = (id: string, tier?: string) =>
    `${prefixImageUrl}/${id}${tier ? config.imageTierSeparator + tier : ''}`;
export const imageResourceUri =
    (id: string, tier?: string,
     {region = 'full', size = 'max', rotation = '0', quality = 'default', format = 'jpg'}: { [_: string]: string } = {}) =>
        `${imageUri(id, tier)}/${region}/${size}/${rotation}/${quality}.${format}`;

export const searchUri = (id: string, type?: string, language?: string | null) =>
    `${prefixSearchUrl}/${id}${annoType(type, language)}`;
export const searchAnnoUri = (id: string, type?: string, language?: string | null, page: number | string = 0) =>
    `${searchUri(id, type, language)}/anno/${page}`;
export const autocompleteUri = (id: string, type?: string, language?: string | null) =>
    `${prefixSearchUrl}/autocomplete/${id}${annoType(type, language)}`;

export const authUri = (type: string) => `${prefixAuthUrl}/${type}`;

export const fileUri = (id: string) => `${prefixFileUrl}/${id}`;
export const accessUri = (id: string) => `${fileUri(id)}/access`;
export const originalUri = (id: string) => `${fileUri(id)}/original`;
export const derivativeUri = (id: string, type: string) => `${fileUri(id)}/${type}`;

export const iconUri = (icon: string) => `${prefixIconUrl}/${icon}.svg`;

export const textUri = (id: string) => `${prefixTextUrl}/${id}`;
