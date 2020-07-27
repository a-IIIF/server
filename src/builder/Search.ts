import {getChildItems} from '../lib/Item';
import {FileItem} from '../lib/ItemInterfaces';
import {getFullPath, OcrWord, readAlto, Text} from '../lib/Text';

import Canvas from './elem/v2/Canvas';
import Annotation from './elem/v2/Annotation';
import AnnotationList from './elem/v2/AnnotationList';
import TextResource from './elem/v2/TextResource';
import SearchHit from './elem/v2/SearchHit';
import TermList from './elem/v2/TermList';

import {SearchResult, SearchResultMatch} from '../search/search';
import {canvasUri, searchAnnoUri, searchUri, autocompleteUri} from './UriHelper';

export async function getAnnotationList(searchResults: SearchResult[], query: string, ignored: string[],
                                        id: string, type?: string, language?: string | null): Promise<AnnotationList> {
    const uriQuery = `?q=${encodeURIComponent(query)}`;

    const annotationList = new AnnotationList(searchUri(id, type, language) + uriQuery);
    const items = await getChildItems(id, true) as FileItem[];

    const resources = [];
    const hits = [];

    for (const searchResult of searchResults) {
        const item = items.find(item => item.id === searchResult.text.item_id) as FileItem;
        const canvas = new Canvas(canvasUri(id, item.order || 0));

        if (searchResult.text.source === 'plain') {
            const annotationId = searchAnnoUri(id, type, language, searchResult.text.id) + uriQuery;
            const textResource = new TextResource(searchResult.text.text);

            const annotation = new Annotation(annotationId, textResource);
            annotation.setCanvas(canvas);
            resources.push(annotation);

            const searchHit = new SearchHit();
            searchHit.addAnnotation(annotation);
            for (const match of searchResult.matches)
                searchHit.addTextQuoteSelector(match.match, match.before, match.after);

            hits.push(searchHit);
        }
        else if (searchResult.text.source === 'alto') {
            const uniqueResources = new Set();
            for (const match of searchResult.matches) {
                const searchHit = new SearchHit();

                const ocrWords = await findInAlto(searchResult.text, match);
                for (const ocrWord of ocrWords) {
                    const annotationId =
                        searchAnnoUri(id, type, language, searchResult.text.id + '_' + ocrWord.idx) + uriQuery;
                    const textResource = new TextResource(ocrWord.word);

                    const annotation = new Annotation(annotationId, textResource);
                    annotation.setCanvas(canvas, {
                        x: ocrWord.x,
                        y: ocrWord.y,
                        w: ocrWord.width,
                        h: ocrWord.height
                    });

                    if (!uniqueResources.has(annotationId)) {
                        uniqueResources.add(annotationId);
                        resources.push(annotation);
                    }

                    searchHit.addAnnotation(annotation);
                }

                searchHit.setBeforeAndAfter(match.before, match.after);
                hits.push(searchHit);
            }
        }
    }

    annotationList.setContext([
        'http://iiif.io/api/presentation/2/context.json',
        'http://iiif.io/api/search/1/context.json'
    ]);
    annotationList.setWithin({
        '@type': 'sc:Layer',
        total: resources.length,
        ignored: ignored.length > 0 ? ignored : undefined,
    });
    annotationList.setResources(resources);
    annotationList.setHits(hits);

    return annotationList;
}

export function getAutocomplete(suggestions: string[][], query: string, ignored: string[],
                                id: string, type?: string, language?: string | null): TermList {
    const uriQuery = (query: string) => `?q=${encodeURIComponent(query)}`;

    const termList = new TermList(autocompleteUri(id, type, language) + uriQuery(query));
    termList.setContext('http://iiif.io/api/search/1/context.json');

    ignored.length > 0 && termList.setIgnored(ignored);

    const uniqueSuggestions = new Set();
    suggestions.forEach(suggestion => {
        const term = suggestion.join(' ');
        if (!uniqueSuggestions.has(term.toLowerCase())) {
            uniqueSuggestions.add(term.toLowerCase());
            termList.addTerm(term, searchUri(id, type, language) + uriQuery(term));
        }
    });

    return termList;
}

async function findInAlto(text: Text, match: SearchResultMatch): Promise<OcrWord[]> {
    const ocrWords = await readAlto(getFullPath(text));
    return match.match
        .split(' ')
        .map(word => findMatchingOcrWords(ocrWords, word, match.before, match.after))
        .flat();
}

function findMatchingOcrWords(ocrWords: OcrWord[], match: string, before: string, after: string): OcrWord[] {
    return ocrWords
        .filter(ocrWord => ocrWord.word.includes(match))
        .filter(ocrWord => {
            let beforeText = ' ';
            let curIdx = Math.max(0, ocrWord.idx - (before.split(' ').length + 5));
            let endIdx = ocrWord.idx + 1;
            while (curIdx < endIdx) {
                beforeText += ocrWords[curIdx].word + ' ';
                curIdx++;
            }

            let afterText = ' ';
            curIdx = ocrWord.idx;
            endIdx = Math.min(ocrWord.idx + (after.split(' ').length + 5), ocrWords.length);
            while (curIdx < endIdx) {
                afterText += ocrWords[curIdx].word + ' ';
                curIdx++;
            }

            return beforeText.includes(before) && afterText.includes(after);
        });
}
