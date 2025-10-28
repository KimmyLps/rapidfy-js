// src/core/Router.js

class RouterClass {
    /**
     * Create a new Router instance.
     * @param {object} [options] - Router options.
     * @param {string} [options.prefix] - A path prefix for all routes in this router.
     */
    constructor(options = {}) {
        this.stack = []; // Stores routes and middleware specific to this router
        this.prefix = options.prefix || null; // Store the prefix
    }

    /** Helper method to add a route definition to the stack */
    _addRoute(method, path, handlers) {
        this.stack.push({ method, path, handlers: Array.isArray(handlers) ? handlers : [handlers] });
    }

    // HTTP Verb methods
    get(path, ...handlers) { this._addRoute('GET', path, handlers); }
    post(path, ...handlers) { this._addRoute('POST', path, handlers); }
    put(path, ...handlers) { this._addRoute('PUT', path, handlers); }
    delete(path, ...handlers) { this._addRoute('DELETE', path, handlers); }
    patch(path, ...handlers) { this._addRoute('PATCH', path, handlers); }
    head(path, ...handlers) { this._addRoute('HEAD', path, handlers); }
    options(path, ...handlers) { this._addRoute('OPTIONS', path, handlers); }
    all(path, ...handlers) { this._addRoute('ALL', path, handlers); } // Catch all verbs

    /** Middleware method: Can be used for router-specific middleware */
    use(path, ...handlers) {
        if (typeof path === 'function' || Array.isArray(path)) {
            // Middleware for all paths in this router
            const h = Array.isArray(path) ? path : [path, ...handlers];
            this.stack.push({ method: 'ALL', path: '*', handlers: h });
        } 
        else if (typeof path === 'string') {
             // Path-specific middleware
             this.stack.push({ method: 'ALL', path: path, handlers: handlers });
        }
    }
}

/** * Factory function for creating new Router instances 
 * @param {object} [options] - Router options (e.g., { prefix: '/api/v1' }).
 */
function createRouter(options = {}) { // 👈 Accept options
    return new RouterClass(options); // 👈 Pass options to constructor
}

module.exports = { 
    Router: createRouter, 
    RouterClass: RouterClass
};