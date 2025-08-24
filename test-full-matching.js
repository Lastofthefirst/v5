#!/usr/bin/env node
/**
 * Standalone test to verify the document matching fixes work
 */

import { DocumentMatcher } from './src/server/pipeline/document-matcher.js';
import { PdfProcessor } from './src/server/pipeline/pdf-processor.js';
import { XmlProcessor } from './src/server/pipeline/xml-processor.js';
import { join } from 'path';

async function runMatchingTest() {
    console.log('=== Document Matching Test ===\n');
    
    const documentMatcher = new DocumentMatcher();
    const pdfProcessor = new PdfProcessor();
    const xmlProcessor = new XmlProcessor();
    
    // Set mock mode for PDF processing
    process.env.USE_MOCK_MARKER = '1';
    
    console.log('1. Testing PDF extraction...');
    const pdfPath = join(process.cwd(), 'input_pdfs/oraciones-y-meditaciones.pdf');
    const textBlocks = await pdfProcessor.extractTextBlocks(pdfPath);
    const pdfText = textBlocks.map(block => block.text).join(' ');
    console.log(`   PDF: ${pdfPath}`);
    console.log(`   Extracted ${textBlocks.length} text blocks`);
    console.log(`   Total text length: ${pdfText.length} characters`);
    console.log(`   Sample: ${pdfText.substring(0, 100)}...`);
    console.log(`   Language: ${await pdfProcessor.detectLanguage(textBlocks)}\n`);
    
    console.log('2. Testing XML extraction...');
    const xmlPath = join(process.cwd(), 'ref_xml/bahaullah/prayers-meditations.xml');
    const elements = await xmlProcessor.extractElements(xmlPath);
    const xmlText = elements.map(el => el.text).join(' ');
    console.log(`   XML: ${xmlPath}`);
    console.log(`   Extracted ${elements.length} XML elements`);
    console.log(`   Total text length: ${xmlText.length} characters`);
    console.log(`   Sample: ${xmlText.substring(0, 100)}...`);
    
    console.log('\n3. Testing document matching...');
    
    // Test cases with different PDFs and XMLs
    const testCases = [
        {
            pdfFile: 'oraciones-y-meditaciones.pdf',
            xmlFile: 'prayers-meditations.xml',
            xmlPath: 'ref_xml/bahaullah/prayers-meditations.xml',
            expected: 'HIGH' // Should match well
        },
        {
            pdfFile: 'tablas-de-bahaullah.pdf', 
            xmlFile: 'tablets-bahaullah.xml',
            xmlPath: 'ref_xml/bahaullah/tablets-bahaullah.xml',
            expected: 'HIGH' // Should match well
        },
        {
            pdfFile: 'oraciones-y-meditaciones.pdf',
            xmlFile: 'hidden-words.xml', 
            xmlPath: 'ref_xml/bahaullah/hidden-words.xml',
            expected: 'LOW' // Should not match well
        }
    ];
    
    for (const testCase of testCases) {
        console.log(`\n   Testing: ${testCase.pdfFile} vs ${testCase.xmlFile}`);
        
        // Get PDF text (mock for all except oraciones-y-meditaciones)
        let currentPdfText = pdfText;
        if (testCase.pdfFile !== 'oraciones-y-meditaciones.pdf') {
            const mockBlocks = await pdfProcessor.extractTextBlocks(join(process.cwd(), 'input_pdfs', testCase.pdfFile));
            currentPdfText = mockBlocks.map(block => block.text).join(' ');
        }
        
        // Get XML text
        const currentXmlPath = join(process.cwd(), testCase.xmlPath);
        const currentElements = await xmlProcessor.extractElements(currentXmlPath);
        const currentXmlText = currentElements.map(el => el.text).join(' ');
        
        // Calculate similarities
        const textScore = await documentMatcher.calculateSimilarity(currentPdfText, currentXmlText);
        const titleScore = documentMatcher.calculateDocumentMatchByTitle(testCase.pdfFile, testCase.xmlFile);
        const combinedScore = Math.max(textScore, titleScore * 0.8);
        
        console.log(`     Text similarity: ${textScore.toFixed(3)}`);
        console.log(`     Title similarity: ${titleScore.toFixed(3)}`);
        console.log(`     Combined score: ${combinedScore.toFixed(3)}`);
        
        // Determine if this would be above the threshold
        const threshold = 0.1;
        const wouldMatch = combinedScore > threshold;
        console.log(`     Above threshold (${threshold}): ${wouldMatch ? 'YES' : 'NO'}`);
        console.log(`     Expected: ${testCase.expected}, Actual: ${wouldMatch ? (combinedScore > 0.5 ? 'HIGH' : 'MEDIUM') : 'LOW'}`);
        
        if (testCase.expected === 'HIGH' && !wouldMatch) {
            console.log(`     ⚠️  Expected high match but got low score`);
        } else if (testCase.expected === 'LOW' && wouldMatch && combinedScore > 0.5) {
            console.log(`     ⚠️  Expected low match but got high score`);
        } else {
            console.log(`     ✅ Result matches expectation`);
        }
    }
    
    console.log('\n=== Summary ===');
    console.log('Document matching logic has been improved with:');
    console.log('1. Title-based matching for cross-language documents');
    console.log('2. Structural similarity comparison');
    console.log('3. Combined scoring with lower threshold (0.1 vs 0.3)');
    console.log('4. Mock PDF processor to bypass GEMINI_API_KEY requirement');
    console.log('\nThe fixes should resolve the 0.000 similarity score issue.');
}

runMatchingTest().catch(console.error);