const { Router: createRouter, RouterClass } = require('./router/router');
const http = require('http');
const URL = require('url');
const { XMLParser } = require('fast-xml-parser');
const Busboy = require('busboy');
const os = require('os');
const path = require('path');
const fs = require('fs');

const xmlParserOptions = {
    ignoreDeclaration: true,
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    attributesGroupName: "attributes",
    textNodeName: "#text",
    trimValues: true,
    parseTag: true,
    parseAttribute: true,
    parseNodeValue: true,
    allowBooleanAttributes: true,
    arrayMode: "strict",
    namespaceAttributesGroup: "namespaceAttributes",
};
const parser = new XMLParser(xmlParserOptions);

class Application {
    constructor() {
        this.server = null;
        this.routes = [];
        this.globalMiddleware = [];
        this.handleRequest = this._handleRequest.bind(this);
    }

    // ----------------------------------------------------
    // 1. Static Middleware Methods
    // ----------------------------------------------------

    /**
     * @static
     * Export the cors middleware function to be used in the application.
     * @param {Object} options
     * @example
     * const rapidfyJs = require('rapidfy-js');
     * const app = rapidfyJs();
     * app.use(rapidfyJs.cors({
     *    origin: 'http://example.com',
     *    methods: 'GET,POST,PUT,DELETE,OPTIONS',
     *    allowedHeaders: 'Content-Type,Authorization',
     * }));
     */
    static cors(options = {}) {
        const defaults = {
            origin: '*',
            methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
            allowedHeaders: 'Content-Type,Authorization,User-Agent,Accept',
            exposedHeaders: '',
            credentials: false,
            maxAge: 86400,
            preflightContinue: false, // If true, Pre-flight (OPTIONS) requests are passed to next handlers
            optionsSuccessStatus: 204, // HTTP Status Code for Pre-flight response
        };
        const config = { ...defaults, ...options };

        return (req, res, next) => {
            const origin = req.headers.origin || '*';
            const reqMethod = req.method;

            // 1. Set Access-Control-Allow-Origin
            let allowOrigin;
            if (config.origin === '*') {
                allowOrigin = origin;
            } else if (Array.isArray(config.origin)) {
                allowOrigin = config.origin.includes(origin) ? origin : false;
            } else {
                allowOrigin = config.origin;
            }

            if (allowOrigin) {
                res.setHeader('Access-Control-Allow-Origin', allowOrigin);
            } else if (reqMethod !== 'OPTIONS') {
                // If origin not allowed and not a Pre-flight request, skip CORS headers
                return next();
            }

            // 2. Set other CORS headers
            res.setHeader('Access-Control-Allow-Methods', config.methods);
            res.setHeader('Access-Control-Allow-Headers', config.allowedHeaders);

            if (config.credentials) {
                res.setHeader('Access-Control-Allow-Credentials', 'true');
            }
            if (config.exposedHeaders) {
                res.setHeader('Access-Control-Expose-Headers', config.exposedHeaders);
            }

            // 3. Setting Pre-flight Request (OPTIONS)
            if (reqMethod === 'OPTIONS') {
                res.setHeader('Access-Control-Max-Age', config.maxAge);

                if (config.preflightContinue) {
                    // If true, pass to next handlers
                    next();
                } else {
                    // Respond immediately
                    res.status(config.optionsSuccessStatus).end();
                }
            } else {
                // 4. For other requests, proceed to next middleware
                next();
            }
        };
    }

    // Parse JSON body
    static json() {
        return (req, res, next) => {
            const contentType = req.headers['content-type'];
            if (['GET', 'HEAD'].includes(req.method) || !contentType || !contentType.includes('application/json')) {
                return next();
            }

            let rawData = '';

            req.on('data', chunk => { rawData += chunk.toString(); });

            req.on('end', () => {
                try {
                    req.body = rawData ? JSON.parse(rawData) : {};
                    next();
                } catch (e) {
                    e.status = 400; // Bad Request
                    e.message = "Invalid JSON format";
                    next(e);
                }
            });

            req.on('error', (err) => next(err));
        };
    }

    // Parse URL-encoded body
    static urlencoded() {
        return (req, res, next) => {
            const contentType = req.headers['content-type'];
            if (['GET', 'HEAD'].includes(req.method) || !contentType || !contentType.includes('application/x-www-form-urlencoded')) {
                return next();
            }

            let rawData = '';
            req.on('data', chunk => { rawData += chunk.toString(); });

            req.on('end', () => {
                try {
                    req.body = Object.fromEntries(new URLSearchParams(rawData));
                    next();
                } catch (e) {
                    e.status = 400; // Bad Request
                    e.message = "Invalid URL-encoded format";
                    next(e);
                }
            });

            req.on('error', (err) => next(err));
        };
    }

    // Parse XML body
    static xml() {
        return (req, res, next) => {
            const contentType = req.headers['content-type'];

            if (req.method === 'GET' || req.method === 'HEAD' || !contentType || !/xml/i.test(contentType)) {
                return next();
            }

            let rawData = '';
            req.on('data', chunk => { rawData += chunk.toString(); });

            req.on('end', () => {

                if (!rawData) {
                    req.body = {};
                    return next();
                }

                try {
                    const result = parser.parse(rawData);
                    req.body = result;
                    next();

                } catch (e) {
                    e.status = 400;
                    e.message = 'Invalid XML body format';
                    next(e);
                }
            });

            req.on('error', (err) => next(err));
        };
    }

    /**
     * Parse multipart/form-data body (file uploads)
     * @param {Object} options - Configuration options for form-data parsing
     * @param {String} options.uploadDir - Directory to save uploaded files (default: os.tmpdir())
     * @param {number} options.maxFileSize - Maximum file size in bytes (default: 5MB)
     * @param {number} options.maxFiles - Maximum number of files to accept (default: 1)
     * @param {number} options.highWaterMark - High water mark for Busboy stream (default: 64KB)
     * @param {number} options.fileHwm - High water mark for file streams (default: 16KB)
     * @param {number} options.fieldNameSize - Maximum field name size (default: 100)
     * @param {number} options.fieldSize - Maximum field value size (default: 1MB)
     * @param {number} options.fields - Maximum number of non-file fields (default: unlimited)
     * @param {number} options.parts - Maximum number of parts (fields + files) (default: unlimited)
     * @return {Function} The middleware function to handle multipart/form-data requests.
     * @example
     * const rapidfyJs = require('rapidfy-js');
     * const path = require('path');
     * const app = rapidfyJs();
     * app.use(rapidfyJs.formData({
     *    uploadDir: path.join(__dirname, 'uploads'),
     *    maxFileSize: 10 * 1024 * 1024, // 10 MB
     *    maxFiles: 5,
     * }));
     */
    static formData(options = {}) {
        // Default options for the framework and Busboy limits
        const defaults = {
            uploadDir: os.tmpdir(),
            maxFileSize: 5 * 1024 * 1024, // 5MB limit per file
            maxFiles: 1, // Limit the number of files
            // Busboy I/O Defaults
            highWaterMark: 64 * 1024,
            fileHwm: 16 * 1024,
        };

        // Merge user options with framework defaults
        const config = { ...defaults, ...options };

        // Busboy configuration based on merged options
        const busboyOptions = {
            limits: {
                fieldNameSize: config.fieldNameSize || 100,
                fieldSize: config.fieldSize || 1024 * 1024,
                fields: config.fields,
                fileSize: config.maxFileSize,
                files: config.maxFiles,
                parts: config.parts,
            },
            highWaterMark: config.highWaterMark,
            fileHwm: config.fileHwm,
            preservePath: config.preservePath || false,
        };

        return (req, res, next) => {
            const contentType = req.headers['content-type'];

            // 1. Content-Type Check: Skip if not a multipart/form-data request
            if (req.method === 'GET' || req.method === 'HEAD' || !contentType ||
                !contentType.includes('multipart/form-data')
            ) {
                return next();
            }

            // 2. Initialize Busboy and Request Objects
            // Pass request headers to Busboy for boundary parsing
            const busboy = Busboy({ headers: req.headers, ...busboyOptions });
            req.body = {};
            req.files = {};

            // Use the configured upload directory
            const tempDir = config.uploadDir;

            // 3. Ensure Upload Directory Exists
            if (!fs.existsSync(tempDir)) {
                try {
                    fs.mkdirSync(tempDir, { recursive: true });
                    console.log(`[RapidfyJS Success] Created upload directory: ${tempDir}`);
                } catch (error) {
                    console.error(`[RapidfyJS Error] Failed to create directory ${tempDir}:`, error);
                    return next(new Error('Failed to create upload directory.'));
                }
            }

            const filePromises = [];

            // 4. Handle Text Fields
            busboy.on('field', (name, val, info) => {
                req.body[name] = val; // Store text fields in req.body
            });

            // 5. Handle File Uploads
            busboy.on('file', (name, file, info) => {
                const filePromise = new Promise((resolve, reject) => {
                    const filename = info.filename || Date.now().toString();
                    const saveTo = path.join(tempDir, filename);
                    const writeStream = fs.createWriteStream(saveTo);

                    // Store file metadata in req.files
                    req.files[name] = {
                        fieldName: name,
                        filename: info.filename,
                        mimetype: info.mimeType,
                        tempFilePath: saveTo,
                        size: 0
                    };

                    // Track file size
                    file.on('data', (data) => {
                        req.files[name].size += data.length;
                    });

                    // CRITICAL: Resolve the Promise when writing is confirmed to be finished
                    writeStream.on('finish', resolve);

                    // Error Handling for WriteStream (Disk I/O errors)
                    writeStream.on('error', (err) => {
                        console.error(`[RapidfyJS Error] File error writeStream failed for ${saveTo}:`, err);
                        reject(err);
                    });

                    // Error Handling for InputStream (Busboy/Client errors)
                    file.on('error', (err) => {
                        console.error(`[RapidfyJS Error] File error InputStream failed for ${info.filename}:`, err);
                        writeStream.end(); // Attempt to close stream cleanly
                        reject(err);
                    });

                    // Pipe: Start streaming data from request to the file on disk
                    file.pipe(writeStream);

                    // Log the success path (for debugging purposes)
                    writeStream.on('close', () => {
                        console.log(`[RapidfyJS Success] File saved to: ${saveTo}`);
                    });
                });

                filePromises.push(filePromise);
            });

            // 6. Completion and Error Handling
            busboy.on('finish', () => {
                // Wait for all file writing Promises to resolve before continuing the middleware chain
                Promise.all(filePromises)
                    .then(() => next())
                    .catch((err) => {
                        err.status = 500;
                        next(err); // Pass internal server error to handler
                    });
            });

            busboy.on('error', (err) => {
                err.status = 400; // Treat parsing error as Bad Request
                next(err);
            });

            // 7. Start the parsing process by piping the raw request into Busboy
            req.pipe(busboy);
        };
    }

    // ----------------------------------------------------
    // 1. Core API (app.use, app.get, app.listen)
    // ----------------------------------------------------

    use(path, handlerOrRouter) {
        if (typeof path === 'function' || Array.isArray(path)) {
            const handlers = Array.isArray(path) ? path : [path, ...Array.from(arguments).slice(1)];
            this.globalMiddleware.push(...handlers);
        }
        else if (path && handlerOrRouter instanceof RouterClass) {
            this.globalMiddleware.push({ 
                pathPrefix: path, 
                router: handlerOrRouter 
            });
        }
        else if (typeof path === 'string') {
            const handlers = Array.from(arguments).slice(1);
            this.globalMiddleware.push({ 
                method: 'ALL', 
                path: path, 
                handlers: handlers 
            });
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
    // 2. Request Handling Pipeline
    // ----------------------------------------------------

    _handleRequest(req, res) {
        const request = this._enhanceRequest(req);
        const response = this._enhanceResponse(res);

        const route = this._findMatchingRoute(request);

        const handlers = [...this.globalMiddleware];

        if (route) {
            request.params = route.params;
            request.query = URL.parse(request.url, true).query;
            handlers.push(...route.handlers);
        } else {
            // 404 Not Found handler
            handlers.push((req, res) => {
                res.statusCode = 404;
                this._handleError(req, res, { status: 404, message: `Not Found: ${req.method} ${req.url}` });
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
                return this._handleError(req, res, err);
            }
            setImmediate(() => this._executeHandlers(req, res, handlers, index + 1));
        };

        try {
            const handler = handlers[index];
            await Promise.resolve(handler(req, res, next)); // Support async handlers
        } catch (err) {
            this._handleError(req, res, err);
        }
    }

    _handleError(req, res, err) {
        if (res.headersSent || res.finished) {
            return;
        }
        // console.error(`[RapidfyJS Error] Path: ${req.url}`, err.stack || err);
        res.statusCode = err.status || err.statusCode || 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
            status: 'error',
            code: res.statusCode,
            message: err.message || 'Internal Server Error',
            data: null,
            metadata: null
        }));
    }

    // ----------------------------------------------------
    // 3. Helpers: Enhancement and Routing
    // ----------------------------------------------------

    // Convert express-like path to regex and extract param names 
    _pathToRegex(path) {
        const paramNames = [];
        const regexPath = path.replace(/:(\w+)/g, (_, paramName) => {
            paramNames.push(paramName);
            return '([^/]+)';
        });
        const regex = new RegExp(`^${regexPath}$`);
        return { regex, paramNames };
    }

    // Find the first matching route for the request method and path
    _findMatchingRoute(req) {
        const routesToCheck = [];
        
        routesToCheck.push(...this.routes.map(r => ({ ...r, pathPrefix: '', isRouterRoute: false })));

        this.globalMiddleware.forEach(item => {
            if (item.router instanceof RouterClass) {
                item.router.stack.forEach(r => {
                    routesToCheck.push({
                        ...r,
                        pathPrefix: item.pathPrefix,
                        isRouterRoute: true,
                    });
                });
            } else if (item.path && item.handlers) {
                routesToCheck.push({
                    method: item.method || 'ALL', 
                    path: item.path, 
                    handlers: item.handlers, 
                    pathPrefix: '',
                    isMiddleware: true
                });
            }
        });

        const { method, pathname } = req;
        
        for (const route of routesToCheck) {
            const fullPath = (route.pathPrefix || '') + route.path;
            const { regex, paramNames } = this._pathToRegex(fullPath);
            
            if (route.method !== method && route.method !== 'ALL') continue;

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

    // Enhance the native request object
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

        return req;
    }

    // Enhance the native response object
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
        return res;
    }
}

function createApplication() {
    const app = new Application();
    return app;
}

// Attach static middleware methods
createApplication.cors = Application.cors;
createApplication.json = Application.json;
createApplication.urlencoded = Application.urlencoded;
createApplication.xml = Application.xml;
createApplication.formData = Application.formData;

createApplication.Router = createRouter;

module.exports = createApplication;