/**
 * API Routes for the Translation Pipeline
 */

import { Router } from 'express';
import multer from 'multer';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { allQuery, getQuery } from '../database/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = join(__dirname, '../../../uploads');
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});

const upload = multer({ 
    storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files are allowed'), false);
        }
    }
});

export function setupRoutes(app, pipelineManager) {
    const router = Router();
    
    // Health check
    router.get('/health', (req, res) => {
        res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });
    
    // Get pipeline status
    router.get('/status', async (req, res) => {
        try {
            const jobs = await allQuery(`
                SELECT * FROM pipeline_jobs 
                ORDER BY created_at DESC 
                LIMIT 10
            `);
            
            const documents = await allQuery(`
                SELECT type, status, COUNT(*) as count 
                FROM documents 
                GROUP BY type, status
            `);
            
            const matches = await allQuery(`
                SELECT confidence, COUNT(*) as count 
                FROM document_matches 
                GROUP BY confidence
            `);
            
            res.json({
                jobs,
                documents,
                matches,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
    
    // Get all documents
    router.get('/documents', async (req, res) => {
        try {
            const documents = await allQuery(`
                SELECT * FROM documents 
                ORDER BY created_at DESC
            `);
            res.json(documents);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
    
    // Get document matches
    router.get('/matches', async (req, res) => {
        try {
            const matches = await allQuery(`
                SELECT 
                    dm.*,
                    pdf.filename as pdf_filename,
                    xml.filename as xml_filename,
                    pdf.language as pdf_language,
                    xml.author as xml_author
                FROM document_matches dm
                JOIN documents pdf ON dm.pdf_id = pdf.id
                JOIN documents xml ON dm.xml_id = xml.id
                ORDER BY dm.similarity_score DESC
            `);
            res.json(matches);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
    
    // Upload PDF files
    router.post('/upload', upload.array('pdfs'), async (req, res) => {
        try {
            const files = req.files;
            if (!files || files.length === 0) {
                return res.status(400).json({ error: 'No files uploaded' });
            }
            
            const results = [];
            for (const file of files) {
                try {
                    const result = await pipelineManager.addPdfDocument(file.path, file.originalname);
                    results.push({ filename: file.originalname, status: 'uploaded', id: result.id });
                } catch (error) {
                    results.push({ filename: file.originalname, status: 'error', error: error.message });
                }
            }
            
            res.json({ results });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
    
    // Start document matching
    router.post('/start-matching', async (req, res) => {
        try {
            const jobId = await pipelineManager.startDocumentMatching();
            res.json({ jobId, message: 'Document matching started' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
    
    // Start paragraph matching
    router.post('/start-paragraph-matching', async (req, res) => {
        try {
            const { documentPairId } = req.body;
            if (!documentPairId) {
                return res.status(400).json({ error: 'documentPairId is required' });
            }
            
            const jobId = await pipelineManager.startParagraphMatching(documentPairId);
            res.json({ jobId, message: 'Paragraph matching started' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
    
    // Manual review endpoints
    router.post('/review/approve/:matchId', async (req, res) => {
        try {
            const { matchId } = req.params;
            await pipelineManager.approveMatch(matchId);
            res.json({ message: 'Match approved' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
    
    router.post('/review/reject/:matchId', async (req, res) => {
        try {
            const { matchId } = req.params;
            await pipelineManager.rejectMatch(matchId);
            res.json({ message: 'Match rejected' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
    
    // Get detailed match information for review
    router.get('/review/:matchId', async (req, res) => {
        try {
            const { matchId } = req.params;
            const match = await getQuery(`
                SELECT 
                    pm.*,
                    tb.text_content as source_text,
                    xe.text_content as target_text,
                    xe.element_structure,
                    d1.filename as pdf_filename,
                    d2.filename as xml_filename
                FROM paragraph_matches pm
                JOIN text_blocks tb ON pm.text_block_id = tb.id
                JOIN xml_elements xe ON pm.xml_element_id = xe.id
                JOIN documents d1 ON tb.document_id = d1.id
                JOIN documents d2 ON xe.document_id = d2.id
                WHERE pm.id = ?
            `, [matchId]);
            
            if (!match) {
                return res.status(404).json({ error: 'Match not found' });
            }
            
            res.json(match);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
    
    // Initialize XML documents (scan the ref_xml directory)
    router.post('/initialize-xml', async (req, res) => {
        try {
            const result = await pipelineManager.initializeXmlDocuments();
            res.json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
    
    app.use('/api', router);
}