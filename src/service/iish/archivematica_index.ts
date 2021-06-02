import * as fs from 'fs';
import * as path from 'path';
import {promisify} from 'util';
import moment from 'moment';
import {parseXml, Attribute, Document, Element} from 'libxmljs2';

import config from '../../lib/Config';
import logger from '../../lib/Logger';
import {runTask} from '../../lib/Task';
import {evictCache} from '../../lib/Cache';
import {createItem, indexItems, deleteItems} from '../../lib/Item';
import {IndexParams, MetadataParams, TextParams, DerivativeParams} from '../../lib/Service';
import {MinimalItem, FileItem, FolderItem, Item} from '../../lib/ItemInterfaces';

import {TextItem} from '../util/types';
import {getTypeForPronom, pronomByExtension} from '../util/archivematica_pronom_data';

type WalkTreeParams = {
    id: string;
    mets: Document;
    objects: string[];
    relativeRootPath: string;
    curNode: Element;
    curNodePhysical: Element;
    structureIISH: Element | null;
    parent?: string | null;
};

type CollectionProcessingResult = {
    rootItem: Item,
    childItems: Item[],
    textItems: TextItem[]
}

type premis = 'premis' | 'premisv3';

const readdirAsync = promisify(fs.readdir);
const readFileAsync = promisify(fs.readFile);

const ns = {
    'mets': 'http://www.loc.gov/METS/',
    'premis': 'info:lc/xmlns/premis-v2',
    'premisv3': 'http://www.loc.gov/premis/v3',
    'mediainfo': 'https://mediaarea.net/mediainfo',
    'fits': 'http://hul.harvard.edu/ois/xml/ns/fits/fits_output',
    'rdf': 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
    'IFD0': 'http://ns.exiftool.ca/EXIF/IFD0/1.0/',
    'File': 'http://ns.exiftool.ca/File/1.0/'
};

export default async function processDip({collectionPath}: IndexParams): Promise<void> {
    try {
        const {rootItem, childItems, textItems} = await processCollection(collectionPath);

        logger.debug(`Collection ${collectionPath} processed; running cleanup and index`);

        await cleanup(rootItem.id);
        await indexItems([rootItem, ...childItems]);

        logger.debug(`Collection ${collectionPath} indexed; running metadata index, text index and derivative services`);

        runTask<MetadataParams>('metadata', {collectionId: rootItem.id});
        if (textItems.length > 0)
            runTask<TextParams>('text', {collectionId: rootItem.id, items: textItems});

        // Run derivative services
        runTask<DerivativeParams>('waveform', {collectionId: rootItem.id});
        runTask<DerivativeParams>('pdf-image', {collectionId: rootItem.id});
        runTask<DerivativeParams>('video-image', {collectionId: rootItem.id});
    }
    catch (e) {
        const err = new Error(`Failed to index the collection ${collectionPath}: ${e.message}`);
        err.stack = e.stack;
        throw err;
    }
}

export async function processCollection(collectionPath: string): Promise<CollectionProcessingResult> {
    const metsFile = (await readdirAsync(collectionPath)).find(file => file.startsWith('METS') && file.endsWith('xml'));
    if (!metsFile)
        throw new Error(`No METS file found in the collection ${collectionPath}`);

    const metsPath = path.join(collectionPath, metsFile);
    const metsXml = await readFileAsync(metsPath, 'utf8');

    const mets = parseXml(metsXml);
    const rootLogical = mets.get<Element>('//mets:structMap[@ID="structMap_2"]/mets:div/mets:div', ns);
    const rootPhysical = mets.get<Element>('//mets:structMap[@TYPE="physical"]/mets:div/mets:div', ns);
    const rootStructureIISH = mets.get<Element>('//mets:structMap[@ID="structMap_iish"]/mets:div', ns);
    if (!rootPhysical)
        throw new Error('Could not find the physical structmap in the METS file');

    const objectsPath = path.join(collectionPath, 'objects');
    const objects = fs.existsSync(objectsPath) ? await readdirAsync(objectsPath) : [];
    const relativeRootPath = objectsPath
        .replace(`${config.dataRootPath}/${config.collectionsRelativePath}/`, '');

    const rootItem = getRootItem(mets, rootStructureIISH);
    const [childItems, textItems] = walkTree({
        id: rootItem.id,
        mets,
        objects,
        relativeRootPath,
        curNode: rootLogical || rootPhysical,
        curNodePhysical: rootPhysical,
        structureIISH: rootStructureIISH
    });

    return {rootItem, childItems, textItems};
}

async function cleanup(id: string): Promise<void> {
    await Promise.all([
        deleteItems(id),
        evictCache('collection', id),
        evictCache('manifest', id)
    ]);
}

function getRootItem(mets: Document, structureIISH: Element | null): Item {
    const rootDir = mets.get<Element>('//mets:structMap[@TYPE="physical"]/mets:div', ns);
    if (!rootDir)
        throw new Error('Could not find the physical structmap in the METS file');

    const rootDmdIdAttr = rootDir.attr('DMDID');
    const rootDmdId = rootDmdIdAttr ? rootDmdIdAttr.value() : null;
    const premisObj = mets.get<Element>(`//mets:dmdSec[@ID="${rootDmdId}"]/mets:mdWrap/mets:xmlData/premisv3:object`, ns);
    if (!premisObj)
        throw new Error('Could not find the premis object of the root item in the METS file');

    const uuidElem = premisObj.get<Element>('./premisv3:objectIdentifier/premisv3:objectIdentifierType[text()="UUID"]/../premisv3:objectIdentifierValue', ns);
    const originalNameElem = premisObj.get<Element>('./premisv3:originalName', ns);
    if (!uuidElem || !originalNameElem)
        throw new Error('Could not find the UUID and/or original name of the root item in the METS file');

    const id = originalNameElem.text().replace(`-${uuidElem.text()}`, '');

    return createItem({
        'id': id,
        'collection_id': id,
        'type': structureIISH ? 'root' : 'folder',
        'label': id
    } as MinimalItem);
}

function walkTree({id, mets, objects, relativeRootPath, curNode, curNodePhysical, structureIISH, parent = null}:
                      WalkTreeParams): [Item[], TextItem[]] {
    let items: Item[] = [];
    let texts: TextItem[] = [];

    const nodes = curNode.find<Element>('./mets:div', ns);
    nodes.forEach(node => {
        const labelAttr = node.attr('LABEL');
        const label = labelAttr ? labelAttr.value() : null;
        if (!label)
            throw new Error('Expected to find a label for an element in the structmap');

        const nodePhysical = curNodePhysical.get<Element>(`./mets:div[@LABEL="${label}"]`, ns) || curNodePhysical;
        const typeAttr = node.attr('TYPE');
        if (typeAttr && typeAttr.value() === 'Directory') {
            const folderInfo = !structureIISH ? readFolder(id, label, mets, node, nodePhysical, parent) : null;
            if (folderInfo)
                items.push(folderInfo);

            if (folderInfo || (structureIISH && !parent)) {
                const [childItems, childTexts] = walkTree({
                    id,
                    mets,
                    objects,
                    relativeRootPath,
                    curNode: node,
                    curNodePhysical: nodePhysical,
                    structureIISH,
                    parent: folderInfo ? folderInfo.id : label
                });

                items = items.concat(childItems);
                texts = texts.concat(childTexts);
            }
        }
        else if (!structureIISH || (parent === 'preservation')) {
            const fileInfo = readFile(id, label, mets, objects, relativeRootPath, nodePhysical, structureIISH, parent);
            if (fileInfo)
                items.push(fileInfo);
        }
        else if (structureIISH && parent && (parent === 'transcription' || parent.startsWith('translation_'))) {
            const textInfo = readText(id, label, mets, objects, relativeRootPath, nodePhysical, structureIISH, parent);
            if (textInfo)
                texts.push(textInfo);
        }
    });

    return [items, texts];
}

function readFolder(rootId: string, label: string, mets: Document, node: Element,
                    nodePhysical: Element, parent: string | null): Item | null {
    const dmdIdAttr = node.attr('DMDID') ? node.attr('DMDID') : nodePhysical.attr('DMDID');
    const dmdId = dmdIdAttr ? dmdIdAttr.value() : null;
    if (!dmdId)
        return null;

    const premisObj = mets.get<Element>(`//mets:dmdSec[@ID="${dmdId}"]/mets:mdWrap/mets:xmlData/premisv3:object`, ns);
    if (!premisObj)
        throw new Error(`No premis object found for DMD id ${dmdId}`);

    const originalNameElem = premisObj.get<Element>(`./premisv3:originalName`, ns);
    if (!originalNameElem)
        throw new Error(`No original name found for object with DMD id ${dmdId}`);

    const originalName = originalNameElem.text();
    const name = path.basename(originalName);
    const id = getIdentifier(premisObj, 'premisv3');
    if (!id)
        throw new Error(`No identifier found for object with DMD id ${dmdId}`);

    return createItem({
        'id': id,
        'parent_id': parent || rootId,
        'collection_id': rootId,
        'type': 'folder',
        'label': name
    } as FolderItem);
}

function readFile(rootId: string, label: string, mets: Document, objects: string[], relativeRootPath: string,
                  node: Element, structureIISH: Element | null, parent: string | null): Item | null {
    const fptrElem = node.get<Element>('mets:fptr', ns);
    if (!fptrElem || !fptrElem.attr('FILEID'))
        throw new Error(`Missing a fptr or file id for a file with the label ${label}`);

    const fileId = (fptrElem.attr('FILEID') as Attribute).value();
    const internalId = fileId.substring(5);

    const premis = findPremisNsAndObj(mets, fileId);
    if (!premis)
        return null;

    const [premisNS, premisObj] = premis;

    const originalNameElem = premisObj.get<Element>(`./${premisNS}:originalName`, ns);
    if (!originalNameElem)
        throw new Error(`No original name found for object with file id ${fileId}`);

    const originalName = originalNameElem.text();
    const id = getIdentifier(premisObj, premisNS);
    if (!id)
        throw new Error(`No identifier found for object with file id ${fileId}`);

    const [objCharacteristics, objCharacteristicsExt] = getObjCharacteristicsAndExt(premisObj, premisNS);
    if (!objCharacteristics)
        throw new Error(`No object characteristics found for object with file id ${fileId}`);

    const sizeElem = objCharacteristics.get<Element>(`./${premisNS}:size`, ns);
    const size = sizeElem ? parseInt(sizeElem.text()) : null;

    const dateCreatedByAppElem = objCharacteristics.get<Element>(`.//${premisNS}:creatingApplication/${premisNS}:dateCreatedByApplication`, ns);
    const creationDate = dateCreatedByAppElem
        ? moment(dateCreatedByAppElem.text(), 'YYYY-MM-DD').toDate() : null;

    const pronomKeyElem = objCharacteristics.get<Element>(`./${premisNS}:format/${premisNS}:formatRegistry/${premisNS}:formatRegistryName[text()="PRONOM"]/../${premisNS}:formatRegistryKey`, ns);
    const pronomKey = pronomKeyElem ? pronomKeyElem.text() : null;
    const name = path.basename(originalName);
    const type = getTypeForPronom(pronomKey);

    if (!objCharacteristicsExt && (type === 'image' || type === 'video' || type === 'audio'))
        throw new Error(`No object characteristics extension found for object with file id ${fileId}`);

    const resolution = (type === 'image' || type === 'video')
        ? determineResolution(objCharacteristicsExt as Element)
        : {width: null, height: null};
    const dpi = (type === 'image') ? determineDpi(objCharacteristicsExt as Element) : null;
    const duration = (type === 'video' || type === 'audio') ? determineDuration(objCharacteristicsExt as Element) : null;

    const file = objects.find(f => f.startsWith(internalId));
    if (!file)
        throw new Error(`Expected to find a file starting with ${internalId}`);

    const isOriginal = file.endsWith(label);
    const extension = path.extname(file);

    let order = null;
    if (structureIISH) {
        const pageDiv = structureIISH.get<Element>(`./mets:div[@TYPE="page"]/mets:fptr[@FILEID="${fileId}"]/..`, ns);
        const orderAttr = pageDiv ? pageDiv.attr('ORDER') : null;
        order = orderAttr ? parseInt(orderAttr.value()) : null;
    }

    return createItem({
        'id': id,
        'parent_id': (parent && (parent !== 'preservation')) ? parent : rootId,
        'collection_id': rootId,
        'type': type,
        'label': name,
        'size': size,
        'order': order,
        'created_at': creationDate,
        'width': resolution.width,
        'height': resolution.height,
        'resolution': dpi,
        'duration': duration,
        'original': {
            'uri': isOriginal ? path.join(relativeRootPath, file) : null,
            'puid': pronomKey,
        },
        'access': {
            'uri': !isOriginal ? path.join(relativeRootPath, file) : null,
            'puid': (!isOriginal && pronomByExtension.hasOwnProperty(extension))
                ? pronomByExtension[extension] : null
        }
    } as FileItem);
}

function readText(rootId: string, label: string, mets: Document, objects: string[], relativeRootPath: string,
                  node: Element, structureIISH: Element, parent: string): TextItem | null {
    const fptrElem = node.get<Element>('mets:fptr', ns);
    if (!fptrElem || !fptrElem.attr('FILEID'))
        throw new Error(`Missing a fptr or file id for a file with the label ${label}`);

    const fileId = (fptrElem.attr('FILEID') as Attribute).value();
    const internalId = fileId.substring(5);
    const file = objects.find(f => f.startsWith(internalId));
    if (!file)
        throw new Error(`Expected to find a file starting with ${internalId}`);

    const premis = findPremisNsAndObj(mets, fileId);
    if (!premis)
        return null;

    const [premisNS, premisObj] = premis;

    const id = getIdentifier(premisObj, premisNS);
    if (!id)
        throw new Error(`No identifier found for object with file id ${fileId}`);

    const [objCharacteristics, objCharacteristicsExt] = getObjCharacteristicsAndExt(premisObj, premisNS);
    if (!objCharacteristics)
        throw new Error(`No object characteristics found for object with file id ${fileId}`);

    const encoding = objCharacteristicsExt ? determineEncoding(objCharacteristicsExt as Element) : null;

    const fptrs = structureIISH.find<Element>(`./mets:div[@TYPE="page"]/mets:fptr[@FILEID="${fileId}"]/../mets:fptr`, ns);
    const fptr = fptrs.find(fptrElem => {
        const fileIdAttr = fptrElem.attr('FILEID');
        const itemFileId = fileIdAttr ? fileIdAttr.value() : null;
        const parentFolderDiv = mets.get<Element>(`//mets:structMap[@TYPE="physical"]//mets:fptr[@FILEID="${itemFileId}"]/../..`, ns);
        if (parentFolderDiv) {
            const labelAttr = parentFolderDiv.attr('LABEL');
            return (labelAttr !== null && labelAttr.value() === 'preservation');
        }
        return false;
    });

    if (!fptr || !fptr.attr('FILEID'))
        throw new Error(`Missing a fptr or file id for a file for the text layer with label ${label}`);

    const itemFileId = (fptr.attr('FILEID') as Attribute).value();
    const itemPremisObj = findPremisObj(mets, itemFileId, premisNS);
    if (!itemPremisObj)
        throw new Error(`No premis object found for file with id ${itemFileId}`);

    const itemId = getIdentifier(itemPremisObj, premisNS);
    if (!itemId)
        throw new Error(`Missing a file id for a file with id ${itemFileId}`);

    const isTranslation = parent.startsWith('translation_');
    const type = isTranslation ? 'translation' : 'transcription';
    const language = isTranslation ? parent.split('_')[1] : null;

    return {id, itemId, type, language, encoding, uri: path.join(relativeRootPath, file)};
}

function findPremisNsAndObj(mets: Document, fileId: string): [premis, Element] | null {
    return (['premisv3', 'premis'] as premis[])
        .map(premisNS => [premisNS, findPremisObj(mets, fileId, premisNS)])
        .find(premis => premis[1]) as [premis, Element] | null;
}

function findPremisObj(mets: Document, fileId: string, premisNS: premis = 'premis'): Element | null {
    const fileNode = mets.get<Element>(`mets:fileSec/mets:fileGrp[@USE="original"]/mets:file[@ID="${fileId}"]`, ns);
    const admIdAttr = fileNode ? fileNode.attr('ADMID') : null;
    const admId = admIdAttr ? admIdAttr.value() : null;

    if (admId)
        return mets.get(`//mets:amdSec[@ID="${admId}"]/mets:techMD/mets:mdWrap/mets:xmlData/${premisNS}:object`, ns);

    return null;
}

export function getIdentifier(premisObj: Element, premisNS: premis = 'premis'): string | null {
    const hdlObj = premisObj.get<Element>(`./${premisNS}:objectIdentifier/${premisNS}:objectIdentifierType[text()="hdl"]`, ns);
    const uuidObj = premisObj.get<Element>(`./${premisNS}:objectIdentifier/${premisNS}:objectIdentifierType[text()="UUID"]`, ns);

    if (hdlObj) {
        const objIdAttr = hdlObj.get<Element>(`./../${premisNS}:objectIdentifierValue`, ns);
        if (objIdAttr) {
            const hdl = objIdAttr.text();
            return hdl.split('/')[1];
        }
    }

    if (uuidObj) {
        const objIdAttr = uuidObj.get<Element>(`./../${premisNS}:objectIdentifierValue`, ns);
        if (objIdAttr)
            return objIdAttr.text();
    }

    return null;
}

export function getObjCharacteristicsAndExt(premisObj: Element, premisNS: premis = 'premis'): [Element | null, Element | null] {
    const objCharacteristics = premisObj.get<Element>(`./${premisNS}:objectCharacteristics`, ns);
    const objCharacteristicsExt = objCharacteristics
        ? objCharacteristics.get<Element>(`./${premisNS}:objectCharacteristicsExtension`, ns) : null;

    return [objCharacteristics, objCharacteristicsExt];
}

export function determineResolution(objCharacteristicsExt: Element): { width: number | null; height: number | null } {
    const mediaInfo = objCharacteristicsExt.get<Element>('./mediainfo:MediaInfo/mediainfo:media/mediainfo:track[@type="Image" or @type="Video"]', ns);
    if (mediaInfo) {
        const widthElem = mediaInfo.get<Element>('./mediainfo:Width', ns);
        const heightElem = mediaInfo.get<Element>('./mediainfo:Height', ns);

        if (widthElem && heightElem) {
            const resolution = getResolution(widthElem.text(), heightElem.text());
            if (resolution) return resolution;
        }
    }

    const ffprobe = objCharacteristicsExt.get<Element>('./ffprobe/streams/stream[@codec_type="video"]', ns);
    if (ffprobe) {
        const widthAttr = ffprobe.attr('width');
        const heightAttr = ffprobe.attr('height');

        if (widthAttr && heightAttr) {
            const resolution = getResolution(widthAttr.value(), heightAttr.value());
            if (resolution) return resolution;
        }
    }

    const exifTool = objCharacteristicsExt.get<Element>('./rdf:RDF/rdf:Description', ns);
    if (exifTool) {
        const widthElem = exifTool.get<Element>('./File:ImageWidth', ns);
        const heightElem = exifTool.get<Element>('./File:ImageHeight', ns);

        if (widthElem && heightElem) {
            const resolution = getResolution(widthElem.text(), heightElem.text());
            if (resolution) return resolution;
        }
    }

    const fitsExifTool = objCharacteristicsExt.get<Element>('./fits:fits/fits:toolOutput/fits:tool[@name="Exiftool"]/exiftool', ns);
    if (fitsExifTool) {
        const widthElem = fitsExifTool.get<Element>('./ImageWidth', ns);
        const heightElem = fitsExifTool.get<Element>('./ImageHeight', ns);

        if (widthElem && heightElem) {
            const resolution = getResolution(widthElem.text(), heightElem.text());
            if (resolution) return resolution;
        }
    }

    return {width: null, height: null};
}

function getResolution(width: string | null, height: string | null): { width: number | null; height: number | null } | null {
    if (width && height) {
        return {
            width: Number.parseInt(width),
            height: Number.parseInt(height)
        };
    }
    return null;
}

export function determineDpi(objCharacteristicsExt: Element): number | null {
    const exifTool = objCharacteristicsExt.get<Element>('./rdf:RDF/rdf:Description', ns);
    if (exifTool) {
        const resolutionElem = exifTool.get<Element>('./IFD0:XResolution', ns);

        if (resolutionElem) {
            const dpi = Number.parseInt(resolutionElem.text());
            if (dpi) return dpi;
        }
    }

    const fitsExifTool = objCharacteristicsExt.get<Element>('./fits:fits/fits:toolOutput/fits:tool[@name="Exiftool"]/exiftool', ns);
    if (fitsExifTool) {
        const resolutionElem = fitsExifTool.get<Element>('./XResolution', ns);

        if (resolutionElem) {
            const dpi = Number.parseInt(resolutionElem.text());
            if (dpi) return dpi;
        }
    }

    return null;
}

export function determineDuration(objCharacteristicsExt: Element): number | null {
    const mediaInfo = objCharacteristicsExt.get<Element>('./mediainfo:MediaInfo/mediainfo:media/mediainfo:track[@type="General"]', ns);
    if (mediaInfo) {
        const durationElem = mediaInfo.get<Element>('./mediainfo:Duration', ns);

        if (durationElem) {
            const duration = Number.parseFloat(durationElem.text());
            if (duration) return duration;
        }
    }

    let duration: number | null = null;
    objCharacteristicsExt.find<Element>('./ffprobe/streams/stream', ns).forEach(stream => {
        const durationAttr = stream.attr('duration');
        const curDuration = durationAttr ? Number.parseFloat(durationAttr.value()) : null;
        if (curDuration && (duration === null || curDuration > duration))
            duration = curDuration;
    });
    if (duration) return duration;

    return null;
}

export function determineEncoding(objCharacteristicsExt: Element): string | null {
    const md = objCharacteristicsExt.get<Element>('./fits:fits/fits:toolOutput/fits:tool[@name="Tika"]/metadata', ns);
    if (md) {
        const contentEncodingValueElem = md.get<Element>('./field[@name="Content-Encoding"]/value', ns);
        if (contentEncodingValueElem)
            return contentEncodingValueElem.text().trim();
    }

    return null;
}
