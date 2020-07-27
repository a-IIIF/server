import {existsSync} from 'fs';

import {IIIFMetadata} from '../service/util/types';

import config from '../lib/Config';
import {Text} from '../lib/Text';
import derivatives from '../lib/Derivative';
import {runTaskWithResponse} from '../lib/Task';
import {IIIFMetadataParams} from '../lib/Service';
import getPronomInfo, {PronomInfo} from '../lib/Pronom';
import {getFullDerivativePath, getItem} from '../lib/Item';
import {Item, FileItem, ImageItem, RootItem} from '../lib/ItemInterfaces';
import {getAuthTexts, getEnabledAuthServices, requiresAuthentication} from '../lib/Security';

import Base from './elem/v3/Base';
import Manifest from './elem/v3/Manifest';
import Collection from './elem/v3/Collection';
import Canvas from './elem/v3/Canvas';
import Resource from './elem/v3/Resource';
import Service from './elem/v3/Service';
import Annotation from './elem/v3/Annotation';
import AnnotationPage from './elem/v3/AnnotationPage';
import AuthService from './elem/v3/AuthService';

import {
    annoPageUri,
    annoUri, authUri,
    canvasUri,
    collectionUri,
    derivativeUri,
    fileUri,
    imageResourceUri,
    imageUri,
    manifestUri
} from './UriHelper';

export function createMinimalCollection(item: Item, label?: string): Collection {
    return new Collection(collectionUri(item.id), label || item.label);
}

export function createMinimalManifest(item: Item, label?: string): Manifest {
    return new Manifest(manifestUri(item.id), label || item.label);
}

export function createMinimalAnnotationPage(item: Item, text: Text): AnnotationPage {
    return new AnnotationPage(annoPageUri(item.id, text.id));
}

export async function createCollection(item: Item, label?: string): Promise<Collection> {
    const collection = createMinimalCollection(item, label);
    await setBaseDefaults(collection, item);

    return collection;
}

export async function createManifest(item: Item, label?: string): Promise<Manifest> {
    const manifest = createMinimalManifest(item, label);
    await setBaseDefaults(manifest, item);

    return manifest;
}

export function createAnnotationPage(item: Item, text: Text): AnnotationPage {
    const annotationPage = createMinimalAnnotationPage(item, text);
    annotationPage.setContext();

    return annotationPage;
}

export async function createCanvas(item: FileItem, parentItem: Item, setAuth: boolean = false): Promise<Canvas> {
    const canvas = new Canvas(canvasUri(parentItem.id, item.order || 0), item.width, item.height, item.duration);
    const annoPage = new AnnotationPage(annoPageUri(parentItem.id, item.id));
    canvas.setItems(annoPage);

    const resource = await getResource(item, setAuth);
    const annotation = new Annotation(annoUri(parentItem.id, item.id), resource);
    annoPage.setItems(annotation);
    annotation.setCanvas(canvas);

    addDerivatives(annotation, item);

    return canvas;
}

export async function getResource(item: FileItem, setAuth: boolean = false): Promise<Resource> {
    if (item.type === 'image')
        return await getImageResource(item as ImageItem, 'full', setAuth);

    const accessPronomData = item.access.puid ? getPronomInfo(item.access.puid) : null;
    const originalPronomData = item.original.puid ? getPronomInfo(item.original.puid) : null;
    const defaultMime = accessPronomData ? accessPronomData.mime : (originalPronomData as PronomInfo).mime;

    const resource = new Resource(fileUri(item.id), getType(item.type), defaultMime, item.width, item.height, item.duration);
    setAuth && await setAuthServices(resource, item);

    return resource;
}

export async function addThumbnail(base: Base, item: RootItem | FileItem): Promise<void> {
    const resource = await getImageResource(item, '200,');
    base.setThumbnail(resource);
}

export async function addMetadata(base: Base, root: Item): Promise<void> {
    if (root.authors.length > 0) {
        const authors: { [type: string]: string[] } = root.authors.reduce((acc: { [type: string]: string[] }, author) => {
            acc[author.type] ? acc[author.type].push(author.name) : acc[author.type] = [author.name];
            return acc;
        }, {});
        Object.keys(authors).forEach(type => base.setMetadata(type, authors[type]));
    }

    if (root.dates.length > 0)
        base.setMetadata('Dates', root.dates);

    if (root.physical)
        base.setMetadata('Physical description', String(root.physical));

    if (root.description)
        base.setMetadata('Description', root.description);

    root.metadata.forEach(md => base.setMetadata(md.label, md.value));

    const md = await runTaskWithResponse<IIIFMetadataParams, IIIFMetadata>('iiif-metadata', {item: root});
    if (md.homepage && md.homepage.length > 0)
        base.setHomepage(md.homepage);

    if (md.metadata && md.metadata.length > 0)
        md.metadata.forEach(metadata => base.setMetadata(metadata.label, metadata.value));

    if (md.seeAlso && md.seeAlso.length > 0)
        base.setSeeAlso(md.seeAlso);
}

export function getType(type: string): string {
    switch (type) {
        case 'image':
            return 'Image';
        case 'audio':
            return 'Sound';
        case 'video':
            return 'Video';
        case 'pdf':
            return 'Text';
        default:
            return 'Dataset';
    }
}

async function setBaseDefaults(base: Base, item: Item): Promise<void> {
    addDefaults(base);

    if (item.description)
        base.setSummary(item.description);

    if (item.parent_id) {
        const parentItem = await getItem(item.parent_id);
        if (parentItem)
            base.setParent(collectionUri(parentItem.id), 'Collection', parentItem.label);
    }
}

async function getImageResource(item: RootItem | FileItem, size = 'max', setAuth: boolean = false): Promise<Resource> {
    const width = (size === 'full' || size === 'max') ? item.width : null;
    const height = (size === 'full' || size === 'max') ? item.height : null;

    const resource = new Resource(imageResourceUri(item.id, undefined, {size}), 'Image', 'image/jpeg', width, height);
    const service = new Service(imageUri(item.id), Service.IMAGE_SERVICE_2, 'http://iiif.io/api/image/2/level2.json');
    resource.setService(service);
    setAuth && await setAuthServices(service, item);

    return resource;
}

function getLogo(size = 'max'): Resource {
    let [width, height] = config.logoDimensions as [number | null, number | null];
    width = (size === 'full' || size === 'max') ? width : null;
    height = (size === 'full' || size === 'max') ? height : null;

    const resource = new Resource(imageResourceUri('logo', undefined, {size, format: 'png'}),
        'Image', 'image/png', width, height);
    const service = new Service(imageUri('logo'), Service.IMAGE_SERVICE_2, 'http://iiif.io/api/image/2/level2.json');

    resource.setService(service);

    return resource;
}

function addDefaults(base: Base): void {
    base.setContext();

    if (config.logoRelativePath)
        base.setLogo(getLogo());

    if (config.attribution)
        base.setAttribution(config.attribution);
}

function addDerivatives(annotation: Annotation, item: Item): void {
    Object.values(derivatives)
        .filter(info => info.from === item.type && (info.to !== 'image' || info.imageTier))
        .filter(info => info.type === 'waveform') // TODO: Only waveforms for now
        .forEach(info => {
            const path = getFullDerivativePath(item, info);
            if (existsSync(path)) {
                annotation.setSeeAlso({
                    id: derivativeUri(item.id, 'waveform'),
                    type: getType(info.to),
                    format: info.contentType,
                    profile: info.profile
                });
            }
        });
}

async function setAuthServices(base: Resource | Service, item: RootItem | FileItem): Promise<void> {
    if (await requiresAuthentication(item)) {
        const authTexts = await getAuthTexts(item);
        getEnabledAuthServices().forEach(type => {
            // TODO: For now only login for 'ARCH00293' and 'ARCH00393'
            if (type !== 'login' ||
                item.collection_id.startsWith('ARCH00293') || item.collection_id.startsWith('ARCH00393')) {
                const service = AuthService.getAuthenticationService(authUri, authTexts, type);
                if (service)
                    base.setService(service);
            }
        });
    }
}
