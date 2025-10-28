// src/core/ErrorHandler.js

function handleError(req, res, err) {
    if (res.headersSent || res.finished) {
        return;
    }
    
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

module.exports = handleError;