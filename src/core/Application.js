// src/core/Application.js

const http = require('http');
const URL = require('url');
const fs = require('fs');
const path = require('path');

// Dependencies
const handleError = require('./ErrorHandler');
const { RouterClass } = require('./Router');
const corsMiddleware = require('../middleware/cors');
const bodyParsers = require('../middleware/body-parsers');
const formDataMiddleware = require('../middleware/form-data');
const validateRequest = require('./Validator');
const dbManager = require('./DatabaseManager');

class Application {
    constructor() {
        this.server = null;
        this.routes = [];
        this.globalMiddleware = [];
        this.handleRequest = this._handleRequest.bind(this);
    }

    // ----------------------------------------------------
    // 1. Static Middleware Methods (Proxies)
    // ----------------------------------------------------
    static cors = corsMiddleware;
    static json = bodyParsers.json;
    static urlencoded = bodyParsers.urlencoded;
    static xml = bodyParsers.xml;
    static formData = formDataMiddleware;
    // 🚨 Database Management Proxies
    static connectDB = (name, type, config) => dbManager.connect(name, type, config);
    static query = (sql, values, name) => dbManager.query(sql, values, name); // For MySQL/MariaDB
    static pgQuery = (text, values, name) => dbManager.pgQuery(text, values, name); // For PostgreSQL
    static mongoDB = (dbName, name) => dbManager.getMongoDb(dbName, name);


    // ----------------------------------------------------
    // 2. Core API (app.use, app.get, app.listen)
    // ----------------------------------------------------

    /**
     * Mounts middleware or routers.
     * * Usage:
     * app.use(middleware)
     * app.use(router)
     * app.use('/path', middleware)
     * app.use('/path', router)
     */
    use(path, ...handlers) {
        let prefix = '/';
        let routerInstance = null;
        let middlewareHandlers = [];

        // 1. Determine arguments
        if (typeof path === 'string') {
            // Case: app.use('/path', ...)
            prefix = path;
            middlewareHandlers = handlers;
            if (handlers[0] instanceof RouterClass) {
                routerInstance = handlers[0]; // It's a router
            }
        } else if (path instanceof RouterClass) {
            // Case: app.use(router)
            routerInstance = path;
            prefix = path.prefix || '/'; // Use internal prefix if available
        } else if (typeof path === 'function') {
            // Case: app.use(middleware)
            middlewareHandlers = [path, ...handlers];
        } else if (Array.isArray(path)) {
            // Case: app.use([middleware1, middleware2])
            middlewareHandlers = path;
        }

        // 2. Register based on type
        if (routerInstance) {
            // Registering a Router
            this.globalMiddleware.push({
                pathPrefix: prefix,
                router: routerInstance
            });
        } else if (middlewareHandlers.length > 0) {
            // Registering Middleware
            if (prefix === '/') {
                // Global middleware
                this.globalMiddleware.push(...middlewareHandlers);
            } else {
                // Path-specific middleware
                this.globalMiddleware.push({
                    method: 'ALL',
                    path: prefix,
                    handlers: middlewareHandlers
                });
            }
        }
    }

    _addRoute(method, path, handlers) {
        const { regex, paramNames } = this._pathToRegex(path);
        this.routes.push({ method, path, handlers, regex, paramNames });
    }

    get(path, ...handlers) { this._addRoute('GET', path, handlers); }
    post(path, ...handlers) { this._addRoute('POST', path, handlers); }
    put(path, ...handlers) { this._addRoute('PUT', path, handlers); }
    delete(path, ...handlers) { this._addRoute('DELETE', path, handlers); }
    patch(path, ...handlers) { this._addRoute('PATCH', path, handlers); }
    head(path, ...handlers) { this._addRoute('HEAD', path, handlers); }
    options(path, ...handlers) { this._addRoute('OPTIONS', path, handlers); }
    all(path, ...handlers) { this._addRoute('*', path, handlers); }

    listen(port, cb) {
        this.server = http.createServer(this.handleRequest);
        this.server.listen(port, cb);
    }

    // ----------------------------------------------------
    // 3. Request Handling Pipeline
    // ----------------------------------------------------

    _handleRequest(req, res) {
        const request = this._enhanceRequest(req);
        const response = this._enhanceResponse(res);

        const route = this._findMatchingRoute(request);

        const handlers = [];

        // 1. Add Global Middleware (Including Router Instances)
        this.globalMiddleware.forEach(item => {
            if (!item.router) {
                handlers.push(item);
            }
        });

        // 2. Add Route Handlers (or 404)
        if (route) {
            request.params = route.params;
            handlers.push(...route.handlers);
        } else {
            handlers.push((req, res) => {
                handleError(req, res, { status: 404, message: `Not Found: ${req.method} ${req.url}` });
            });
        }

        this._executeHandlers(request, response, handlers);
    }

    async _executeHandlers(req, res, handlers, index = 0) {
        if (index >= handlers.length || res.finished) {
            return;
        }

        const next = (err) => {
            if (err) {
                return handleError(req, res, err);
            }
            setImmediate(() => this._executeHandlers(req, res, handlers, index + 1));
        };

        try {
            const handler = handlers[index];
            await Promise.resolve(handler(req, res, next));
        } catch (err) {
            handleError(req, res, err);
        }
    }


    // ----------------------------------------------------
    // 4. Helpers: Enhancement and Routing
    // ----------------------------------------------------

    _pathToRegex(path) {
        const paramNames = [];
        const regexPath = path.replace(/:(\w+)/g, (_, paramName) => {
            paramNames.push(paramName);
            return '([^/]+)';
        });
        const regex = new RegExp(`^${regexPath}$`);
        return { regex, paramNames };
    }

    /**
     * Basic helper to determine MIME type based on file extension.
     * 💡 For production, a more comprehensive library (like 'mime-types') should be used.
     */
    _getMimeType(filePath) {
        const extension = path.extname(filePath).toLowerCase();
        switch (extension) {
            case '.html': return 'text/html';
            case '.css': return 'text/css';
            case '.js': return 'application/javascript';
            case '.json': return 'application/json';
            case '.png': return 'image/png';
            case '.jpg':
            case '.jpeg': return 'image/jpeg';
            case '.gif': return 'image/gif';
            default: return 'application/octet-stream';
        }
    }

    _findMatchingRoute(req) {
        const routesToCheck = [];
        
        // Collect primary routes
        this.routes.forEach(r => routesToCheck.push({ ...r, calculatedFullPath: r.path }));

        // Collect routes from mounted routers and path-specific middleware
        this.globalMiddleware.forEach(item => {
            if (item.router instanceof RouterClass) {
                // This item is a Router
                item.router.stack.forEach(r => {
                    // 👈 Robust Path Joining Logic
                    let prefix = item.pathPrefix || '/';
                    let path = r.path || '/';

                    // Clean trailing slash from prefix
                    if (prefix.length > 1 && prefix.endsWith('/')) {
                        prefix = prefix.slice(0, -1);
                    }
                    // Clean leading slash from route path
                    if (path.length > 0 && path.startsWith('/')) {
                        path = path.slice(1);
                    }

                    // Combine
                    let fullPath = (prefix === '/' ? '' : prefix) + '/' + path;
                    
                    // Final cleanup: remove double slashes, trim trailing slash
                    fullPath = fullPath.replace(/\/\//g, '/');
                    if (fullPath.length > 1 && fullPath.endsWith('/')) {
                        fullPath = fullPath.slice(0, -1);
                    }
                    if (fullPath === '') fullPath = '/'; // Ensure root path

                    routesToCheck.push({
                        ...r,
                        calculatedFullPath: fullPath, 
                    });
                });
            } else if (item.path && item.handlers) {
                // This item is path-specific middleware
                routesToCheck.push({
                    method: item.method || 'ALL', 
                    path: item.path, 
                    handlers: item.handlers, 
                    calculatedFullPath: item.path,
                });
            }
        });

        const { method, pathname } = req;
        
        for (const route of routesToCheck) {
            // Use the pre-calculated full path
            const fullPath = route.calculatedFullPath;
            const { regex, paramNames } = this._pathToRegex(fullPath);
            
            if (route.method !== method && route.method !== 'ALL' && route.method !== '*') continue;

            const match = pathname.match(regex);

            if (match) {
                const params = {};
                paramNames.forEach((name, index) => {
                    params[name] = match[index + 1]; 
                });
                
                return { 
                    ...route, 
                    handlers: route.handlers,
                    params
                };
            }
        }
        return null;
    }

    _enhanceRequest(req) {
        const parsedUrl = new URL.URL(req.url, `http://${req.headers.host}`);
        req.pathname = parsedUrl.pathname;
        req.query = Object.fromEntries(parsedUrl.searchParams);
        req.params = {};
        req.body = {};

        req.bearerToken = () => {
            const authHeader = req.headers['authorization'];
            if (!authHeader) {
                return null; // No Authorization header present
            }

            // Format "Bearer [token]"
            const parts = authHeader.split(' ');
            if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
                return parts[1]; // Return the [token] part
            }

            return null; // Invalid format
        };

        req.basicAuth = () => {
            const authHeader = req.headers['authorization'];
            if (!authHeader) {
                return null; // No Authorization header present
            }
            const parts = authHeader.split(' ');
            if (parts.length === 2 && parts[0].toLowerCase() === 'basic') {
                const decoded = Buffer.from(parts[1], 'base64').toString('utf-8');
                const [username, password] = decoded.split(':');
                return { username, password };
            }
            return null; // Invalid format
        }

        /**
         * Validates request data (body, params, query) against string-based rules.
         * @param {string[]} sources - Sources to check: ['body', 'params', 'query'].
         * @param {object} rules - Object defining string validation rules.
         * @returns {object} { error: boolean, errors: object, validated: object }
         */
        req.validate = (sources, rules) => {
            return validateRequest(req, sources, rules);
        };

        return req;
    }

    _enhanceResponse(res) {
        res.status = (code) => {
            res.statusCode = code;
            return res;
        };

        res.send = (data) => {
            if (res.finished) return;

            if (!res.getHeader('Content-Type')) {
                res.setHeader('Content-Type', 'text/html');
            }
            res.end(data);
        };

        res.json = (data) => {
            if (res.finished) return;

            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(data));
        }

        /**
         * Redirects the request to the specified URL.
         * @param {string} url - The URL to redirect to.
         * @param {number} [status=302] - The HTTP status code for the redirection.
         */
        res.redirect = (url, status = 302) => {
            if (res.finished) return;

            res.setHeader('Location', url);
            res.statusCode = status;
            res.end();
        };

        /**
         * Transfers the file at the given path to the client.
         * @param {string} filePath - The absolute path to the file.
         */
        res.sendFile = (filePath) => {
            if (res.finished) return;

            // Ensure the path is absolute (or resolve it based on your setup)
            // For simplicity, we assume the user provides an absolute path or path.resolve(__dirname, 'file')
            const absolutePath = path.resolve(filePath); 

            fs.stat(absolutePath, (err, stats) => {
                if (err || !stats.isFile()) {
                    // File not found or is a directory (404 Not Found)
                    res.statusCode = 404;
                    res.end('File Not Found');
                    return;
                }

                // 1. Set Content-Type based on file extension (basic implementation)
                const mimeType = this._getMimeType(absolutePath);
                res.setHeader('Content-Type', mimeType);
                res.setHeader('Content-Length', stats.size);
                
                // 2. Stream the file content
                const readStream = fs.createReadStream(absolutePath);
                
                readStream.on('error', (err) => {
                    // Handle read errors (e.g., file locked)
                    console.error('File read error:', err);
                    res.status(500).end('Internal Server Error');
                });

                readStream.pipe(res); // Pipe the file stream directly to the response
            });
        };

        return res;
    }
}

module.exports = Application;