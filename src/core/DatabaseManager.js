// src/core/DatabaseManager.js

const mysql = require('mysql2/promise');
const { MongoClient } = require('mongodb');
const { Pool } = require('pg');

// Class สำหรับเก็บ Connection และจัดการ Instances
class DatabaseManager {
    constructor() {
        this.connections = {}; // { 'mysql': mysqlConnection, 'mongodb': mongoClient, 'postgres': pgPool }
    }

    /**
     * Initializes and stores a database connection.
     * @param {string} name - Connection name (e.g., 'mysql', 'mongo', 'postgres').
     * @param {string} type - Database type ('mysql', 'mariadb', 'mongodb', 'postgresql').
     * @param {object} config - Configuration object.
     * @returns {Promise<void>}
     */
    async connect(name, type, config) {
        if (this.connections[name]) {
            console.warn(`[RapidfyJS DB] Connection '${name}' already exists. Skipping.`);
            return;
        }

        switch (type) {
            case 'mysql':
            case 'mariadb':
                // MySQL/MariaDB: ใช้ createPool เพื่อประสิทธิภาพ
                const pool = mysql.createPool(config);
                this.connections[name] = { type: 'mysql', pool: pool };
                console.log(`[RapidfyJS DB] MySQL/MariaDB connected: ${name}`);
                break;

            case 'mongodb':
                // MongoDB: ใช้ MongoClient
                const client = new MongoClient(config.uri, config.options);
                await client.connect();
                this.connections[name] = { type: 'mongodb', client: client };
                console.log(`[RapidfyJS DB] MongoDB connected: ${name}`);
                break;

            case 'postgresql':
                const pgPool = new Pool(config);
                await pgPool.query('SELECT 1+1 AS result'); 
                this.connections[name] = { type: 'postgresql', pool: pgPool };
                console.log(`[RapidfyJS DB] PostgreSQL connected: ${name}`);
                break;

            default:
                throw new Error(`[RapidfyJS DB] Unsupported database type: ${type}`);
        }
    }

    /**
     * Retrieves a connection object.
     * @param {string} name - Connection name.
     * @returns {object} The raw connection/pool/client object.
     */
    getConnection(name) {
        const conn = this.connections[name];
        if (!conn) {
            throw new Error(`[RapidfyJS DB] Connection '${name}' not found. Please connect first.`);
        }
        return conn;
    }

    /**
     * Closes the connection pool/client for a specified connection.
     * Essential for graceful server shutdown.
     * @param {string} name - Connection name.
     * @returns {Promise<void>}
     */
    async disconnect(name) {
        const conn = this.getConnection(name); 

        switch (conn.type) {
            case 'mysql':
            case 'mariadb':
                await conn.pool.end();
                console.log(`[RapidfyJS DB] MySQL/MariaDB connection '${name}' disconnected.`);
                break;
            case 'postgresql':
                await conn.pool.end();
                console.log(`[RapidfyJS DB] PostgreSQL connection '${name}' disconnected.`);
                break;
            case 'mongodb':
                await conn.client.close();
                console.log(`[RapidfyJS DB] MongoDB client '${name}' disconnected.`);
                break;
            default:
                console.warn(`[RapidfyJS DB] Cannot disconnect unknown type for '${name}'.`);
        }
        delete this.connections[name];
    }
    
    /**
     * Executes a transaction using a callback function (for SQL databases).
     * Automatically handles commit and rollback.
     * @param {Function} callback - Async function that takes a client/connection object.
     * @param {string} [name='default'] - Connection name.
     * @returns {Promise<any>} The result of the callback.
     */
    async transaction(callback, name = 'default') {
        const conn = this.getConnection(name);
        
        // 1. Check if the connection type is SQL-based
        if (conn.type !== 'mysql' && conn.type !== 'mariadb' && conn.type !== 'postgresql') {
            throw new Error(`[RapidfyJS DB] Transaction method only supported for SQL databases (MySQL/MariaDB, PostgreSQL).`);
        }
        
        let client;
        
        try {
            // Get a client connection from the pool
            client = await conn.pool.getConnection(); // Works for both mysql2/pg pools
            
            // Start the transaction
            await client.query('START TRANSACTION');
            
            // Execute the user's logic
            const result = await callback(client);
            
            // Commit if callback succeeded
            await client.query('COMMIT');
            
            return result;
            
        } catch (error) {
            // Rollback on error
            if (client) {
                try {
                    await client.query('ROLLBACK');
                    console.error(`[RapidfyJS DB] Transaction failed for '${name}'. Rolled back.`);
                } catch (rollbackError) {
                    console.error(`[RapidfyJS DB] Rollback failed:`, rollbackError);
                }
            }
            // Rethrow the original error to the user
            throw error;
            
        } finally {
            // Always release the client back to the pool
            if (client) {
                // Check if the release method exists (mysql2 uses release, pg pool client uses release)
                if (typeof client.release === 'function') {
                    client.release(); 
                } else if (conn.type === 'mysql' || conn.type === 'mariadb') {
                    // For mysql2 pool connection acquired directly
                    client.release();
                }
            }
        }
    }

    /**
     * Executes a MySQL query (Helper for simplicity).
     * @param {string} sql - SQL query string.
     * @param {Array} values - Values to escape.
     * @param {string} [name='default'] - Connection name.
     */
    async query(sql, values = [], name = 'default') {
        const conn = this.getConnection(name);
        if (conn.type !== 'mysql' && conn.type !== 'mariadb') {
            throw new Error(`[RapidfyJS DB] Query method only available for MySQL/MariaDB connections.`);
        }
        const [rows, fields] = await conn.pool.execute(sql, values);
        return rows;
    }

    /**
     * 🚨 Executes a PostgreSQL query (NEW HELPER).
     * @param {string} text - SQL query text. Note: Postgres uses $1, $2 for parameters.
     * @param {Array} values - Values for the query.
     * @param {string} [name='postgres'] - Connection name.
     */
    async pgQuery(text, values = [], name = 'postgres') {
        const conn = this.getConnection(name);
        if (conn.type !== 'postgresql') {
            throw new Error(`[RapidfyJS DB] pgQuery method only available for PostgreSQL connections.`);
        }
        const result = await conn.pool.query(text, values);
        return result.rows; // PostgreSQL driver returns result.rows
    }
    
    /**
     * Retrieves a MongoDB database instance (Helper).
     * @param {string} [dbName] - Database name (optional, uses config default if not provided).
     * @param {string} [name='default'] - Connection name.
     */
    getMongoDb(dbName, name = 'default') {
        const conn = this.getConnection(name);
        if (conn.type !== 'mongodb') {
            throw new Error(`[RapidfyJS DB] getMongoDb method only available for MongoDB connections.`);
        }
        // Use dbName provided or the one specified in the connection URI
        return conn.client.db(dbName); 
    }
    
    // ... คุณสามารถเพิ่มเมธอด disconnect() หรือ transaction() ได้ในอนาคต
}

// Export Singleton Instance
const dbManager = new DatabaseManager();
module.exports = dbManager;