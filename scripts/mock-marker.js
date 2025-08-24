#!/usr/bin/env node
/**
 * Mock marker_single command for testing purposes
 * Creates a simple JSON output structure similar to marker
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { basename, dirname, join } from 'path';
import { existsSync } from 'fs';

async function mockMarker() {
    const args = process.argv.slice(2);
    
    // Parse arguments
    let pdfPath = '';
    let outputDir = '';
    let useGemini = false;
    
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--output_dir' && i + 1 < args.length) {
            outputDir = args[i + 1];
            i++;
        } else if (args[i] === '--gemini_api_key' && i + 1 < args.length) {
            // Skip API key
            i++;
        } else if (args[i] === '--use_llm') {
            useGemini = true;
        } else if (args[i] === '--output_format' && i + 1 < args.length) {
            // Skip format
            i++;
        } else if (!args[i].startsWith('--')) {
            pdfPath = args[i];
        }
    }
    
    if (!pdfPath || !existsSync(pdfPath)) {
        console.error('Error: PDF file not found:', pdfPath);
        process.exit(1);
    }
    
    if (!outputDir) {
        console.error('Error: Output directory not specified');
        process.exit(1);
    }
    
    try {
        // Create output directory structure
        const pdfName = basename(pdfPath, '.pdf');
        const pdfOutputDir = join(outputDir, pdfName);
        await mkdir(pdfOutputDir, { recursive: true });
        
        // Create mock content based on PDF filename
        const mockContent = generateMockContent(pdfName);
        
        // Write output JSON file
        const outputFile = join(pdfOutputDir, `${pdfName}.json`);
        await writeFile(outputFile, JSON.stringify(mockContent, null, 2), 'utf-8');
        
        console.log(`Mock marker processing completed: ${outputFile}`);
        console.log(`Processed: ${pdfPath}`);
        
    } catch (error) {
        console.error('Mock marker error:', error.message);
        process.exit(1);
    }
}

function generateMockContent(pdfName) {
    // Generate mock content that resembles what marker would produce
    const mockTexts = [
        `Título: ${pdfName.replace(/-/g, ' ').toUpperCase()}`,
        '',
        'Este es un documento de ejemplo que contiene texto en español.',
        'El procesamiento con marker extraería el contenido real del PDF.',
        '',
        'Párrafo 1: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
        '',
        'Párrafo 2: Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.',
        '',
        'Párrafo 3: Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.',
        '',
        'Conclusión: Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.',
        '',
        `Documento procesado: ${pdfName}`,
        'Fin del documento.'
    ];
    
    // Add some variety based on filename
    if (pdfName.includes('bahaullah') || pdfName.includes('Bahaullah')) {
        mockTexts.splice(2, 0, 'Escritos de Bahá\'u\'lláh');
        mockTexts.push('Texto sagrado bahá\'í');
    } else if (pdfName.includes('abdul-baha') || pdfName.includes('Abdul-Baha')) {
        mockTexts.splice(2, 0, 'Escritos de \'Abdu\'l-Bahá');
        mockTexts.push('Cartas y discursos');
    } else if (pdfName.includes('el-bab') || pdfName.includes('bab')) {
        mockTexts.splice(2, 0, 'Escritos del Báb');
        mockTexts.push('Revelaciones del Báb');
    }
    
    return mockTexts.join('\n');
}

mockMarker().catch(console.error);