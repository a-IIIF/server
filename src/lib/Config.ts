if (process.env.NODE_ENV === 'test')
    require('dotenv').config({path: `${__dirname}/../../.test.env`});
else if (process.env.NODE_ENV !== 'production')
    require('dotenv').config();

export interface Config {
    env?: string;
    appInstance?: string;
    attribution?: string;
    universalViewerPath?: string;
    archivalViewerPath?: string;
    universalViewerConfigPath?: string;
    hotFolderPath?: string;
    hotFolderPattern?: string;
    metadataOaiUrl?: string;
    metadataSrwUrl?: string;
    metadataPath?: string;
    logoRelativePath?: string;
    audioRelativePath?: string;
    elasticSearchUser?: string;
    elasticSearchPassword?: string;
    ipAddressHeader?: string;
    imageServerUrl: string;
    imageServerName: 'loris' | 'sharp';
    logoDimensions?: [number, number];
    audioDimensions?: [number, number];
    pdfPagesThreshold?: number;
    pdfSessionSeconds?: number;
    pdfImageSize: string;
    videoMosaicWidth: number,
    videoTilesRows: number,
    videoTilesColumns: number,
    imageTierSeparator: string;
    maxTasksPerWorker: number;
    maxSearchResults: number;
    services: string[];
    secret: string;
    accessToken: string;
    port: number;
    logLevel: string;
    baseUrl: string;
    dataRootPath: string;
    collectionsRelativePath: string;
    derivativeRelativePath: string;
    internalIpAddresses: string[];
    loginDisabled: boolean;
    accessTtl: number;
    elasticSearchUrl: string;
    redisVolatile: null | {
        host: string;
        port: number;
    };
    redisPersistent: null | {
        host: string;
        port: number;
    };
}

const config: Config = {
    env: process.env.NODE_ENV,
    appInstance: process.env.NODE_APP_INSTANCE,
    attribution: process.env.IIIF_SERVER_ATTRIBUTION,
    universalViewerPath: process.env.IIIF_SERVER_UNIVERSAL_VIEWER_PATH,
    archivalViewerPath: process.env.IIIF_SERVER_ARCHIVAL_VIEWER_PATH,
    universalViewerConfigPath: process.env.IIIF_SERVER_UNIVERSAL_VIEWER_CONFIG_PATH,
    hotFolderPath: process.env.IIIF_SERVER_HOT_FOLDER_PATH,
    hotFolderPattern: process.env.IIIF_SERVER_HOT_FOLDER_PATTERN,
    metadataOaiUrl: process.env.IIIF_SERVER_METADATA_OAI_URL,
    metadataSrwUrl: process.env.IIIF_SERVER_METADATA_SRW_URL,
    metadataPath: process.env.IIIF_SERVER_METADATA_PATH,
    logoRelativePath: process.env.IIIF_SERVER_LOGO_REL_PATH,
    audioRelativePath: process.env.IIIF_SERVER_AUDIO_REL_PATH,
    elasticSearchUser: process.env.IIIF_SERVER_ELASTICSEARCH_USER,
    elasticSearchPassword: process.env.IIIF_SERVER_ELASTICSEARCH_PASSWORD,
    ipAddressHeader: process.env.IIIF_SERVER_IP_ADDRESS_HEADER,

    imageServerUrl: (_ => {
        if (!process.env.IIIF_SERVER_IMAGE_SERVER_URL || (process.env.IIIF_SERVER_IMAGE_SERVER_URL === 'null'))
            throw new Error('Image server url is not defined');
        return process.env.IIIF_SERVER_IMAGE_SERVER_URL;
    })(),

    imageServerName: (_ => {
        if (!process.env.IIIF_SERVER_IMAGE_SERVER_NAME ||
            !['loris', 'sharp'].includes(process.env.IIIF_SERVER_IMAGE_SERVER_NAME))
            throw new Error('Image server name should either be \'loris\' or \'sharp\'');
        return process.env.IIIF_SERVER_IMAGE_SERVER_NAME as 'loris' | 'sharp';
    })(),

    logoDimensions: (_ => {
        if (!process.env.IIIF_SERVER_LOGO_DIM || (process.env.IIIF_SERVER_LOGO_DIM === 'null'))
            return undefined;

        const dimensions = process.env.IIIF_SERVER_LOGO_DIM.split(':');
        return [parseInt(dimensions[0]), parseInt(dimensions[1])] as [number, number];
    })(),

    audioDimensions: (_ => {
        if (!process.env.IIIF_SERVER_AUDIO_DIM || (process.env.IIIF_SERVER_AUDIO_DIM === 'null'))
            return undefined;

        const dimensions = process.env.IIIF_SERVER_AUDIO_DIM.split(':');
        return [parseInt(dimensions[0]), parseInt(dimensions[1])] as [number, number];
    })(),

    pdfPagesThreshold: (_ => {
        if (!process.env.IIIF_SERVER_PDF_PAGES_THRESHOLD || (process.env.IIIF_SERVER_PDF_PAGES_THRESHOLD === 'null'))
            return undefined;

        return parseInt(process.env.IIIF_SERVER_PDF_PAGES_THRESHOLD);
    })(),

    pdfSessionSeconds: (_ => {
        if (!process.env.IIIF_SERVER_PDF_SESSION_SECONDS || (process.env.IIIF_SERVER_PDF_SESSION_SECONDS === 'null'))
            return undefined;

        return parseInt(process.env.IIIF_SERVER_PDF_SESSION_SECONDS);
    })(),

    pdfImageSize: (_ => {
        return process.env.IIIF_SERVER_PDF_IMAGE_SIZE || 'max';
    })(),

    videoMosaicWidth: (_ => {
        const width = process.env.IIIF_SERVER_VIDEO_MOSAIC_WIDTH
            ? parseInt(process.env.IIIF_SERVER_VIDEO_MOSAIC_WIDTH) : 0;
        return width > 0 ? width : 500;
    })(),

    videoTilesRows: (_ => {
        const rows = process.env.IIIF_SERVER_VIDEO_TILES_ROWS
            ? parseInt(process.env.IIIF_SERVER_VIDEO_TILES_ROWS) : 0;
        return rows > 0 ? rows : 6;
    })(),

    videoTilesColumns: (_ => {
        const columns = process.env.IIIF_SERVER_VIDEO_TILES_COLUMNS
            ? parseInt(process.env.IIIF_SERVER_VIDEO_TILES_COLUMNS) : 0;
        return columns > 0 ? columns : 5;
    })(),

    imageTierSeparator: (_ => {
        if (!process.env.IIIF_SERVER_IMAGE_TIER_SEPARATOR || (process.env.IIIF_SERVER_IMAGE_TIER_SEPARATOR === 'null'))
            throw new Error('Image tier separator is not defined');
        return process.env.IIIF_SERVER_IMAGE_TIER_SEPARATOR;
    })(),

    maxTasksPerWorker: (_ => {
        const maxTasksPerWorker = process.env.IIIF_SERVER_MAX_TASKS_PER_WORKER
            ? parseInt(process.env.IIIF_SERVER_MAX_TASKS_PER_WORKER) : 0;
        return (maxTasksPerWorker > 0) ? maxTasksPerWorker : 5;
    })(),

    maxSearchResults: (_ => {
        const maxSearchResults = process.env.IIIF_SERVER_MAX_SEARCH_RESULTS
            ? parseInt(process.env.IIIF_SERVER_MAX_SEARCH_RESULTS) : 0;
        return (maxSearchResults > 0) ? maxSearchResults : 5000;
    })(),

    services: (_ => {
        if (!process.env.IIIF_SERVER_SERVICES || (process.env.IIIF_SERVER_SERVICES === 'null'))
            throw new Error('Services to run are not defined');
        return process.env.IIIF_SERVER_SERVICES.split(',');
    })(),

    secret: (_ => {
        if (!process.env.IIIF_SERVER_SECRET || (process.env.IIIF_SERVER_SECRET === 'null'))
            throw new Error('Secret is not defined');
        return process.env.IIIF_SERVER_SECRET;
    })(),

    accessToken: (_ => {
        if (!process.env.IIIF_SERVER_ACCESS_TOKEN || (process.env.IIIF_SERVER_ACCESS_TOKEN === 'null'))
            throw new Error('The access token is not defined');
        return process.env.IIIF_SERVER_ACCESS_TOKEN;
    })(),

    port: (_ => {
        const port = process.env.IIIF_SERVER_PORT ? parseInt(process.env.IIIF_SERVER_PORT) : 0;
        return (port > 0) ? port : 3333;
    })(),

    logLevel: (_ => {
        return (process.env.IIIF_SERVER_LOG_LEVEL && (process.env.IIIF_SERVER_LOG_LEVEL !== 'null'))
            ? process.env.IIIF_SERVER_LOG_LEVEL : 'debug';
    })(),

    baseUrl: (_ => {
        if (!process.env.IIIF_SERVER_BASE_URL || (process.env.IIIF_SERVER_BASE_URL === 'null'))
            throw new Error('The base url is not defined');
        return process.env.IIIF_SERVER_BASE_URL;
    })(),

    dataRootPath: (_ => {
        if (!process.env.IIIF_SERVER_DATA_ROOT_PATH || (process.env.IIIF_SERVER_DATA_ROOT_PATH === 'null'))
            throw new Error('The data root path is not defined');
        return process.env.IIIF_SERVER_DATA_ROOT_PATH;
    })(),

    collectionsRelativePath: (_ => {
        if (!process.env.IIIF_SERVER_COLLECTIONS_REL_PATH || (process.env.IIIF_SERVER_COLLECTIONS_REL_PATH === 'null'))
            throw new Error('The collections relative path is not defined');
        return process.env.IIIF_SERVER_COLLECTIONS_REL_PATH;
    })(),

    derivativeRelativePath: (_ => {
        if (!process.env.IIIF_SERVER_DERIVATIVE_REL_PATH || (process.env.IIIF_SERVER_DERIVATIVE_REL_PATH === 'null'))
            throw new Error('The derivative relative path is not defined');
        return process.env.IIIF_SERVER_DERIVATIVE_REL_PATH;
    })(),

    internalIpAddresses: (_ => {
        if (!process.env.IIIF_SERVER_INTERNAL_IP_ADDRESSES || (process.env.IIIF_SERVER_INTERNAL_IP_ADDRESSES === 'null'))
            return [];
        return process.env.IIIF_SERVER_INTERNAL_IP_ADDRESSES.split(',');
    })(),

    loginDisabled: (_ => {
        const loginDisabled = process.env.IIIF_SERVER_LOGIN_DISABLED;
        return ((loginDisabled !== undefined) && (loginDisabled.toLowerCase() === 'true' || loginDisabled === '1'));
    })(),

    accessTtl: (_ => {
        const accessTtl = process.env.IIIF_SERVER_ACCESS_TTL ? parseInt(process.env.IIIF_SERVER_ACCESS_TTL) : 0;
        return (accessTtl > 0) ? accessTtl : 3600;
    })(),

    elasticSearchUrl: (_ => {
        if (!process.env.IIIF_SERVER_ELASTICSEARCH_URL || (process.env.IIIF_SERVER_ELASTICSEARCH_URL === 'null'))
            throw new Error('The ElasticSearch URL is not defined');
        return process.env.IIIF_SERVER_ELASTICSEARCH_URL;
    })(),

    redisVolatile: (_ => {
        const redisDisabled = process.env.IIIF_SERVER_REDIS_VOLATILE_DISABLED;
        if (redisDisabled && (redisDisabled.toLowerCase() === 'true' || redisDisabled === '1'))
            return null;

        const host = (process.env.IIIF_SERVER_REDIS_VOLATILE_HOST && (process.env.IIIF_SERVER_REDIS_VOLATILE_HOST !== 'null'))
            ? process.env.IIIF_SERVER_REDIS_VOLATILE_HOST : 'localhost';
        const port = process.env.IIIF_SERVER_REDIS_VOLATILE_PORT && parseInt(process.env.IIIF_SERVER_REDIS_VOLATILE_PORT) > 0
            ? parseInt(process.env.IIIF_SERVER_REDIS_VOLATILE_PORT) : 6379;

        return {host, port};
    })(),

    redisPersistent: (_ => {
        const redisDisabled = process.env.IIIF_SERVER_REDIS_PERSIST_DISABLED;
        if (redisDisabled && (redisDisabled.toLowerCase() === 'true' || redisDisabled === '1'))
            return null;

        const host = (process.env.IIIF_SERVER_REDIS_PERSIST_HOST && (process.env.IIIF_SERVER_REDIS_PERSIST_HOST !== 'null'))
            ? process.env.IIIF_SERVER_REDIS_PERSIST_HOST : 'localhost';
        const port = process.env.IIIF_SERVER_REDIS_PERSIST_PORT && parseInt(process.env.IIIF_SERVER_REDIS_PERSIST_PORT) > 0
            ? parseInt(process.env.IIIF_SERVER_REDIS_PERSIST_PORT) : 6379;

        return {host, port};
    })()
};

// For test purposes
export function setConfig<P extends keyof Config, V extends Config[P]>(property: P, value: V): void {
    if (config.env === 'test')
        config[property] = value;
}

export default config;
