// src/middleware/cors.js

function cors(options = {}) {
    const defaults = {
        origin: '*',
        methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
        allowedHeaders: 'Content-Type,Authorization,User-Agent,Accept',
        exposedHeaders: '',
        credentials: false,
        maxAge: 86400,
        preflightContinue: false, 
        optionsSuccessStatus: 204, 
    };
    const config = { ...defaults, ...options };

    return (req, res, next) => {
        const origin = req.headers.origin || '*';
        const reqMethod = req.method;

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
            return next();
        }

        res.setHeader('Access-Control-Allow-Methods', config.methods);
        res.setHeader('Access-Control-Allow-Headers', config.allowedHeaders);

        if (config.credentials) {
            res.setHeader('Access-Control-Allow-Credentials', 'true');
        }
        if (config.exposedHeaders) {
            res.setHeader('Access-Control-Expose-Headers', config.exposedHeaders);
        }

        if (reqMethod === 'OPTIONS') {
            res.setHeader('Access-Control-Max-Age', config.maxAge);

            if (config.preflightContinue) {
                next();
            } else {
                res.status(config.optionsSuccessStatus).end();
            }
        } else {
            next();
        }
    };
}

module.exports = cors;