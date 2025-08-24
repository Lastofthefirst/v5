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
        this.logger = this.createLogger();
    }
    
    createLogger() {
        return {
            info: (message, ...args) => {
                console.log(`[PipelineManager] ${new Date().toISOString()} INFO: ${message}`, ...args);
            },
            error: (message, error, ...args) => {
                console.error(`[PipelineManager] ${new Date().toISOString()} ERROR: ${message}`, error, ...args);
            },
            warn: (message, ...args) => {
                console.warn(`[PipelineManager] ${new Date().toISOString()} WARN: ${message}`, ...args);
            },
            debug: (message, ...args) => {
                if (process.env.DEBUG) {
                    console.log(`[PipelineManager] ${new Date().toISOString()} DEBUG: ${message}`, ...args);
                }
            }
        };
    }
    
    async addPdfDocument(filePath, originalName) {
        try {
            this.logger.info(`Adding PDF document: ${originalName} from ${filePath}`);
            
            // Insert document record
            const result = await runQuery(`
                INSERT INTO documents (filename, type, path, status)
                VALUES (?, ?, ?, ?)
            `, [originalName, 'pdf', filePath, 'pending']);
            
            this.logger.info(`Added PDF document with ID: ${result.lastID}`);
            
            // Start processing the PDF in the background
            this.processPdfDocument(result.lastID).catch(error => {
                this.logger.error(`Error processing PDF ${originalName}:`, error);
                this.updateDocumentStatus(result.lastID, 'failed');
            });
            
            return { id: result.lastID };
        } catch (error) {
            this.logger.error('Error adding PDF document:', error);
            throw error;
        }
    }
    
    async processPdfDocument(documentId) {
        try {
            this.logger.info(`Starting PDF processing for document ID: ${documentId}`);
            await this.updateDocumentStatus(documentId, 'processing');
            
            const doc = await getQuery('SELECT * FROM documents WHERE id = ?', [documentId]);
            if (!doc) throw new Error('Document not found');
            
            this.logger.info(`Processing PDF: ${doc.filename} at path: ${doc.path}`);
            
            // Extract text blocks using marker (similar to 1.1.py)
            this.logger.info('Extracting text blocks from PDF...');
            const textBlocks = await this.pdfProcessor.extractTextBlocks(doc.path);
            this.logger.info(`Extracted ${textBlocks.length} text blocks`);
            
            // Detect language
            this.logger.info('Detecting document language...');
            const language = await this.pdfProcessor.detectLanguage(textBlocks);
            this.logger.info(`Detected language: ${language}`);
            
            // Store text blocks in database
            this.logger.info('Storing text blocks in database...');
            for (let i = 0; i < textBlocks.length; i++) {
                const block = textBlocks[i];
                await runQuery(`
                    INSERT INTO text_blocks (document_id, block_index, text_content, position_info, language)
                    VALUES (?, ?, ?, ?, ?)
                `, [documentId, i, block.text, JSON.stringify(block.position), language]);
            }
            this.logger.info(`Stored ${textBlocks.length} text blocks`);
            
            // Update document with language and status
            await runQuery(`
                UPDATE documents 
                SET language = ?, status = ?, processed_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `, [language, 'completed', documentId]);
            
            this.logger.info(`Completed processing PDF: ${doc.filename}`);
            
        } catch (error) {
            this.logger.error(`Error processing PDF document ${documentId}:`, error);
            await this.updateDocumentStatus(documentId, 'failed');
            throw error;
        }
    }
    
    async initializeXmlDocuments(maxFiles = null) {
        try {
            this.logger.info('Starting XML documents initialization...');
            const xmlDir = join(__dirname, '../../../ref_xml');
            const authors = await readdir(xmlDir);
            
            let processed = 0;
            let skipped = 0;
            const processingLimit = maxFiles || Infinity; // Limit for testing
            
            for (const author of authors) {
                if (processed >= processingLimit) break;
                
                const authorDir = join(xmlDir, author);
                const authorStat = await stat(authorDir);
                
                if (!authorStat.isDirectory()) continue;
                
                this.logger.info(`Processing author directory: ${author}`);
                const files = await readdir(authorDir);
                
                for (const file of files) {
                    if (processed >= processingLimit) break;
                    if (extname(file) !== '.xml') continue;
                    
                    const filePath = join(authorDir, file);
                    
                    // Check if already processed (improved check)
                    const existing = await getQuery(
                        'SELECT id, status FROM documents WHERE filename = ? AND type = ? AND author = ?',
                        [file, 'xml', author]
                    );
                    
                    if (existing) {
                        if (existing.status === 'completed') {
                            this.logger.debug(`Skipping already processed XML: ${file} (ID: ${existing.id})`);
                            skipped++;
                            continue;
                        } else if (existing.status === 'failed') {
                            this.logger.info(`Retrying failed XML: ${file} (ID: ${existing.id})`);
                            // Update status to pending and reprocess
                            await this.updateDocumentStatus(existing.id, 'pending');
                            this.processXmlDocument(existing.id).catch(error => {
                                this.logger.error(`Error reprocessing XML ${file}:`, error);
                                this.updateDocumentStatus(existing.id, 'failed');
                            });
                            processed++;
                            continue;
                        } else {
                            this.logger.info(`XML already in progress: ${file} (ID: ${existing.id})`);
                            skipped++;
                            continue;
                        }
                    }
                    
                    // Insert document record
                    this.logger.info(`Adding new XML document: ${file}`);
                    const result = await runQuery(`
                        INSERT INTO documents (filename, type, path, author, status)
                        VALUES (?, ?, ?, ?, ?)
                    `, [file, 'xml', filePath, author, 'pending']);
                    
                    // Process XML in background
                    this.processXmlDocument(result.lastID).catch(error => {
                        this.logger.error(`Error processing XML ${file}:`, error);
                        this.updateDocumentStatus(result.lastID, 'failed');
                    });
                    
                    processed++;
                }
            }
            
            const message = `Initialized ${processed} XML documents for processing, skipped ${skipped} already processed`;
            this.logger.info(message);
            return { message, processed, skipped };
            
        } catch (error) {
            this.logger.error('Error initializing XML documents:', error);
            throw error;
        }
    }
    
    async initializeAndProcessInputPdfs() {
        try {
            this.logger.info('Starting automatic processing of input_pdfs folder...');
            const inputPdfsDir = join(__dirname, '../../../input_pdfs');
            
            // Check if input_pdfs directory exists
            try {
                await stat(inputPdfsDir);
            } catch (error) {
                this.logger.warn('input_pdfs directory not found, skipping automatic processing');
                return { message: 'input_pdfs directory not found', processed: 0, skipped: 0 };
            }
            
            const files = await readdir(inputPdfsDir);
            const pdfFiles = files.filter(file => extname(file).toLowerCase() === '.pdf');
            
            if (pdfFiles.length === 0) {
                this.logger.info('No PDF files found in input_pdfs directory');
                return { message: 'No PDF files found', processed: 0, skipped: 0 };
            }
            
            this.logger.info(`Found ${pdfFiles.length} PDF files in input_pdfs directory`);
            
            let processed = 0;
            let skipped = 0;
            
            for (const pdfFile of pdfFiles) {
                const filePath = join(inputPdfsDir, pdfFile);
                
                // Check if already processed
                const existing = await getQuery(
                    'SELECT id, status FROM documents WHERE filename = ? AND type = ?',
                    [pdfFile, 'pdf']
                );
                
                if (existing) {
                    if (existing.status === 'completed') {
                        this.logger.debug(`Skipping already processed PDF: ${pdfFile} (ID: ${existing.id})`);
                        skipped++;
                        continue;
                    } else if (existing.status === 'failed') {
                        this.logger.info(`Retrying failed PDF: ${pdfFile} (ID: ${existing.id})`);
                        // Update status to pending and reprocess
                        await this.updateDocumentStatus(existing.id, 'pending');
                        this.processPdfDocument(existing.id).catch(error => {
                            this.logger.error(`Error reprocessing PDF ${pdfFile}:`, error);
                            this.updateDocumentStatus(existing.id, 'failed');
                        });
                        processed++;
                        continue;
                    } else {
                        this.logger.info(`PDF already in progress: ${pdfFile} (ID: ${existing.id})`);
                        skipped++;
                        continue;
                    }
                }
                
                // Add new PDF document
                this.logger.info(`Adding PDF from input_pdfs: ${pdfFile}`);
                try {
                    await this.addPdfDocument(filePath, pdfFile);
                    processed++;
                } catch (error) {
                    this.logger.error(`Error adding PDF ${pdfFile}:`, error);
                    // Continue processing other files
                }
            }
            
            const message = `Processed ${processed} PDF files from input_pdfs, skipped ${skipped} already processed`;
            this.logger.info(message);
            return { message, processed, skipped };
            
        } catch (error) {
            this.logger.error('Error processing input_pdfs folder:', error);
            throw error;
        }
    }

    async processXmlDocument(documentId) {
        try {
            this.logger.info(`Starting XML processing for document ID: ${documentId}`);
            await this.updateDocumentStatus(documentId, 'processing');
            
            const doc = await getQuery('SELECT * FROM documents WHERE id = ?', [documentId]);
            if (!doc) throw new Error('Document not found');
            
            this.logger.info(`Processing XML: ${doc.filename} at path: ${doc.path}`);
            
            // Extract text elements from XML
            this.logger.info('Extracting XML elements...');
            const elements = await this.xmlProcessor.extractElements(doc.path);
            this.logger.info(`Extracted ${elements.length} XML elements`);
            
            // Store elements in database
            this.logger.info('Storing XML elements in database...');
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
            this.logger.info(`Stored ${elements.length} XML elements`);
            
            // Update document status
            await runQuery(`
                UPDATE documents 
                SET status = ?, processed_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `, ['completed', documentId]);
            
            this.logger.info(`Completed processing XML: ${doc.filename}`);
            
        } catch (error) {
            this.logger.error(`Error processing XML document ${documentId}:`, error);
            await this.updateDocumentStatus(documentId, 'failed');
            throw error;
        }
    }
    
    async startDocumentMatching() {
        try {
            this.logger.info('Starting document matching process...');
            const jobId = await this.createJob('document_matching', 'Document-level matching');
            
            // Run document matching in background
            this.runDocumentMatching(jobId).catch(error => {
                this.logger.error('Document matching failed:', error);
                this.updateJobStatus(jobId, 'failed', error.message);
            });
            
            return jobId;
            
        } catch (error) {
            this.logger.error('Error starting document matching:', error);
            throw error;
        }
    }
    
    async runDocumentMatching(jobId) {
        try {
            this.logger.info(`Starting document matching job ${jobId}`);
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
            
            this.logger.info(`Starting document matching: ${pdfs.length} PDFs, ${xmls.length} XMLs`);
            
            let processed = 0;
            await this.updateJobProgress(jobId, processed, pdfs.length);
            
            for (const pdf of pdfs) {
                this.logger.debug(`Matching PDF: ${pdf.filename}`);
                
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
                    
                    // Calculate text-based similarity
                    const textScore = await this.documentMatcher.calculateSimilarity(pdfText, xmlText);
                    
                    // Calculate title-based similarity
                    const titleScore = this.documentMatcher.calculateDocumentMatchByTitle(pdf.filename, xml.filename);
                    
                    // Combined score: give more weight to title matching for cross-language documents
                    const combinedScore = Math.max(textScore, titleScore * 0.8);
                    
                    this.logger.debug(`Matching ${pdf.filename} vs ${xml.filename}: text=${textScore.toFixed(3)}, title=${titleScore.toFixed(3)}, combined=${combinedScore.toFixed(3)}`);
                    
                    if (combinedScore > bestScore) {
                        bestScore = combinedScore;
                        bestMatch = xml;
                    }
                }
                
                if (bestMatch && bestScore > 0.1) { // Lower threshold for cross-language matching
                    const confidence = bestScore > 0.6 ? 'high' : bestScore > 0.3 ? 'medium' : 'low';
                    const needsReview = confidence === 'low';
                    
                    this.logger.info(`Document match found: ${pdf.filename} -> ${bestMatch.filename} (score: ${bestScore.toFixed(3)}, confidence: ${confidence})`);
                    
                    await runQuery(`
                        INSERT INTO document_matches (pdf_id, xml_id, similarity_score, confidence, manual_review)
                        VALUES (?, ?, ?, ?, ?)
                    `, [pdf.id, bestMatch.id, bestScore, confidence, needsReview]);
                } else {
                    this.logger.warn(`No suitable match found for PDF: ${pdf.filename} (best score: ${bestScore.toFixed(3)})`);
                }
                
                processed++;
                await this.updateJobProgress(jobId, processed, pdfs.length);
            }
            
            await this.updateJobStatus(jobId, 'completed');
            this.logger.info(`Document matching completed: ${processed} PDFs processed`);
            
        } catch (error) {
            this.logger.error(`Document matching job ${jobId} failed:`, error);
            await this.updateJobStatus(jobId, 'failed', error.message);
            throw error;
        }
    }
    
    async startParagraphMatching(documentPairId) {
        try {
            this.logger.info(`Starting paragraph matching for document pair ${documentPairId}`);
            const jobId = await this.createJob('paragraph_matching', `Paragraph matching for pair ${documentPairId}`);
            
            // Run paragraph matching in background
            this.runParagraphMatching(jobId, documentPairId).catch(error => {
                this.logger.error('Paragraph matching failed:', error);
                this.updateJobStatus(jobId, 'failed', error.message);
            });
            
            return jobId;
            
        } catch (error) {
            this.logger.error('Error starting paragraph matching:', error);
            throw error;
        }
    }
    
    async runParagraphMatching(jobId, documentPairId) {
        try {
            this.logger.info(`Starting paragraph matching job ${jobId} for document pair ${documentPairId}`);
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
            
            this.logger.info(`Starting paragraph matching: ${textBlocks.length} text blocks, ${xmlElements.length} XML elements`);
            
            await this.updateJobProgress(jobId, 0, textBlocks.length);
            
            let matchedCount = 0;
            
            for (let i = 0; i < textBlocks.length; i++) {
                const textBlock = textBlocks[i];
                this.logger.debug(`Matching text block ${i + 1}/${textBlocks.length}`);
                
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
                    
                    this.logger.debug(`Paragraph match found: score ${bestScore.toFixed(3)}, confidence: ${confidence}`);
                    
                    await runQuery(`
                        INSERT INTO paragraph_matches 
                        (text_block_id, xml_element_id, similarity_score, confidence, manual_review)
                        VALUES (?, ?, ?, ?, ?)
                    `, [textBlock.id, bestMatch.id, bestScore, confidence, needsReview]);
                    
                    matchedCount++;
                }
                
                await this.updateJobProgress(jobId, i + 1, textBlocks.length);
            }
            
            await this.updateJobStatus(jobId, 'completed');
            this.logger.info(`Paragraph matching completed for pair ${documentPairId}: ${matchedCount}/${textBlocks.length} paragraphs matched`);
            
        } catch (error) {
            this.logger.error(`Paragraph matching job ${jobId} failed:`, error);
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