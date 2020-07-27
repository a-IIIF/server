import * as fs from 'fs';
import {promisify} from 'util';
import {join, extname} from 'path';
import {decode} from 'iconv-lite';

import config from '../lib/Config';
import {TextParams} from '../lib/Service';
import {indexTexts, deleteTexts, readAlto} from '../lib/Text';

import fixCommonUTF8Problems from './util/unicode_debug_mapping';

const readFileAsync = promisify(fs.readFile);

export default async function processText({collectionId, items}: TextParams) {
    try {
        const textItems = await Promise.all(items.map(async item => {
            const path = join(config.dataRootPath, config.collectionsRelativePath, item.uri);

            const source = getTextSource(path);
            const text = await getTextFromFile(path, item.encoding);

            return {
                id: item.id,
                item_id: item.itemId,
                collection_id: collectionId,
                type: item.type,
                language: item.language,
                uri: item.uri,
                source,
                text
            };
        }));

        await deleteTexts(collectionId);
        await indexTexts(textItems.filter(textItem => textItem.text !== ''));
    }
    catch (e) {
        const err = new Error(`Failed to process the texts for ${collectionId}: ${e.message}`);
        err.stack = e.stack;
        throw err;
    }
}

function getTextSource(uri: string): 'alto' | 'plain' {
    const extension = extname(uri);
    switch (extension) {
        case '.xml':
            return 'alto';
        case '.txt':
        default:
            return 'plain';
    }
}

export async function getTextFromFile(uri: string, encoding: string | null): Promise<string> {
    const extension = extname(uri);
    switch (extension) {
        case '.xml':
            return getAltoText(uri);
        case '.txt':
        default:
            return getPlainText(uri, encoding);
    }
}

async function getAltoText(uri: string): Promise<string> {
    const altoWords = await readAlto(uri);
    return altoWords.map(altoWord => altoWord.word).join(' ');
}

async function getPlainText(uri: string, encoding: string | null): Promise<string> {
    const textBuffer = await readFileAsync(uri);
    const encodedText = decode(textBuffer, encoding || 'utf8')
    const fixedText = encoding ? encodedText : fixCommonUTF8Problems(encodedText);
    return fixedText.normalize();
}
