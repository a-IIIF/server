import {AuthTexts} from '../../builder/elem/v2/AuthService';

export type TextItem = {
    id: string,
    itemId: string,
    type: 'transcription' | 'translation',
    language: string | null,
    encoding: string | null,
    uri: string
};

export interface IIIFMetadata {
    homepage: IIIFMetadataHomepage;
    metadata: IIIFMetadataPairs;
    seeAlso: IIIFMetadataSeeAlso;
}

export type IIIFMetadataHomepage = { id: string; label: string; }[];
export type IIIFMetadataPairs = { label: string; value: string; }[];
export type IIIFMetadataSeeAlso = { id: string; format: string; profile: string; label: string; }[];

export type AuthTextsByType = { [type: string]: AuthTexts; };
