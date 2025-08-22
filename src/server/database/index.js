/**
 * Database module for storing pipeline state and progress
 */

import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdir } from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let db = null;

export async function initializeDatabase() {
    const dbDir = join(__dirname, '../../../data');
    await mkdir(dbDir, { recursive: true });
    
    const dbPath = join(dbDir, 'pipeline.db');
    
    try {
        db = new Database(dbPath);
        console.log('Connected to SQLite database');
        await createTables();
        return Promise.resolve();
    } catch (error) {
        console.error('Database initialization error:', error);
        throw error;
    }
}

async function createTables() {
    const queries = [
        // Documents table
        `CREATE TABLE IF NOT EXISTS documents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT UNIQUE NOT NULL,
            type TEXT NOT NULL CHECK (type IN ('pdf', 'xml')),
            path TEXT NOT NULL,
            size INTEGER,
            language TEXT,
            author TEXT,
            processed_at DATETIME,
            status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        
        // Document matches table
        `CREATE TABLE IF NOT EXISTS document_matches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pdf_id INTEGER NOT NULL,
            xml_id INTEGER NOT NULL,
            similarity_score REAL NOT NULL,
            confidence TEXT NOT NULL CHECK (confidence IN ('high', 'medium', 'low')),
            manual_review BOOLEAN DEFAULT FALSE,
            approved BOOLEAN DEFAULT FALSE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (pdf_id) REFERENCES documents (id),
            FOREIGN KEY (xml_id) REFERENCES documents (id)
        )`,
        
        // Text blocks table (extracted from PDFs)
        `CREATE TABLE IF NOT EXISTS text_blocks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            document_id INTEGER NOT NULL,
            block_index INTEGER NOT NULL,
            text_content TEXT NOT NULL,
            position_info TEXT, -- JSON string
            language TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (document_id) REFERENCES documents (id)
        )`,
        
        // XML elements table (extracted from XMLs)
        `CREATE TABLE IF NOT EXISTS xml_elements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            document_id INTEGER NOT NULL,
            element_id TEXT NOT NULL, -- XPath or ID attribute
            text_content TEXT NOT NULL,
            element_structure TEXT, -- JSON of the complete XML structure
            element_type TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (document_id) REFERENCES documents (id)
        )`,
        
        // Paragraph matches table
        `CREATE TABLE IF NOT EXISTS paragraph_matches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            text_block_id INTEGER NOT NULL,
            xml_element_id INTEGER NOT NULL,
            similarity_score REAL NOT NULL,
            confidence TEXT NOT NULL CHECK (confidence IN ('high', 'medium', 'low')),
            match_pass INTEGER DEFAULT 1, -- 1 for first pass, 2 for gap filling
            manual_review BOOLEAN DEFAULT FALSE,
            approved BOOLEAN DEFAULT FALSE,
            flags TEXT, -- JSON array of validation flags
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (text_block_id) REFERENCES text_blocks (id),
            FOREIGN KEY (xml_element_id) REFERENCES xml_elements (id)
        )`,
        
        // Pipeline jobs table
        `CREATE TABLE IF NOT EXISTS pipeline_jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_type TEXT NOT NULL,
            status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
            progress INTEGER DEFAULT 0,
            total_items INTEGER DEFAULT 0,
            current_item TEXT,
            error_message TEXT,
            metadata TEXT, -- JSON string
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`
    ];
    
    for (const query of queries) {
        db.exec(query);
    }
    
    console.log('Database tables created successfully');
}

export function runQuery(sql, params = []) {
    try {
        const stmt = db.prepare(sql);
        const info = stmt.run(...params);
        return { lastID: info.lastInsertRowid, changes: info.changes };
    } catch (error) {
        console.error('Database query error:', error);
        throw error;
    }
}

export function getQuery(sql, params = []) {
    try {
        const stmt = db.prepare(sql);
        return stmt.get(...params);
    } catch (error) {
        console.error('Database query error:', error);
        throw error;
    }
}

export function allQuery(sql, params = []) {
    try {
        const stmt = db.prepare(sql);
        return stmt.all(...params);
    } catch (error) {
        console.error('Database query error:', error);
        throw error;
    }
}

export function closeDatabase() {
    if (db) {
        db.close();
    }
}