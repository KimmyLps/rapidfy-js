// src/middleware/form-data.js

const Busboy = require('busboy');
const os = require('os');
const path = require('path');
const fs = require('fs');

/** Parse multipart/form-data body (file uploads) */
function formData(options = {}) {
    const defaults = {
        uploadDir: os.tmpdir(),
        maxFileSize: 5 * 1024 * 1024,
        maxFiles: 1,
        highWaterMark: 64 * 1024,
        fileHwm: 16 * 1024,
    };
    const config = { ...defaults, ...options };

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

        if (req.method === 'GET' || req.method === 'HEAD' || !contentType ||
            !contentType.includes('multipart/form-data')
        ) {
            return next();
        }

        const busboy = Busboy({ headers: req.headers, ...busboyOptions });
        req.body = {};
        req.files = {};
        const tempDir = config.uploadDir;

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

        busboy.on('field', (name, val, info) => {
            req.body[name] = val;
        });

        busboy.on('file', (name, file, info) => {
            const filePromise = new Promise((resolve, reject) => {
                const filename = info.filename || Date.now().toString();
                const saveTo = path.join(tempDir, filename);
                const writeStream = fs.createWriteStream(saveTo);

                req.files[name] = {
                    fieldName: name, filename: info.filename, mimetype: info.mimeType,
                    tempFilePath: saveTo, size: 0
                };

                file.on('data', (data) => { req.files[name].size += data.length; });

                writeStream.on('finish', resolve);
                writeStream.on('error', (err) => { console.error(`[RapidfyJS Error] WriteStream failed for ${saveTo}:`, err); reject(err); });
                file.on('error', (err) => { console.error(`[RapidfyJS Error] InputStream failed for ${info.filename}:`, err); writeStream.end(); reject(err); });

                file.pipe(writeStream);

                writeStream.on('close', () => { console.log(`[RapidfyJS Success] File saved to: ${saveTo}`); });
            });
            filePromises.push(filePromise);
        });

        busboy.on('finish', () => {
            Promise.all(filePromises)
                .then(() => next())
                .catch((err) => { err.status = 500; next(err); });
        });
        
        busboy.on('error', (err) => { err.status = 400; next(err); });
        
        req.pipe(busboy);
    };
}

module.exports = formData;