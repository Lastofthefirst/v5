#!/usr/bin/env node
/**
 * Test script to check actual extracted content
 */

import { XmlProcessor } from './src/server/pipeline/xml-processor.js';
import { PdfProcessor } from './src/server/pipeline/pdf-processor.js';
import { join } from 'path';

async function testContentExtraction() {
    console.log('Testing content extraction...');
    
    // Test XML processing
    console.log('\n=== Testing XML Processing ===');
    const xmlProcessor = new XmlProcessor();
    
    try {
        const xmlPath = join(process.cwd(), 'ref_xml/bahaullah/hidden-words.xml');
        console.log(`Processing XML: ${xmlPath}`);
        
        const elements = await xmlProcessor.extractElements(xmlPath);
        console.log(`Extracted ${elements.length} elements`);
        
        // Show first few elements
        console.log('\nFirst 3 elements:');
        for (let i = 0; i < Math.min(3, elements.length); i++) {
            const el = elements[i];
            console.log(`Element ${i + 1}:`);
            console.log(`  Type: ${el.type}`);
            console.log(`  ID: ${el.id}`);
            console.log(`  Text: ${el.text.substring(0, 100)}...`);
            console.log('');
        }
        
        // Combine all text for document-level matching
        const combinedXmlText = elements.map(el => el.text).join(' ');
        console.log(`Combined XML text length: ${combinedXmlText.length} characters`);
        console.log(`Sample combined text: ${combinedXmlText.substring(0, 200)}...`);
        
    } catch (error) {
        console.error('XML processing error:', error.message);
    }
    
    // Test PDF processing with mock data
    console.log('\n=== Testing PDF Processing (Mock) ===');
    const pdfProcessor = new PdfProcessor();
    
    try {
        const pdfPath = join(process.cwd(), 'input_pdfs/oraciones-y-meditaciones.pdf');
        console.log(`Processing PDF: ${pdfPath}`);
        
        // Set mock mode
        process.env.USE_MOCK_MARKER = '1';
        
        const textBlocks = await pdfProcessor.extractTextBlocks(pdfPath);
        console.log(`Extracted ${textBlocks.length} text blocks`);
        
        // Show first few blocks
        console.log('\nFirst 3 text blocks:');
        for (let i = 0; i < Math.min(3, textBlocks.length); i++) {
            const block = textBlocks[i];
            console.log(`Block ${i + 1}:`);
            console.log(`  Text: ${block.text.substring(0, 100)}...`);
            console.log(`  Position: ${JSON.stringify(block.position)}`);
            console.log('');
        }
        
        // Combine all text for document-level matching
        const combinedPdfText = textBlocks.map(block => block.text).join(' ');
        console.log(`Combined PDF text length: ${combinedPdfText.length} characters`);
        console.log(`Sample combined text: ${combinedPdfText.substring(0, 200)}...`);
        
        // Test language detection
        const language = await pdfProcessor.detectLanguage(textBlocks);
        console.log(`Detected language: ${language}`);
        
    } catch (error) {
        console.error('PDF processing error:', error.message);
    }
}

testContentExtraction().catch(console.error);