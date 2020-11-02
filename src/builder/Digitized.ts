import {getChildItems} from '../lib/Item';
import {getAuthTexts} from '../lib/Security';
import {Item, RootItem, FileItem} from '../lib/ItemInterfaces';
import {getTextsForCollectionId, getFullPath, readAlto, Text} from '../lib/Text';

import {
    createMinimalManifest,
    createManifest,
    createCanvas,
    addThumbnail,
    addMetadata,
    createAnnotationPage,
} from './PresentationUtils';

import Base from './elem/v3/Base';
import Canvas from './elem/v3/Canvas';
import Service from './elem/v3/Service';
import Manifest from './elem/v3/Manifest';
import Annotation from './elem/v3/Annotation';
import AuthService from './elem/v3/AuthService';
import TextResource from './elem/v3/TextResource';
import AnnotationPage from './elem/v3/AnnotationPage';
import AnnotationCollection from './elem/v3/AnnotationCollection';

import {
    annoCollUri,
    annoPageUri,
    annoUri,
    authUri,
    fileUri,
    searchUri,
    autocompleteUri,
    textUri,
    textPlainUri
} from './UriHelper';

export async function getManifest(parentItem: RootItem): Promise<Manifest> {
    const manifest = await createManifest(parentItem);

    const items = await getChildItems(parentItem) as FileItem[];
    const texts = await getTextsForCollectionId(parentItem.id);

    addBehavior(manifest, parentItem, items.length > 1);
    await addThumbnail(manifest, parentItem);
    await addMetadata(manifest, parentItem);

    manifest.setItems(await Promise.all(items.map(async (item, idx) => {
        const canvas = await createCanvas(item, parentItem, idx === 0);

        texts
            .filter(text => text.item_id === item.id)
            .forEach(text => addText(canvas, parentItem, text));

        await addThumbnail(canvas, item);
        await addMetadata(canvas, item);

        return canvas;
    })));

    if (texts.length > 0)
        setSearchService(manifest, parentItem);

    return manifest;
}

export async function getReference(item: RootItem): Promise<Manifest> {
    return createMinimalManifest(item);
}

export async function getAnnotationPage(item: RootItem, text: Text): Promise<AnnotationPage> {
    const annoPage = createAnnotationPage(item, text);

    const items = await getChildItems(item) as FileItem[];
    const texts = await getTextsForCollectionId(item.id, text.type, text.language);

    const childItem = items.find(item => item.id === text.item_id) as FileItem;
    const canvas = await createCanvas(childItem, item);

    const firstItem = items.reduce<Text | undefined>((acc, item) =>
        acc || texts.find(text => item.id === text.item_id), undefined);
    const lastItem = items.reverse().reduce<Text | undefined>((acc, item) =>
        acc || texts.find(text => item.id === text.item_id), undefined);

    const prevItem = items.reverse().reduce<Text | undefined>((acc, item) =>
        acc || (item.order && childItem.order && item.order < childItem.order
        && texts.find(text => item.id === text.item_id)) || undefined, undefined);
    const nextItem = items.reduce<Text | undefined>((acc, item) =>
        acc || (item.order && childItem.order && item.order > childItem.order
        && texts.find(text => item.id === text.item_id)) || undefined, undefined);

    const annoCollection = new AnnotationCollection(annoCollUri(item.id, text.type, text.language));

    annoCollection.setLabel(text.type === 'transcription' ? 'Transcription' : `Translation ${text.language}`);
    annoCollection.setFirstAndLast('AnnotationPage',
        firstItem ? annoPageUri(item.id, firstItem.id) : undefined,
        lastItem ? annoPageUri(item.id, lastItem.id) : undefined
    );

    annoPage.setParent(annoCollection);
    annoPage.setPrevAndNext('AnnotationPage',
        prevItem ? annoPageUri(item.id, prevItem.id) : undefined,
        nextItem ? annoPageUri(item.id, nextItem.id) : undefined
    );

    setSearchService(annoPage, text);
    setSearchService(annoCollection, item, text.type, text.language);

    switch (text.source) {
        case 'plain':
            const resource = new TextResource(text.text, text.language);
            const annotation = new Annotation(annoUri(item.id, childItem.id), resource, 'supplementing');

            annotation.setTextGranularity('page');
            annotation.setCanvas(canvas);

            annoPage.setItems(annotation);
            break;
        case 'alto':
            const annotations: Annotation[] = [];

            const words = await readAlto(getFullPath(text));
            words.forEach((word, idx) => {
                const resource = new TextResource(word.word, text.language);
                const annotation = new Annotation(annoUri(item.id, childItem.id, idx + 1), resource, 'supplementing');

                annotation.setTextGranularity('word');
                annotation.setCanvas(canvas, {x: word.x, y: word.y, w: word.width, h: word.height});

                annotations.push(annotation);
            });

            annoPage.setItems(annotations);
            break;
    }

    return annoPage;
}

function addBehavior(base: Base, item: Item, hasMultipleItems = true): void {
    base.setViewingDirection('left-to-right');

    if (hasMultipleItems && item.formats.includes('book'))
        base.setBehavior('paged');
    else
        base.setBehavior('individuals');
}

function addText(canvas: Canvas, item: Item, text: Text): void {
    const label = text.type === 'transcription' ? 'Transcription' : `Translation ${text.language}`;

    const annoPage = new AnnotationPage(annoPageUri(item.id, text.id));
    canvas.setAnnotations(annoPage);

    canvas.setSeeAlso({
        id: fileUri(text.id),
        type: 'Text',
        format: text.source === 'alto' ? 'application/xml' : 'plain/text',
        profile: text.source === 'alto' ? 'http://www.loc.gov/standards/alto/' : undefined,
        label: text.source === 'alto' ? 'ALTO XML' : label
    });

    canvas.setRendering({
        id: textPlainUri(text.id),
        label,
        format: 'plain/text',
        type: 'Text'
    });

    canvas.setMetadata(label, `<a href="${textUri(text.id)}">Open in new window</a>`);
}

async function setAuthenticationServices(item: Item, base: Base): Promise<void> {
    const authTexts = await getAuthTexts(item);
    const service = AuthService.getAuthenticationService(authUri, authTexts, 'external');
    if (service)
        base.setService(service);
}

function setSearchService(base: Base, item: Item | Text, type?: string, language?: string | null): void {
    const service = new Service(
        searchUri(item.id, type, language),
        Service.SEARCH_SERVICE_1,
        'http://iiif.io/api/search/1/search'
    );

    service.setService(new Service(
        autocompleteUri(item.id, type, language),
        Service.AUTOCOMPLETE_SERVICE_1,
        'http://iiif.io/api/search/1/autocomplete'
    ));

    base.setService(service);
}
