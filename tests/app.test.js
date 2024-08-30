const rapidfyJs = require('../index');

test('Framework should initialize without errors', () => {
    const app = rapidfyJs();
    expect(app).toBeDefined();
});

test('Test use bodyParser', () => {
    const app = rapidfyJs();
    app.use(rapidfyJs.json());
    expect(app).toBeDefined();
});

test('Test Router', () => {
    const router = rapidfyJs.Router();
    expect(router).toBeDefined();
});