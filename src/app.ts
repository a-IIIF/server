import config from './lib/Config';
import logger from './lib/Logger';
import {servicesRunning, ArgService, StandaloneService, CronService} from './lib/Service';

servicesRunning.forEach(function initService(service) {
    switch (service.runAs) {
        case 'web':
            startWeb();
            break;
        case 'worker':
            startWorker(service as ArgService);
            break;
        case 'standalone':
            if (config.appInstance === undefined || parseInt(config.appInstance) === 0)
                startStandalone(service as StandaloneService);
            break;
        case 'cron':
            if (config.appInstance === undefined || parseInt(config.appInstance) === 0)
                startCron(service as CronService);
            break;
    }
});

async function startWeb() {
    const {default: Koa} = await import('koa');
    const {default: json} = await import('koa-json');
    const {default: bodyParser} = await import('koa-bodyparser');
    const {default: compress} = await import('koa-compress');

    const {default: iiifImageRouter} = await import('./image/router');
    const {default: iiifPresentationRouter} = await import('./presentation/router');
    const {default: iiifSearchRouter} = await import('./search/router');
    const {default: iiifAuthRouter} = await import('./authentication/router');
    const {default: fileRouter} = await import('./file/router');
    const {default: pdfRouter} = await import('./pdf/router');
    const {default: adminRouter} = await import('./admin/router');
    const {default: textRouter} = await import('./text/router');
    const {default: staticRouter} = await import('./static/router');

    const app = new Koa();

    app.use(async (ctx, next) => {
        ctx.set('Access-Control-Allow-Origin', '*');
        ctx.set('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');

        if (ctx.method === 'OPTIONS')
            ctx.status = 204;
        else
            await next();
    });

    app.use(async (ctx, next) => {
        try {
            await next();
        }
        catch (err) {
            ctx.status = err.status || 500;
            ctx.body = (err.status && err.status < 500) ? err.message : 'Internal Server Error';

            if (!err.status || err.status >= 500)
                ctx.app.emit('error', err, ctx);
        }
    });

    app.on('error', (err, ctx) => {
        if (err.code === 'EPIPE' || err.code === 'ECONNRESET') return;
        logger.error(`${err.status || 500} - ${ctx.method} - ${ctx.originalUrl} - ${err.message}`, {err});
    });

    if (config.env !== 'production') {
        const {default: morgan} = await import('koa-morgan');
        // @ts-ignore
        app.use(morgan('short', {'stream': logger.stream}));
    }

    app.use(compress());
    app.use(json({pretty: false, param: 'pretty'}));
    app.use(bodyParser());

    app.use(iiifImageRouter.routes());
    app.use(iiifPresentationRouter.routes());
    app.use(iiifSearchRouter.routes());
    app.use(iiifAuthRouter.routes());

    app.use(fileRouter.routes());
    app.use(pdfRouter.routes());
    app.use(adminRouter.routes());
    app.use(textRouter.routes());
    app.use(staticRouter.routes());

    app.proxy = true;
    app.keys = [config.secret];

    app.listen(config.port);

    logger.info('Started the web service');
}

function startStandalone(service: StandaloneService) {
    service.getService()();
    logger.info(`Standalone initialized for ${service.name}`);
}

async function startWorker(service: ArgService) {
    const {default: onTask} = await import('./lib/Worker');
    onTask(service.type, service.getService());
    logger.info(`Worker initialized for ${service.name}`);
}

async function startCron(service: CronService) {
    const cron = await import('node-cron');
    cron.schedule(service.cron, service.getService());
    logger.info(`Cron ${service.cron} scheduled for ${service.name}`);
}
