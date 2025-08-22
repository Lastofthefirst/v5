/**
 * Pipeline Manager - Orchestrates the translation matching pipeline
 */

import { readdir, stat, readFile } from 'fs/promises';
import { join, basename, extname, dirname } from 'path';
import { fileURLToPath } from 'url';
import { runQuery, getQuery, allQuery } from '../database/index.js';
import { PdfProcessor } from './pdf-processor.js';
import { XmlProcessor } from './xml-processor.js';
import { DocumentMatcher } from './document-matcher.js';
import { ParagraphMatcher } from './paragraph-matcher.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class PipelineManager {
    constructor() {
        this.pdfProcessor = new PdfProcessor();
        this.xmlProcessor = new XmlProcessor();
        this.documentMatcher = new DocumentMatcher();
        this.paragraphMatcher = new ParagraphMatcher();
        this.activeJobs = new Map();
    }
    
    async addPdfDocument(filePath, originalName) {
        try {
            // Insert document record
            const result = await runQuery(`
                INSERT INTO documents (filename, type, path, status)
                VALUES (?, ?, ?, ?)
            `, [originalName, 'pdf', filePath, 'pending']);
            
            // Start processing the PDF in the background
            this.processPdfDocument(result.lastID).catch(error => {
                console.error(`Error processing PDF ${originalName}:`, error);
                this.updateDocumentStatus(result.lastID, 'failed');
            });
            
            return { id: result.lastID };
        } catch (error) {
            console.error('Error adding PDF document:', error);
            throw error;
        }
    }
    
    async processPdfDocument(documentId) {
        try {
            await this.updateDocumentStatus(documentId, 'processing');
            
            const doc = await getQuery('SELECT * FROM documents WHERE id = ?', [documentId]);
            if (!doc) throw new Error('Document not found');
            
            console.log(`Processing PDF: ${doc.filename}`);
            
            // Extract text blocks using marker (similar to 1.1.py)
            const textBlocks = await this.pdfProcessor.extractTextBlocks(doc.path);
            
            // Detect language
            const language = await this.pdfProcessor.detectLanguage(textBlocks);
            
            // Store text blocks in database
            for (let i = 0; i < textBlocks.length; i++) {
                const block = textBlocks[i];
                await runQuery(`
                    INSERT INTO text_blocks (document_id, block_index, text_content, position_info, language)
                    VALUES (?, ?, ?, ?, ?)
                `, [documentId, i, block.text, JSON.stringify(block.position), language]);
            }
            
            // Update document with language and status
            await runQuery(`
                UPDATE documents 
                SET language = ?, status = ?, processed_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `, [language, 'completed', documentId]);
            
            console.log(`Completed processing PDF: ${doc.filename}`);
            
        } catch (error) {
            await this.updateDocumentStatus(documentId, 'failed');
            throw error;
        }
    }
    
    async initializeXmlDocuments() {
        try {
            const xmlDir = join(__dirname, '../../../ref_xml');
            const authors = await readdir(xmlDir);
            
            let processed = 0;
            
            for (const author of authors) {
                const authorDir = join(xmlDir, author);
                const authorStat = await stat(authorDir);
                
                if (!authorStat.isDirectory()) continue;
                
                const files = await readdir(authorDir);
                
                for (const file of files) {
                    if (extname(file) !== '.xml') continue;
                    
                    const filePath = join(authorDir, file);
                    
                    // Check if already processed
                    const existing = await getQuery(
                        'SELECT id FROM documents WHERE filename = ? AND type = ?',
                        [file, 'xml']
                    );
                    
                    if (existing) continue;
                    
                    // Insert document record
                    const result = await runQuery(`
                        INSERT INTO documents (filename, type, path, author, status)
                        VALUES (?, ?, ?, ?, ?)
                    `, [file, 'xml', filePath, author, 'pending']);
                    
                    // Process XML in background
                    this.processXmlDocument(result.lastID).catch(error => {
                        console.error(`Error processing XML ${file}:`, error);
                        this.updateDocumentStatus(result.lastID, 'failed');
                    });
                    
                    processed++;
                }
            }
            
            return { message: `Initialized ${processed} XML documents for processing` };
            
        } catch (error) {
            console.error('Error initializing XML documents:', error);
            throw error;
        }
    }
    
    async processXmlDocument(documentId) {
        try {
            await this.updateDocumentStatus(documentId, 'processing');
            
            const doc = await getQuery('SELECT * FROM documents WHERE id = ?', [documentId]);
            if (!doc) throw new Error('Document not found');
            
            console.log(`Processing XML: ${doc.filename}`);
            
            // Extract text elements from XML
            const elements = await this.xmlProcessor.extractElements(doc.path);
            
            // Store elements in database
            for (const element of elements) {
                await runQuery(`
                    INSERT INTO xml_elements (document_id, element_id, text_content, element_structure, element_type)
                    VALUES (?, ?, ?, ?, ?)
                `, [
                    documentId, 
                    element.id, 
                    element.text, 
                    JSON.stringify(element.structure),
                    element.type
                ]);
            }
            
            // Update document status
            await runQuery(`
                UPDATE documents 
                SET status = ?, processed_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `, ['completed', documentId]);
            
            console.log(`Completed processing XML: ${doc.filename}`);
            
        } catch (error) {
            await this.updateDocumentStatus(documentId, 'failed');
            throw error;
        }
    }
    
    async startDocumentMatching() {
        try {
            const jobId = await this.createJob('document_matching', 'Document-level matching');
            
            // Run document matching in background
            this.runDocumentMatching(jobId).catch(error => {
                console.error('Document matching failed:', error);
                this.updateJobStatus(jobId, 'failed', error.message);
            });
            
            return jobId;
            
        } catch (error) {
            console.error('Error starting document matching:', error);
            throw error;
        }
    }
    
    async runDocumentMatching(jobId) {
        try {
            await this.updateJobStatus(jobId, 'running');
            
            // Get all completed PDFs and XMLs
            const pdfs = await allQuery(`
                SELECT * FROM documents 
                WHERE type = 'pdf' AND status = 'completed'
            `);
            
            const xmls = await allQuery(`
                SELECT * FROM documents 
                WHERE type = 'xml' AND status = 'completed'
            `);
            
            console.log(`Starting document matching: ${pdfs.length} PDFs, ${xmls.length} XMLs`);
            
            let processed = 0;
            await this.updateJobProgress(jobId, processed, pdfs.length);
            
            for (const pdf of pdfs) {
                // Get text blocks for this PDF
                const textBlocks = await allQuery(`
                    SELECT text_content FROM text_blocks 
                    WHERE document_id = ?
                `, [pdf.id]);
                
                const pdfText = textBlocks.map(block => block.text_content).join(' ');
                
                let bestMatch = null;
                let bestScore = 0;
                
                for (const xml of xmls) {
                    // Get elements for this XML
                    const elements = await allQuery(`
                        SELECT text_content FROM xml_elements 
                        WHERE document_id = ?
                    `, [xml.id]);
                    
                    const xmlText = elements.map(el => el.text_content).join(' ');
                    
                    // Calculate similarity (basic for now, will use embeddings later)
                    const score = await this.documentMatcher.calculateSimilarity(pdfText, xmlText);
                    
                    if (score > bestScore) {
                        bestScore = score;
                        bestMatch = xml;
                    }
                }
                
                if (bestMatch && bestScore > 0.3) { // Threshold for matching
                    const confidence = bestScore > 0.8 ? 'high' : bestScore > 0.6 ? 'medium' : 'low';
                    const needsReview = confidence === 'low';
                    
                    await runQuery(`
                        INSERT INTO document_matches (pdf_id, xml_id, similarity_score, confidence, manual_review)
                        VALUES (?, ?, ?, ?, ?)
                    `, [pdf.id, bestMatch.id, bestScore, confidence, needsReview]);
                }
                
                processed++;
                await this.updateJobProgress(jobId, processed, pdfs.length);
            }
            
            await this.updateJobStatus(jobId, 'completed');
            console.log(`Document matching completed: ${processed} PDFs processed`);
            
        } catch (error) {
            await this.updateJobStatus(jobId, 'failed', error.message);
            throw error;
        }
    }
    
    async startParagraphMatching(documentPairId) {
        try {
            const jobId = await this.createJob('paragraph_matching', `Paragraph matching for pair ${documentPairId}`);
            
            // Run paragraph matching in background
            this.runParagraphMatching(jobId, documentPairId).catch(error => {
                console.error('Paragraph matching failed:', error);
                this.updateJobStatus(jobId, 'failed', error.message);
            });
            
            return jobId;
            
        } catch (error) {
            console.error('Error starting paragraph matching:', error);
            throw error;
        }
    }
    
    async runParagraphMatching(jobId, documentPairId) {
        try {
            await this.updateJobStatus(jobId, 'running');
            
            const match = await getQuery(`
                SELECT * FROM document_matches WHERE id = ?
            `, [documentPairId]);
            
            if (!match) throw new Error('Document pair not found');
            
            // Get text blocks and XML elements
            const textBlocks = await allQuery(`
                SELECT * FROM text_blocks WHERE document_id = ?
            `, [match.pdf_id]);
            
            const xmlElements = await allQuery(`
                SELECT * FROM xml_elements WHERE document_id = ?
            `, [match.xml_id]);
            
            console.log(`Starting paragraph matching: ${textBlocks.length} text blocks, ${xmlElements.length} XML elements`);
            
            await this.updateJobProgress(jobId, 0, textBlocks.length);
            
            for (let i = 0; i < textBlocks.length; i++) {
                const textBlock = textBlocks[i];
                
                let bestMatch = null;
                let bestScore = 0;
                
                for (const xmlElement of xmlElements) {
                    const score = await this.paragraphMatcher.calculateSimilarity(
                        textBlock.text_content, 
                        xmlElement.text_content
                    );
                    
                    if (score > bestScore) {
                        bestScore = score;
                        bestMatch = xmlElement;
                    }
                }
                
                if (bestMatch && bestScore > 0.4) { // Lower threshold for paragraph matching
                    const confidence = bestScore > 0.7 ? 'high' : bestScore > 0.5 ? 'medium' : 'low';
                    const needsReview = confidence === 'low';
                    
                    await runQuery(`
                        INSERT INTO paragraph_matches 
                        (text_block_id, xml_element_id, similarity_score, confidence, manual_review)
                        VALUES (?, ?, ?, ?, ?)
                    `, [textBlock.id, bestMatch.id, bestScore, confidence, needsReview]);
                }
                
                await this.updateJobProgress(jobId, i + 1, textBlocks.length);
            }
            
            await this.updateJobStatus(jobId, 'completed');
            console.log(`Paragraph matching completed for pair ${documentPairId}`);
            
        } catch (error) {
            await this.updateJobStatus(jobId, 'failed', error.message);
            throw error;
        }
    }
    
    async approveMatch(matchId) {
        await runQuery(`
            UPDATE paragraph_matches 
            SET approved = TRUE, manual_review = FALSE 
            WHERE id = ?
        `, [matchId]);
    }
    
    async rejectMatch(matchId) {
        await runQuery(`
            DELETE FROM paragraph_matches WHERE id = ?
        `, [matchId]);
    }
    
    // Helper methods
    async updateDocumentStatus(documentId, status) {
        await runQuery(`
            UPDATE documents SET status = ? WHERE id = ?
        `, [status, documentId]);
    }
    
    async createJob(jobType, description) {
        const result = await runQuery(`
            INSERT INTO pipeline_jobs (job_type, current_item)
            VALUES (?, ?)
        `, [jobType, description]);
        return result.lastID;
    }
    
    async updateJobStatus(jobId, status, errorMessage = null) {
        await runQuery(`
            UPDATE pipeline_jobs 
            SET status = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [status, errorMessage, jobId]);
    }
    
    async updateJobProgress(jobId, progress, total) {
        await runQuery(`
            UPDATE pipeline_jobs 
            SET progress = ?, total_items = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [progress, total, jobId]);
    }
}