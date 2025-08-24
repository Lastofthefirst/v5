#!/usr/bin/env node
/**
 * Translation Matching Pipeline Server
 * 
 * Main server entry point that provides:
 * - REST API for pipeline operations
 * - WebSocket for real-time status updates
 * - File upload handling
 * - State management
 */

import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createServer } from 'http';

import { setupRoutes } from './routes/index.js';
import { initializeDatabase } from './database/index.js';
import { PipelineManager } from './pipeline/manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files
app.use('/static', express.static(join(__dirname, '../../public')));

// Serve the main UI
app.get('/', (req, res) => {
    res.sendFile(join(__dirname, '../../public/index.html'));
});

// Initialize services
async function initialize() {
    try {
        console.log('Initializing database...');
        await initializeDatabase();
        
        console.log('Starting pipeline manager...');
        const pipelineManager = new PipelineManager();
        
        // Auto-initialize XML documents and process input PDFs
        console.log('Auto-initializing XML documents...');
        try {
            const xmlResult = await pipelineManager.initializeXmlDocuments(3); // Limit to 3 files for testing
            console.log(`XML initialization result: ${xmlResult.message}`);
        } catch (error) {
            console.error('XML initialization failed:', error.message);
        }
        
        console.log('Auto-processing input_pdfs folder...');
        try {
            const pdfResult = await pipelineManager.initializeAndProcessInputPdfs();
            console.log(`PDF processing result: ${pdfResult.message}`);
        } catch (error) {
            console.error('Input PDFs processing failed:', error.message);
        }
        
        console.log('Setting up routes...');
        setupRoutes(app, pipelineManager);
        
        server.listen(PORT, () => {
            console.log(`🚀 Translation Pipeline Server running on http://localhost:${PORT}`);
            console.log('📁 Upload PDFs to /api/upload');
            console.log('🔍 Check status at /api/status');
            console.log('⚡ Real-time updates via WebSocket');
            console.log('🤖 Auto-processing enabled for input_pdfs folder');
        });
        
    } catch (error) {
        console.error('Failed to initialize server:', error);
        process.exit(1);
    }
}

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down gracefully...');
    server.close(() => {
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('Received SIGINT, shutting down gracefully...');
    server.close(() => {
        process.exit(0);
    });
});

// Start the server
initialize();