import config from './Config';
import logger from './Logger';
import {Client, ApiResponse} from '@elastic/elasticsearch';

let testClient: Client | null = null;
const client = (config.elasticSearchUser && config.elasticSearchPassword)
    ? new Client({
        node: config.elasticSearchUrl,
        auth: {username: config.elasticSearchUser, password: config.elasticSearchPassword},
        ssl: {rejectUnauthorized: false}
    })
    : new Client({node: config.elasticSearchUrl});

export default function getClient(): Client {
    if (config.env === 'test' && testClient)
        return testClient;

    return client;
}

// For test purposes
export function setElasticSearchClient(client: Client): void {
    if (config.env === 'test')
        testClient = client;
}

export async function search<T>(index: string, q: string, sort?: string): Promise<T[]> {
    const results: T[] = [];

    try {
        const client = getClient();
        const response: SearchResponse<T> = await client.search({
            index,
            sort,
            size: 1000,
            scroll: '10s',
            q
        });

        let {_scroll_id, hits} = response.body;
        while (hits && hits.hits.length) {
            results.push(...hits.hits.map(hit => hit._source));

            if (_scroll_id) {
                const scrollResults: SearchResponse<T> = await client.scroll({
                    scroll_id: _scroll_id,
                    scroll: '10s'
                });

                _scroll_id = scrollResults.body._scroll_id;
                hits = scrollResults.body.hits;
            }
            else {
                hits.hits = [];
            }
        }

        if (_scroll_id)
            client.clearScroll({scroll_id: _scroll_id});

        return results;
    }
    catch (err) {
        return results;
    }
}

export type SearchResponse<T> = ApiResponse<{
    _scroll_id: string;
    hits: {
        total: number;
        hits: {
            _source: T;
        }[];
    };
}>;

(async function setMapping() {
    if (config.env === 'test')
        return;

    try {
        await client.ping();

        const itemsExists = await client.indices.exists({index: 'items'});
        if (!itemsExists.body) {
            await client.indices.create({
                index: 'items',
                body: {
                    mappings: {
                        properties: {
                            id: {
                                type: 'keyword'
                            },
                            parent_id: {
                                type: 'keyword'
                            },
                            collection_id: {
                                type: 'keyword'
                            },
                            metadata_id: {
                                type: 'keyword'
                            },
                            type: {
                                type: 'keyword'
                            },
                            formats: {
                                type: 'keyword'
                            },
                            label: {
                                type: 'text',
                                fielddata: true
                            },
                            description: {
                                type: 'text'
                            },
                            authors: {
                                type: 'nested',
                                properties: {
                                    type: {
                                        type: 'keyword'
                                    },
                                    name: {
                                        type: 'text'
                                    }
                                }
                            },
                            dates: {
                                type: 'keyword'
                            },
                            physical: {
                                type: 'keyword'
                            },
                            size: {
                                type: 'long'
                            },
                            order: {
                                type: 'short',
                            },
                            created_at: {
                                type: 'date'
                            },
                            width: {
                                type: 'short'
                            },
                            height: {
                                type: 'short'
                            },
                            resolution: {
                                type: 'short'
                            },
                            duration: {
                                type: 'short'
                            },
                            metadata: {
                                type: 'nested',
                                properties: {
                                    label: {
                                        type: 'keyword'
                                    },
                                    value: {
                                        type: 'keyword'
                                    }
                                }
                            },
                            original: {
                                properties: {
                                    uri: {
                                        type: 'keyword'
                                    },
                                    puid: {
                                        type: 'keyword'
                                    }
                                }
                            },
                            access: {
                                properties: {
                                    uri: {
                                        type: 'keyword'
                                    },
                                    puid: {
                                        type: 'keyword'
                                    }
                                }
                            }
                        }
                    }
                }
            });

            logger.info('Created the index \'items\' with a mapping');
        }

        const textsExists = await client.indices.exists({index: 'texts'});
        if (!textsExists.body) {
            await client.indices.create({
                index: 'texts',
                body: {
                    settings: {
                        analysis: {
                            filter: {
                                autocomplete_filter: {
                                    type: 'edge_ngram',
                                    min_gram: 1,
                                    max_gram: 8
                                },
                                truncate_filter: {
                                    type: 'truncate',
                                    length: 8
                                }
                            },
                            analyzer: {
                                autocomplete: {
                                    type: 'custom',
                                    tokenizer: 'standard',
                                    filter: ['lowercase', 'autocomplete_filter']
                                },
                                autocomplete_search: {
                                    type: 'custom',
                                    tokenizer: 'standard',
                                    filter: ['lowercase', 'truncate_filter']
                                },
                            }
                        }
                    },
                    mappings: {
                        properties: {
                            id: {
                                type: 'keyword'
                            },
                            item_id: {
                                type: 'keyword'
                            },
                            collection_id: {
                                type: 'keyword'
                            },
                            type: {
                                type: 'keyword'
                            },
                            language: {
                                type: 'keyword'
                            },
                            uri: {
                                type: 'keyword'
                            },
                            source: {
                                type: 'keyword'
                            },
                            text: {
                                type: 'text',
                                fields: {
                                    autocomplete: {
                                        type: 'text',
                                        analyzer: 'autocomplete',
                                        search_analyzer: 'autocomplete_search'
                                    }
                                }
                            }
                        }
                    }
                }
            });

            logger.info('Created the index \'texts\' with a mapping');
        }
    }
    catch (e) {
        setMapping();
    }
})();
