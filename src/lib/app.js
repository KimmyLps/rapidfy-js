var http = require('http');
var Router = require('./router/router').Router;
var createRouter = require('./router/router');
var Request = require('./request');
var Response = require('./response');
var MiddlewareManager = require('./middleware');

exports = module.exports = createApplication;

function createApplication() {
    return new RapidfyJS();
}

class RapidfyJS {
    constructor() {
        this.router = createRouter();
        this.middleware = new MiddlewareManager();
        this.init();
    }

    init() {
        this.use((_, res, next) => {
            res.setHeader('X-Powered-By', 'RapidfyJS');
            next();
        });
    }

    use(path, middleware = null) {
        if (typeof path === 'function') {
            this.middleware.use(path);
        } else if (typeof path === 'string' && typeof middleware === 'function') {
            this.middleware.use((req, res, next) => {
                if (req.path.startsWith(path)) {
                    return middleware(req, res, next);
                }
                next();
            });
        } else if (typeof path === 'string' && middleware && typeof middleware.handle === 'function') {
            this.middleware.use((req, res, next) => {
                if (req.url.startsWith(path)) {
                    return middleware.handle(req, res, next);
                }
                next();
            });
        } else if (path && typeof path === 'object' && path.router instanceof Router && path.router.routes.length > 0) {
            path.router.routes.forEach(route => this.router.routes.push(route));
        } else if (path && typeof path.handle === 'function') {
            this.middleware.use((req, res, next) => path.handle(req, res, next));
        } else {
            this.middleware.use((req, res, next) => this.router.errorHandler(new Error('Invalid middleware'), req, res))
        }
        return this;
    }

    get(path, handler) {
        this.router.route(path, 'GET', handler);
        return this;
    }

    post(path, handler) {
        this.router.route(path, 'POST', handler);
        return this;
    }

    put(path, handler) {
        this.router.route(path, 'PUT', handler);
        return this;
    }

    delete(path, handler) {
        this.router.route(path, 'DELETE', handler);
        return this;
    }

    patch(path, handler) {
        this.router.route(path, 'PATCH', handler);
        return this;
    }

    head(path, handler) {
        this.router.route(path, 'HEAD', handler);
        return this;
    }

    options(path, handler) {
        this.router.route(path, 'OPTIONS', handler);
        return this;
    }

    all(path, handler) {
        this.router.route(path, '*', handler);
        return this;
    }

    handle(req, res) {
        const request = new Request(req);
        const response = new Response(res);

        this.middleware.execute(request, response, (err) => {
            if (err) {
                return this.router.errorHandler(err, request, response);
            }
            this.router.handle(request, response);
        });
        return this;
    }

    listen(port, cb) {
        const server = http.createServer(this.handle.bind(this));
        server.listen(port, cb);
    }
}

exports.cors = require('./cors').cors;
exports.json = require('../utils/parser').parseBody;

exports.createSwagger = require('./swagger').createSwagger;
exports.swaggerServe = require('./swagger').swaggerServe;
exports.Router = createRouter;