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
        this.markerOutputDir = join(
            process.cwd(), 
            process.env.MARKER_OUTPUT_DIR || 'data/marker_output'
        );
        this.ensureOutputDir();
    }
    
    async ensureOutputDir() {
        try {
            const outputDir = join(
                process.cwd(),
                process.env.DATA_DIR || 'data',
                'marker_output'
            );
            this.markerOutputDir = outputDir;
            await mkdir(outputDir, { recursive: true });
        } catch (error) {
            console.error('Error creating marker output directory:', error);
        }
    }
    
    async extractTextBlocks(pdfPath) {
        try {
            console.log(`Extracting text blocks from: ${pdfPath}`);
            
            // Check if already processed
            const outputPath = join(this.markerOutputDir, `${basename(pdfPath, '.pdf')}.json`);
            
            if (existsSync(outputPath)) {
                console.log('Using cached marker output');
                const cachedData = await readFile(outputPath, 'utf-8');
                const data = JSON.parse(cachedData);
                return this.parseMarkerOutput(data.content);
            }
            
            // Run marker_single command
            const markerData = await this.runMarker(pdfPath);
            
            // Save the structured data
            const structuredData = {
                source_pdf: basename(pdfPath),
                processing_date: new Date().toISOString(),
                content: markerData
            };
            
            await writeFile(outputPath, JSON.stringify(structuredData, null, 2), 'utf-8');
            
            // Parse and return text blocks
            return this.parseMarkerOutput(markerData);
            
        } catch (error) {
            console.error('Error extracting text blocks:', error);
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
            
            console.log('Running marker command:', command, args.join(' '));
            
            const process = spawn(command, args, {
                stdio: ['pipe', 'pipe', 'pipe']
            });
            
            let stdout = '';
            let stderr = '';
            
            process.stdout.on('data', (data) => {
                stdout += data.toString();
            });
            
            process.stderr.on('data', (data) => {
                stderr += data.toString();
                console.log('Marker stderr:', data.toString()); // Log progress
            });
            
            process.on('close', async (code) => {
                if (code !== 0) {
                    reject(new Error(`Marker process failed with code ${code}. stderr: ${stderr}`));
                    return;
                }
                
                try {
                    // Find the output JSON file
                    const expectedOutputFile = join(tempOutputDir, basename(pdfPath, '.pdf'), `${basename(pdfPath, '.pdf')}.json`);
                    
                    if (existsSync(expectedOutputFile)) {
                        const markerContent = await readFile(expectedOutputFile, 'utf-8');
                        const data = JSON.parse(markerContent);
                        
                        // Clean up temp directory
                        await this.cleanupTempDir(tempOutputDir);
                        
                        resolve(data);
                    } else {
                        reject(new Error(`Marker output file not found: ${expectedOutputFile}`));
                    }
                } catch (error) {
                    reject(error);
                }
            });
            
            process.on('error', (error) => {
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
        } catch (error) {
            console.warn('Failed to clean up temp directory:', error.message);
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
            console.error('Error parsing marker output:', error);
            // Fallback: treat as single text block
            textBlocks.push({
                text: String(markerData),
                position: { block_index: 0, page: 1 }
            });
        }
        
        console.log(`Extracted ${textBlocks.length} text blocks`);
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
            console.error('Error detecting language:', error);
            return 'unknown';
        }
    }
}