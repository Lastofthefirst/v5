/**
 * Database module for storing pipeline state and progress
 * Using JSON file storage as fallback when SQLite bindings are not available
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let database = {
    documents: [],
    document_matches: [],
    text_blocks: [],
    xml_elements: [],
    paragraph_matches: [],
    pipeline_jobs: []
};

let dbPath = null;
let isInitialized = false;
let nextId = 1;

export async function initializeDatabase() {
    const dbDir = join(__dirname, '../../../data');
    await mkdir(dbDir, { recursive: true });
    
    dbPath = join(dbDir, 'pipeline.json');
    
    try {
        // Try to load existing database
        if (existsSync(dbPath)) {
            const data = await readFile(dbPath, 'utf-8');
            database = JSON.parse(data);
            
            // Calculate next ID
            for (const table of Object.values(database)) {
                if (Array.isArray(table)) {
                    for (const record of table) {
                        if (record.id && record.id >= nextId) {
                            nextId = record.id + 1;
                        }
                    }
                }
            }
        }
        
        await saveDatabase();
        isInitialized = true;
        console.log('Connected to JSON file database');
        
    } catch (error) {
        console.error('Database initialization error:', error);
        throw error;
    }
}

async function saveDatabase() {
    if (dbPath) {
        await writeFile(dbPath, JSON.stringify(database, null, 2), 'utf-8');
    }
}

export function runQuery(sql, params = []) {
    if (!isInitialized) {
        throw new Error('Database not initialized');
    }
    
    // Simple SQL parser for basic operations
    const sqlLower = sql.toLowerCase().trim();
    
    if (sqlLower.startsWith('insert into')) {
        return handleInsert(sql, params);
    } else if (sqlLower.startsWith('update')) {
        return handleUpdate(sql, params);
    } else if (sqlLower.startsWith('delete')) {
        return handleDelete(sql, params);
    } else {
        throw new Error(`Unsupported SQL operation: ${sql}`);
    }
}

function handleInsert(sql, params) {
    const tableMatch = sql.match(/insert into (\w+)/i);
    if (!tableMatch) {
        throw new Error('Invalid INSERT syntax');
    }
    
    const tableName = tableMatch[1];
    const columnsMatch = sql.match(/\(([^)]+)\)/);
    const valuesMatch = sql.match(/values\s*\(([^)]*)\)/i);
    
    if (!columnsMatch || !valuesMatch) {
        throw new Error('Invalid INSERT syntax');
    }
    
    const columns = columnsMatch[1].split(',').map(c => c.trim());
    const record = {};
    
    // Add auto-incrementing ID
    record.id = nextId++;
    
    // Map parameters to columns
    columns.forEach((col, index) => {
        if (params[index] !== undefined) {
            record[col] = params[index];
        }
    });
    
    // Add timestamp fields
    record.created_at = new Date().toISOString();
    if (columns.includes('updated_at')) {
        record.updated_at = new Date().toISOString();
    }
    
    if (!database[tableName]) {
        database[tableName] = [];
    }
    
    database[tableName].push(record);
    saveDatabase().catch(console.error);
    
    return { lastID: record.id, changes: 1 };
}

function handleUpdate(sql, params) {
    const tableMatch = sql.match(/update (\w+)/i);
    if (!tableMatch) {
        throw new Error('Invalid UPDATE syntax');
    }
    
    const tableName = tableMatch[1];
    
    // Handle different UPDATE patterns
    const setMatch = sql.match(/set (.+?)(?:\s+where|$)/i);
    const whereMatch = sql.match(/where (.+)$/i);
    
    if (!setMatch) {
        throw new Error('Invalid UPDATE syntax - no SET clause');
    }
    
    const table = database[tableName];
    if (!table) {
        return { lastID: null, changes: 0 };
    }
    
    let changes = 0;
    
    // If no WHERE clause, update all records (dangerous but handle it)
    if (!whereMatch) {
        // Parse SET clause
        const updates = setMatch[1].split(',').map(s => s.trim());
        let paramIndex = 0;
        
        table.forEach(record => {
            updates.forEach(update => {
                const [col, value] = update.split('=').map(s => s.trim());
                if (value === '?' && paramIndex < params.length) {
                    record[col] = params[paramIndex++];
                } else if (value === 'CURRENT_TIMESTAMP') {
                    record[col] = new Date().toISOString();
                }
            });
            
            if (record.updated_at !== undefined) {
                record.updated_at = new Date().toISOString();
            }
            changes++;
        });
    } else {
        // Handle WHERE clause
        const whereClause = whereMatch[1];
        
        // Simple WHERE clause parser (id = ?)
        if (whereClause.includes('id = ?')) {
            const targetId = params[params.length - 1];
            const record = table.find(r => r.id == targetId);
            
            if (record) {
                // Parse SET clause
                const updates = setMatch[1].split(',').map(s => s.trim());
                let paramIndex = 0;
                
                updates.forEach(update => {
                    const [col, value] = update.split('=').map(s => s.trim());
                    if (value === '?' && paramIndex < params.length - 1) {
                        record[col] = params[paramIndex++];
                    } else if (value === 'CURRENT_TIMESTAMP') {
                        record[col] = new Date().toISOString();
                    }
                });
                
                if (record.updated_at !== undefined) {
                    record.updated_at = new Date().toISOString();
                }
                
                changes = 1;
            }
        }
    }
    
    if (changes > 0) {
        saveDatabase().catch(console.error);
    }
    
    return { lastID: null, changes };
}

function handleDelete(sql, params) {
    const tableMatch = sql.match(/delete from (\w+)/i);
    if (!tableMatch) {
        throw new Error('Invalid DELETE syntax');
    }
    
    const tableName = tableMatch[1];
    const whereMatch = sql.match(/where (.+)$/i);
    
    if (!whereMatch) {
        throw new Error('DELETE without WHERE not allowed');
    }
    
    const table = database[tableName];
    if (!table) {
        return { lastID: null, changes: 0 };
    }
    
    const whereClause = whereMatch[1];
    let changes = 0;
    
    // Simple WHERE clause parser (id = ?)
    if (whereClause.includes('id = ?')) {
        const targetId = params[0];
        const initialLength = table.length;
        database[tableName] = table.filter(r => r.id != targetId);
        changes = initialLength - database[tableName].length;
        
        if (changes > 0) {
            saveDatabase().catch(console.error);
        }
    }
    
    return { lastID: null, changes };
}

export function getQuery(sql, params = []) {
    if (!isInitialized) {
        throw new Error('Database not initialized');
    }
    
    const results = allQuery(sql, params);
    return results.length > 0 ? results[0] : undefined;
}

export function allQuery(sql, params = []) {
    if (!isInitialized) {
        throw new Error('Database not initialized');
    }
    
    const sqlLower = sql.toLowerCase().trim();
    
    if (sqlLower.startsWith('select')) {
        return handleSelect(sql, params);
    } else {
        throw new Error(`Unsupported SQL operation: ${sql}`);
    }
}

function handleSelect(sql, params) {
    // Simple SELECT parser for basic queries
    const fromMatch = sql.match(/from (\w+)/i);
    if (!fromMatch) {
        throw new Error('Invalid SELECT syntax');
    }
    
    const tableName = fromMatch[1];
    let table = database[tableName] || [];
    
    // Handle WHERE clause
    const whereMatch = sql.match(/where (.+?)(?:\s+order|\s+group|\s+limit|$)/i);
    if (whereMatch) {
        const whereClause = whereMatch[1];
        table = table.filter(record => {
            // Simple WHERE clause evaluation
            if (whereClause.includes('id = ?')) {
                return record.id == params[0];
            } else if (whereClause.includes('type = ?')) {
                return record.type == params[0];
            } else if (whereClause.includes('status = ?')) {
                return record.status == params[0];
            } else if (whereClause.includes('document_id = ?')) {
                return record.document_id == params[0];
            } else if (whereClause.includes('filename = ? AND type = ?')) {
                return record.filename == params[0] && record.type == params[1];
            }
            return true;
        });
    }
    
    // Handle ORDER BY
    const orderMatch = sql.match(/order by (.+?)(?:\s+limit|$)/i);
    if (orderMatch) {
        const orderClause = orderMatch[1];
        if (orderClause.includes('created_at DESC')) {
            table.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        } else if (orderClause.includes('similarity_score DESC')) {
            table.sort((a, b) => (b.similarity_score || 0) - (a.similarity_score || 0));
        }
    }
    
    // Handle LIMIT
    const limitMatch = sql.match(/limit (\d+)/i);
    if (limitMatch) {
        const limit = parseInt(limitMatch[1]);
        table = table.slice(0, limit);
    }
    
    // Handle GROUP BY (simple aggregation)
    const groupMatch = sql.match(/group by (.+?)(?:\s+order|\s+limit|$)/i);
    if (groupMatch && sql.includes('COUNT(*)')) {
        const groupBy = groupMatch[1].split(',').map(s => s.trim());
        const groups = {};
        
        table.forEach(record => {
            const key = groupBy.map(col => record[col]).join('|');
            if (!groups[key]) {
                groups[key] = { count: 0 };
                groupBy.forEach(col => {
                    groups[key][col] = record[col];
                });
            }
            groups[key].count++;
        });
        
        return Object.values(groups);
    }
    
    return table;
}

export function closeDatabase() {
    if (isInitialized) {
        saveDatabase().catch(console.error);
    }
}