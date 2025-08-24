#!/usr/bin/env node
/**
 * Test script to debug document matching issues
 */

import { DocumentMatcher } from './src/server/pipeline/document-matcher.js';

async function testDocumentMatching() {
    console.log('Testing document matching logic...');
    
    const matcher = new DocumentMatcher();
    
    // Test title-based matching
    console.log('\n=== Test Title Matching ===');
    const testCases = [
        ['oraciones-y-meditaciones.pdf', 'prayers-meditations.xml'],
        ['tablas-de-bahaullah.pdf', 'tablets-bahaullah.xml'],
        ['seleccion-escritos-el-bab.pdf', 'gleanings-writings-bahaullah.xml'],
        ['siete-valles-y-cuatro-valles.pdf', 'hidden-words.xml'],
        ['llamado-a-las-naciones.pdf', 'call-divine-beloved.xml'],
        ['hidden-words.xml', 'prayers-meditations.xml'], // Should not match well
    ];
    
    for (const [pdf, xml] of testCases) {
        const score = matcher.calculateDocumentMatchByTitle(pdf, xml);
        console.log(`${pdf} vs ${xml}: ${score.toFixed(3)}`);
    }
    
    // Test with sample text that should match
    const spanishText = `
    Oraciones y Meditaciones
    
    Oh Dios, mi Dios! Te suplico por el fulgor de Tu luz y por Tu misericordia que envuelve todos los mundos.
    
    Concédeme que pueda servir a Tu Causa con sinceridad y devoción.
    
    Haz que mi corazón sea un tesoro de amor hacia Ti y hacia toda la humanidad.
    `;
    
    const englishText = `
    Prayers and Meditations
    
    O my God, my God! I beseech Thee by the splendor of Thy light and by Thy mercy that encompasses all worlds.
    
    Grant that I may serve Thy Cause with sincerity and devotion.
    
    Make my heart a treasury of love for Thee and for all humanity.
    `;
    
    console.log('\n=== Test Combined Similarity ===');
    const textScore = await matcher.calculateSimilarity(spanishText, englishText);
    const titleScore = matcher.calculateDocumentMatchByTitle('oraciones-y-meditaciones.pdf', 'prayers-meditations.xml');
    const combinedScore = Math.max(textScore, titleScore * 0.8);
    
    console.log(`Text similarity: ${textScore.toFixed(3)}`);
    console.log(`Title similarity: ${titleScore.toFixed(3)}`);
    console.log(`Combined score: ${combinedScore.toFixed(3)}`);
    
    console.log('\n=== Test Structural Similarity ===');
    const structuralScore = matcher.structuralSimilarity(spanishText, englishText);
    console.log(`Structural similarity: ${structuralScore.toFixed(3)}`);
}

testDocumentMatching().catch(console.error);