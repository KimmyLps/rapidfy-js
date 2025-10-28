# 🚀 RapidfyJS — Lightweight Node.js Web Framework

[![npm version](https://badge.fury.io/js/rapidfy-js.svg)](https://badge.fury.io/js/rapidfy-js)
[![CI Node.js Package](https://github.com/KimmyLps/rapidfy-js/actions/workflows/ci-package.yml/badge.svg?branch=main&event=push)](https://github.com/KimmyLps/rapidfy-js/actions/workflows/ci-package.yml)

**Fast, unopinionated, minimalist web framework for [Node.js](http://nodejs.org).**

## Table of contents

* [Introduction](#introduction)
* [Getting Started](#getting-started)
* [Features](#features)
* [Documentation](#documentation)
* [Contributing](#contributing)
* [License](#license)

## Introduction
RapidfyJS is a lightweight web framework built on the Node.js http core module.
It supports middleware, routing, validation, file uploads, XML/JSON parsing, and multiple database integrations (MongoDB, MySQL, PostgreSQL).

## Getting Started
To start using RapidfyJS, follow these steps:

### 📦 Installation
```bash
npm install rapidfy-js
```
Create a new file, index.js, and copy the [following](#️-basic-usage) code:

Or clone the example repository and run:
```bash
git clone https://github.com/KimmyLps/rapidfy-js-repo.git
cd rapidfy-js-repo
npm install
```

### 🏗️ Basic Usage
```javascript
const path = require('path');
const rapidfyJs = require('./src/core/Application');

// Create the app
const app = rapidfyJs();
const router = rapidfyJs.Router();

// ✅ Middleware: parse JSON, URL-encoded, XML, CORS, FormData
app.use(rapidfyJs.cors());
app.use(rapidfyJs.json());
app.use(rapidfyJs.urlencoded());
app.use(rapidfyJs.xml());
app.use(rapidfyJs.formData({
  uploadDir: path.join(__dirname, 'uploads'),
  maxFileSize: 10 * 1024 * 1024,
  maxFiles: 5,
}));

// ✅ Basic route
router.get('/', (req, res) => {
  res.json({ message: 'Welcome to RapidfyJS!' });
});

// ✅ Route POST + validation
router.post('/user', (req, res) => {
  const result = req.validate(['body'], {
    name: 'required|string',
    email: 'required|email',
  });

  if (result.error) {
    return res.status(400).json({
      status: 'error',
      message: 'Validation failed',
      errors: result.errors,
    });
  }

  res.json({
    status: 'success',
    data: result.validated,
  });
});

// ✅ File upload route
router.post('/upload', (req, res) => {
  res.json({
    status: 'success',
    message: 'File uploaded successfully',
    files: req.files,
  });
});

// ✅ Route for XML body
router.post('/xml', (req, res) => {
  res.json({
    message: 'Received XML data',
    data: req.body,
  });
});

// ✅ Mount router
app.use('/api/v1', router);

// ✅ Start server
app.listen(4000, () => console.log('🚀 RapidfyJS running on port 4000'));

```
## Features

### 🧱 Middleware Usage
JSON Parser
```javascript
app.use(rapidfyJs.json());
```

URL-encoded Parser
```javascript
app.use(rapidfyJs.urlencoded());
```

XML Parser
```javascript
app.use(rapidfyJs.xml());
```

CORS
```javascript
app.use(rapidfyJs.cors());
```

FormData / File Upload
```javascript
app.use(rapidfyJs.formData({
  uploadDir: path.join(__dirname, 'uploads'),
  maxFileSize: 10 * 1024 * 1024,
  maxFiles: 5,
  fieldSize: 10 * 1024,
  fields: 20,
}));
```

Prefix router
```javascript
const router = rapidfyJs.Router({ prefix: '/api/v1' });
router.get('/profile', (req, res) => {
  res.status(200).json({ user: 'Kimmy', role: 'admin' });
});
app.use(router);

// Ex. http://localhost:3000/api/v1/profile
```

### 💾 Database Integration
RapidfyJS supports multiple databases via `dbManager`.

#### MongoDB
```javascript
await rapidfyJs.connectDB('default', 'mongodb', {
  uri: 'mongodb://localhost:27017/mydb',
});
const db = rapidfyJs.mongoDB('mydb', 'default');
const users = await db.collection('users').find().toArray();

```

#### MySQL / MariaDB
```javascript
await rapidfyJs.connectDB('main', 'mysql', {
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'testdb',
});
const results = await rapidfyJs.query('SELECT * FROM users WHERE id = ?', [1], 'main');

```

#### PostgreSQL
```javascript
await rapidfyJs.connectDB('pgdb', 'postgres', {
  host: 'localhost',
  user: 'postgres',
  password: '',
  database: 'testdb',
});
const results = await rapidfyJs.pgQuery('SELECT * FROM users', [], 'pgdb');
```

### 🧩 Request Helpers
`req.query`

Access query parameters:
```javascript
router.get('/search', (req, res) => {
  res.json(req.query);
});
```

`req.params`

Dynamic route parameters:
```javascript
router.get('/users/:id', (req, res) => {
  res.json({ userId: req.params.id });
});
```

`req.bearerToken()`

Extract Bearer token from Authorization header:
```javascript
router.get('/auth', (req, res) => {
  res.json({ token: req.bearerToken() });
});
```

`req.basicAuth()`

Extract Basic Auth credentials:
```javascript
router.get('/basic', (req, res) => {
  res.json(req.basicAuth());
});
```


`req.validate(sources, rules)`

Validate request data:
```javascript
const result = req.validate(['body'], {
  name: 'required|string',
  email: 'required|email',
});
```

### 📤 Response Helpers
```javascript
res.status(201).json({ message: 'Created' });

res.send('<h1>Hello</h1>');

res.json({ message: 'Hello' });

res.redirect('/login');

res.sendFile(path.join(__dirname, 'index.html'));
```

### 🧠 Error Handling

The framework includes a global error handler by default.
If a handler throws an error, it will be caught and returned in the standard JSON format.

Example response:
```javascript
{
  "status": "error",
  "code": 500,
  "message": "Something went wrong",
  "data": null,
  "metadata": null
}
```

### 🧺 Example XML Body

Request:
```xml
<order>
  <orderNumber>ORD-20251027001</orderNumber>
  <customer>
    <id>1001</id>
    <name>Rabi’ah Nawakaning</name>
  </customer>
  <items>
    <item>
      <productId>501</productId>
      <name>Notebook MSI Modern 15</name>
      <quantity>1</quantity>
      <price>25000</price>
    </item>
    <item>
      <productId>502</productId>
      <name>Wireless Mouse</name>
      <quantity>1</quantity>
      <price>600</price>
    </item>
  </items>
</order>
```
Response:
```json
{
  "message": "Received XML data",
  "data": {
    "order": {
      "orderNumber": "ORD-20251027001",
      "customer": { "id": "1001", "name": "Rabi’ah Nawakaning" },
      "items": {
        "item": [
          { "productId": "501", "name": "Notebook MSI Modern 15", "quantity": "1", "price": "25000" },
          { "productId": "502", "name": "Wireless Mouse", "quantity": "1", "price": "600" }
        ]
      }
    }
  }
}
```

### 🏁 Run the Server

```bash
node app.js
```

## Documentation
For detailed documentation and examples, please refer to the [RapidfyJS Documentation](https://rapidfy-js-docs.com).

## Contributing
We welcome contributions from the community! If you have any ideas, bug reports, or feature requests, please submit them to our [GitHub repository](https://github.com/KimmyLps/rapidfy-js.git).

## License
RapidfyJS is released under the [MIT License](https://opensource.org/licenses/MIT).
