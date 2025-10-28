// src/middleware/body-parsers.js

const URL = require('url');
const { XMLParser } = require('fast-xml-parser');

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
const xmlParser = new XMLParser(xmlParserOptions);

/** Parse JSON body */
function json() {
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
                e.status = 400; e.message = "Invalid JSON format"; next(e);
            }
        });
        req.on('error', (err) => next(err));
    };
}

/** Parse URL-encoded body */
function urlencoded() {
    return (req, res, next) => {
        const contentType = req.headers['content-type'];
        if (['GET', 'HEAD'].includes(req.method) || !contentType || !contentType.includes('application/x-www-form-urlencoded')) {
            return next();
        }

        let rawData = '';
        req.on('data', chunk => { rawData += chunk.toString(); });
        req.on('end', () => {
            try {
                // Use built-in URLSearchParams for parsing
                req.body = Object.fromEntries(new URLSearchParams(rawData));
                next();
            } catch (e) {
                e.status = 400; e.message = "Invalid URL-encoded format"; next(e);
            }
        });
        req.on('error', (err) => next(err));
    };
}

/** Parse XML body */
function xml() {
    return (req, res, next) => {
        const contentType = req.headers['content-type'];
        if (req.method === 'GET' || req.method === 'HEAD' || !contentType || !/xml/i.test(contentType)) {
            return next();
        }

        let rawData = '';
        req.on('data', chunk => { rawData += chunk.toString(); });
        req.on('end', () => {
            if (!rawData) { req.body = {}; return next(); }
            try {
                // Use fast-xml-parser (Synchronous)
                req.body = xmlParser.parse(rawData);
                next();
            } catch (e) {
                e.status = 400; e.message = 'Invalid XML body format'; next(e);
            }
        });
        req.on('error', (err) => next(err));
    };
}

module.exports = { json, urlencoded, xml };