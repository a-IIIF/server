import * as fs from 'fs';
import * as path from 'path';
import * as Router from '@koa/router';

import {getText} from '../lib/Text';
import logger from '../lib/Logger';
import HttpError from '../lib/HttpError';

const htmlTemplate = fs.readFileSync(path.join(__dirname, 'text.html'), 'utf8');

const router = new Router({prefix: '/text'});

router.get('/:id', async ctx => {
    logger.info(`Received a request for text with id ${ctx.params.id}`);

    const text = await getText(ctx.params.id);
    if (!text)
        throw new HttpError(404, `No text found with id ${ctx.params.id}`);

    const title = text.type === 'transcription' ? 'Transcription' : `Translation ${text.language}`;
    const htmlText = text.text.replace(/(\r\n|\n\r|\r|\n)/g, '<br>');

    ctx.type = 'text/html';
    ctx.body = htmlTemplate
        .replace('{{title}}', title)
        .replace('{{text}}', htmlText);

    logger.info(`Sending a text with id ${ctx.params.id}`);
});

export default router;
