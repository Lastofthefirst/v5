/**
 * PDF Processor - Handles PDF extraction using marker
 */

import { spawn } from 'child_process';
import { readFile, writeFile, unlink, mkdir } from 'fs/promises';
import { join, basename, dirname } from 'path';
import { franc } from 'franc';
import { existsSync } from 'fs';

export class PdfProcessor {
    constructor() {
        this.markerOutputDir = join(process.cwd(), 'data', 'marker_output');
        this.ensureOutputDir();
        this.logger = this.createLogger();
    }
    
    createLogger() {
        return {
            info: (message, ...args) => {
                console.log(`[PdfProcessor] ${new Date().toISOString()} INFO: ${message}`, ...args);
            },
            error: (message, error, ...args) => {
                console.error(`[PdfProcessor] ${new Date().toISOString()} ERROR: ${message}`, error, ...args);
            },
            warn: (message, ...args) => {
                console.warn(`[PdfProcessor] ${new Date().toISOString()} WARN: ${message}`, ...args);
            },
            debug: (message, ...args) => {
                if (process.env.DEBUG) {
                    console.log(`[PdfProcessor] ${new Date().toISOString()} DEBUG: ${message}`, ...args);
                }
            }
        };
    }
    
    async ensureOutputDir() {
        try {
            await mkdir(this.markerOutputDir, { recursive: true });
            this.logger?.info(`Ensured marker output directory: ${this.markerOutputDir}`);
        } catch (error) {
            console.error('Error creating marker output directory:', error);
        }
    }
    
    async extractTextBlocks(pdfPath) {
        try {
            this.logger.info(`Extracting text blocks from: ${pdfPath}`);
            
            // Check if already processed
            const outputPath = join(this.markerOutputDir, `${basename(pdfPath, '.pdf')}.json`);
            
            if (existsSync(outputPath)) {
                this.logger.info('Using cached marker output');
                const cachedData = await readFile(outputPath, 'utf-8');
                const data = JSON.parse(cachedData);
                return this.parseMarkerOutput(data.content);
            }
            
            // Run marker_single command
            this.logger.info('Running marker extraction...');
            const markerData = await this.runMarker(pdfPath);
            
            // Save the structured data
            const structuredData = {
                source_pdf: basename(pdfPath),
                processing_date: new Date().toISOString(),
                content: markerData
            };
            
            await writeFile(outputPath, JSON.stringify(structuredData, null, 2), 'utf-8');
            this.logger.info(`Saved marker output to: ${outputPath}`);
            
            // Parse and return text blocks
            const textBlocks = this.parseMarkerOutput(markerData);
            this.logger.info(`Successfully extracted ${textBlocks.length} text blocks`);
            return textBlocks;
            
        } catch (error) {
            this.logger.error('Error extracting text blocks:', error);
            throw error;
        }
    }
    
    async runMarker(pdfPath) {
        return new Promise((resolve, reject) => {
            const geminiApiKey = process.env.GEMINI_API_KEY;
            if (!geminiApiKey) {
                reject(new Error('GEMINI_API_KEY environment variable is required'));
                return;
            }
            
            const tempOutputDir = join(this.markerOutputDir, 'temp', Date.now().toString());
            
            const command = 'marker_single';
            const args = [
                pdfPath,
                '--use_llm',
                '--gemini_api_key', geminiApiKey,
                '--output_format', 'json',
                '--output_dir', tempOutputDir
            ];
            
            this.logger.info(`Running marker command: ${command} ${args.join(' ')}`);
            
            const childProcess = spawn(command, args, {
                stdio: ['pipe', 'pipe', 'pipe']
            });
            
            let stdout = '';
            let stderr = '';
            
            childProcess.stdout.on('data', (data) => {
                stdout += data.toString();
                this.logger.debug('Marker stdout:', data.toString());
            });
            
            childProcess.stderr.on('data', (data) => {
                stderr += data.toString();
                this.logger.debug('Marker stderr:', data.toString()); // Log progress
            });
            
            childProcess.on('close', async (code) => {
                if (code !== 0) {
                    this.logger.error(`Marker process failed with code ${code}. stderr: ${stderr}`);
                    reject(new Error(`Marker process failed with code ${code}. stderr: ${stderr}`));
                    return;
                }
                
                try {
                    // Find the output JSON file
                    const expectedOutputFile = join(tempOutputDir, basename(pdfPath, '.pdf'), `${basename(pdfPath, '.pdf')}.json`);
                    
                    if (existsSync(expectedOutputFile)) {
                        this.logger.info(`Reading marker output from: ${expectedOutputFile}`);
                        const markerContent = await readFile(expectedOutputFile, 'utf-8');
                        const data = JSON.parse(markerContent);
                        
                        // Clean up temp directory
                        await this.cleanupTempDir(tempOutputDir);
                        
                        this.logger.info('Marker extraction completed successfully');
                        resolve(data);
                    } else {
                        this.logger.error(`Marker output file not found: ${expectedOutputFile}`);
                        reject(new Error(`Marker output file not found: ${expectedOutputFile}`));
                    }
                } catch (error) {
                    this.logger.error('Error reading marker output:', error);
                    reject(error);
                }
            });
            
            childProcess.on('error', (error) => {
                this.logger.error('Failed to start marker process:', error);
                reject(new Error(`Failed to start marker process: ${error.message}`));
            });
        });
    }
    
    async cleanupTempDir(tempDir) {
        try {
            const { exec } = await import('child_process');
            const { promisify } = await import('util');
            const execAsync = promisify(exec);
            await execAsync(`rm -rf "${tempDir}"`);
            this.logger.debug(`Cleaned up temp directory: ${tempDir}`);
        } catch (error) {
            this.logger.warn('Failed to clean up temp directory:', error.message);
        }
    }
    
    parseMarkerOutput(markerData) {
        const textBlocks = [];
        
        try {
            // Marker output is typically a markdown string
            // We need to split it into logical text blocks
            
            if (typeof markerData === 'string') {
                // Split by double newlines to get paragraphs
                const paragraphs = markerData.split(/\n\s*\n/).filter(p => p.trim().length > 0);
                
                paragraphs.forEach((paragraph, index) => {
                    const cleanText = paragraph.trim();
                    if (cleanText.length > 10) { // Filter out very short blocks
                        textBlocks.push({
                            text: cleanText,
                            position: {
                                block_index: index,
                                page: this.estimatePageNumber(index, paragraphs.length)
                            }
                        });
                    }
                });
            } else if (typeof markerData === 'object' && markerData.content) {
                // If marker returns structured data
                return this.parseMarkerOutput(markerData.content);
            } else {
                // Fallback: convert object to text blocks
                const text = JSON.stringify(markerData);
                textBlocks.push({
                    text: text,
                    position: { block_index: 0, page: 1 }
                });
            }
            
        } catch (error) {
            this.logger.error('Error parsing marker output:', error);
            // Fallback: treat as single text block
            textBlocks.push({
                text: String(markerData),
                position: { block_index: 0, page: 1 }
            });
        }
        
        this.logger.info(`Extracted ${textBlocks.length} text blocks`);
        return textBlocks;
    }
    
    estimatePageNumber(blockIndex, totalBlocks) {
        // Rough estimation: assume 10-15 blocks per page
        const blocksPerPage = 12;
        return Math.floor(blockIndex / blocksPerPage) + 1;
    }
    
    async detectLanguage(textBlocks) {
        try {
            // Combine first few text blocks for language detection
            const sampleText = textBlocks
                .slice(0, 5)
                .map(block => block.text)
                .join(' ')
                .substring(0, 1000); // First 1000 characters
            
            if (sampleText.length < 10) {
                return 'unknown';
            }
            
            // Use franc for language detection
            const detectedLang = franc(sampleText);
            
            // Map ISO 639-3 codes to more readable names
            const languageMap = {
                'eng': 'English',
                'spa': 'Spanish',
                'fra': 'French',
                'deu': 'German',
                'ita': 'Italian',
                'por': 'Portuguese',
                'rus': 'Russian',
                'ara': 'Arabic',
                'per': 'Persian',
                'tur': 'Turkish',
                'urd': 'Urdu',
                'hin': 'Hindi'
            };
            
            return languageMap[detectedLang] || detectedLang || 'unknown';
            
        } catch (error) {
            this.logger.error('Error detecting language:', error);
            return 'unknown';
        }
    }
}