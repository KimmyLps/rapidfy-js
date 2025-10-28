// src/core/ApplicationFactory.js

const Application = require('./Application');
const { Router: createRouter } = require('./Router');

function createApplication() {
    const app = new Application();
    return app;
}

// Attach static middleware methods (Proxies from Application.js)
createApplication.cors = Application.cors;
createApplication.json = Application.json;
createApplication.urlencoded = Application.urlencoded;
createApplication.xml = Application.xml;
createApplication.formData = Application.formData;

// Attach Router Factory
createApplication.Router = createRouter;

module.exports = createApplication;