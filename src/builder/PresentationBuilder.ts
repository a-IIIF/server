import * as Search from './Search';
import * as Metadata from './Metadata';
import * as Digitized from './Digitized';
import * as DigitalBorn from './DigitalBorn';
import * as ImageFunctions from './Image';

import {Text} from '../lib/Text';
import {Access} from '../lib/Security';
import {FileItem, FolderItem, ImageItem, Item, MetadataItem, RootItem} from '../lib/ItemInterfaces';

import Image, {ImageProfile} from './elem/v2/Image';
import AnnotationList from './elem/v2/AnnotationList';

import Manifest from './elem/v3/Manifest';
import Collection from './elem/v3/Collection';
import AnnotationPage from './elem/v3/AnnotationPage';

import {SearchResult} from '../search/search';
import TermList from './elem/v2/TermList';
import {DerivativeType} from '../lib/Derivative';

export interface PresentationBuilder {
    isCollection: (item: Item | null) => boolean;
    isManifest: (item: Item | null) => boolean;
    getCollection: (item: Item, access: Access) => Promise<Collection | null>;
    getManifest: (item: Item, access: Access) => Promise<Manifest | null>;
    getReference: (item: Item) => Promise<Collection | Manifest | null>;
    getSearch: (searchResults: SearchResult[], query: string, ignored: string[],
                id: string, type?: string, language?: string) => Promise<AnnotationList>;
    getAutocomplete: (suggestions: string[][], query: string, ignored: string[],
                      id: string, type?: string, language?: string) => TermList;
    getImageInfo: (item: Item, derivative: DerivativeType | null,
                   profile: ImageProfile, access: Access) => Promise<Image>;
    getLogoInfo: (profile: ImageProfile) => Promise<Image>;
    getAudioInfo: (profile: ImageProfile) => Promise<Image>;
}

export const isCollection = (item: Item | null): boolean =>
    item !== null && (item.type === 'metadata' || item.type === 'folder');

export const isManifest = (item: Item | null): boolean =>
    item !== null && (item.type !== 'metadata' && item.type !== 'folder' && (!item.order || item.type === 'root'));

export async function getCollection(item: Item, access: Access): Promise<Collection | null> {
    if (item && (item.type === 'metadata'))
        return Metadata.getCollection(item as MetadataItem, builder);

    if (item && (item.type === 'folder'))
        return DigitalBorn.getCollection(item as FolderItem, access, builder);

    return null;
}

export async function getCollectionWithChildren(item: MetadataItem, children: Item[]): Promise<Collection | null> {
    return Metadata.getCollectionWithChildren(item, children, builder);
}

export async function getManifest(item: Item, access: Access): Promise<Manifest | null> {
    if (item && (item.type === 'root'))
        return Digitized.getManifest(item as RootItem);

    if (item && (item.type !== 'metadata' && item.type !== 'folder' && !item.order))
        return DigitalBorn.getManifest(item as FileItem, access);

    return null;
}

export async function getAnnotationPage(item: Item, text: Text): Promise<AnnotationPage> {
    return Digitized.getAnnotationPage(item as RootItem, text);
}

export async function getReference(item: Item): Promise<Collection | Manifest | null> {
    if (item && (item.type === 'metadata'))
        return Metadata.getReference(item as MetadataItem);

    if (item && (item.type === 'root'))
        return Digitized.getReference(item as RootItem);

    if (item && ((item.type === 'folder') || !item.order))
        return DigitalBorn.getReference(item as FileItem);

    return null;
}

export async function getSearch(searchResults: SearchResult[], query: string, ignored: string[],
                                id: string, type?: string, language?: string | null): Promise<AnnotationList> {
    return Search.getAnnotationList(searchResults, query, ignored, id, type, language);
}

export function getAutocomplete(suggestions: string[][], query: string, ignored: string[],
                                id: string, type?: string, language?: string | null): TermList {
    return Search.getAutocomplete(suggestions, query, ignored, id, type, language);
}

export async function getImageInfo(item: Item, derivative: DerivativeType | null,
                                   profile: ImageProfile, access: Access) {
    return ImageFunctions.getInfo(item, derivative, profile, access.tier);
}

export async function getLogoInfo(profile: ImageProfile) {
    return ImageFunctions.getLogoInfo(profile);
}

export async function getAudioInfo(profile: ImageProfile) {
    return ImageFunctions.getAudioInfo(profile);
}

const builder: PresentationBuilder = {
    isCollection,
    isManifest,
    getCollection,
    getManifest,
    getReference,
    getSearch,
    getAutocomplete,
    getImageInfo,
    getLogoInfo,
    getAudioInfo
};