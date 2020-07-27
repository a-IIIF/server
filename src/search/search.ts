import {ApiResponse} from '@elastic/elasticsearch';

import config from '../lib/Config';
import getClient from '../lib/ElasticSearch';
import {Text} from '../lib/Text';

const PRE_TAG = '{{{';
const POST_TAG = '}}}';

interface SearchResponse {
    hits: {
        total: number,
        hits: {
            _source: Text,
            highlight: {
                text: string[]
            }
        }[]
    }
}

interface AutocompleteResponse {
    hits: {
        hits: {
            highlight: {
                'text.autocomplete': string[]
            }
        }[]
    }
}

export interface SearchResult {
    text: Text,
    matches: SearchResultMatch[]
}

export interface SearchResultMatch {
    match: string,
    before: string,
    after: string
}

export async function searchInCollection(query: string, collectionId: string,
                                         type?: string, language?: string | null): Promise<SearchResult[]> {
    return search(query, {
        collection_id: collectionId,
        type,
        language: language || undefined
    });
}

export async function searchInText(query: string, textId: string): Promise<SearchResult[]> {
    return search(query, {id: textId});
}

export async function autoCompleteForCollection(query: string, collectionId: string,
                                                type?: string, language?: string | null): Promise<string[][]> {
    return autocomplete(query, {
        collection_id: collectionId,
        type,
        language: language || undefined
    });
}

export async function autocompleteForText(query: string, textId: string): Promise<string[][]> {
    return autocomplete(query, {id: textId});
}

async function search(query: string, filters: { [field: string]: string | undefined }): Promise<SearchResult[]> {
    query = query.trim();

    const isPhraseMatch = query.startsWith('"') && query.endsWith('"');
    query = isPhraseMatch ? query.substring(1, query.length - 1) : query;

    const response: ApiResponse<SearchResponse> = await getClient().search({
        index: 'texts',
        size: config.maxSearchResults,
        body: {
            query: {
                bool: {
                    must: {
                        [isPhraseMatch ? 'match_phrase' : 'match']: {
                            text: {
                                query,
                                fuzziness: !isPhraseMatch ? 'AUTO' : undefined
                            }
                        }
                    },
                    filter: {
                        term: filters
                    }
                }
            },
            highlight: {
                type: 'plain',
                pre_tags: [PRE_TAG],
                post_tags: [POST_TAG],
                fields: {
                    text: {}
                }
            }
        }
    });

    return response.body.hits.hits.map(hit => ({
        text: hit._source,
        matches: hit.highlight.text.flatMap(hl => mapMatches(hl))
    }));
}

async function autocomplete(query: string, filters: { [field: string]: string | undefined }): Promise<string[][]> {
    query = query.trim();

    const response: ApiResponse<AutocompleteResponse> = await getClient().search({
        index: 'texts',
        body: {
            _source: false,
            query: {
                bool: {
                    must: {
                        match_phrase: {
                            'text.autocomplete': {
                                query
                            }
                        }
                    },
                    filter: {
                        term: filters
                    }
                }
            },
            highlight: {
                pre_tags: [PRE_TAG],
                post_tags: [POST_TAG],
                fields: {
                    'text.autocomplete': {}
                }
            }
        }
    });

    if (response.body.hits.hits.length === 0)
        return [];

    const firstQueryWord = query.split(' ')[0].toLowerCase();

    return response.body.hits.hits.reduce<string[][]>((acc, hit) => {
        for (const hl of hit.highlight['text.autocomplete']) {
            for (const match of mapMatches(hl)) {
                const word = match.match;
                if (word.toLowerCase().startsWith(firstQueryWord))
                    acc.push([word]);
                else
                    acc[acc.length - 1].push(word);
            }
        }
        return acc;
    }, []);
}

function mapMatches(hl: string): SearchResultMatch[] {
    const tags = [];
    while (hl.indexOf(PRE_TAG) >= 0) {
        const idxStart = hl.indexOf(PRE_TAG);
        hl = hl.replace(PRE_TAG, '');

        const idxEnd = hl.indexOf(POST_TAG);
        hl = hl.replace(POST_TAG, '');

        tags.push([idxStart, idxEnd]);
    }

    return tags.map(([idxStart, idxEnd]) => ({
        match: hl.substring(idxStart, idxEnd),
        before: hl.substring(0, idxStart),
        after: hl.substring(idxEnd)
    }));
}
