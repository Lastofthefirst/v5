/**
 * Document Matcher - Handles document-level similarity matching
 * For now using basic text similarity, will be enhanced with embeddings
 */

export class DocumentMatcher {
    constructor() {
        this.threshold = 0.3; // Minimum similarity threshold
        this.logger = this.createLogger();
    }
    
    createLogger() {
        return {
            info: (message, ...args) => {
                console.log(`[DocumentMatcher] ${new Date().toISOString()} INFO: ${message}`, ...args);
            },
            error: (message, error, ...args) => {
                console.error(`[DocumentMatcher] ${new Date().toISOString()} ERROR: ${message}`, error, ...args);
            },
            warn: (message, ...args) => {
                console.warn(`[DocumentMatcher] ${new Date().toISOString()} WARN: ${message}`, ...args);
            },
            debug: (message, ...args) => {
                if (process.env.DEBUG) {
                    console.log(`[DocumentMatcher] ${new Date().toISOString()} DEBUG: ${message}`, ...args);
                }
            }
        };
    }
    
    async calculateSimilarity(text1, text2) {
        try {
            // Normalize texts
            const normalized1 = this.normalizeText(text1);
            const normalized2 = this.normalizeText(text2);
            
            // Calculate similarity using multiple methods
            const jaccardScore = this.jaccardSimilarity(normalized1, normalized2);
            const cosineSimilarity = this.cosineSimilarity(normalized1, normalized2);
            const lengthSimilarity = this.lengthSimilarity(text1, text2);
            const structuralSimilarity = this.structuralSimilarity(text1, text2);
            
            // Weighted combination
            const combinedScore = (
                jaccardScore * 0.25 + 
                cosineSimilarity * 0.25 + 
                lengthSimilarity * 0.25 +
                structuralSimilarity * 0.25
            );
            
            return Math.min(1.0, Math.max(0.0, combinedScore));
            
        } catch (error) {
            this.logger.error('Error calculating document similarity:', error);
            return 0.0;
        }
    }
    
    calculateDocumentMatchByTitle(pdfFilename, xmlFilename) {
        // Extract and normalize titles for comparison
        const pdfTitle = this.extractTitle(pdfFilename);
        const xmlTitle = this.extractTitle(xmlFilename);
        
        // Direct title matches
        const titleMatches = {
            'oraciones': ['prayers', 'meditations'],
            'meditaciones': ['prayers', 'meditations'],
            'prayers': ['oraciones', 'meditaciones'],
            'meditations': ['oraciones', 'meditaciones'],
            'tablas': ['tablets'],
            'tablets': ['tablas'],
            'palabras': ['words'],
            'words': ['palabras'],
            'ocultas': ['hidden'],
            'hidden': ['ocultas'],
            'valle': ['valley'],
            'valles': ['valley', 'valleys'],
            'valley': ['valle', 'valles'],
            'valleys': ['valles'],
            'escritos': ['writings', 'gleanings'],
            'writings': ['escritos'],
            'gleanings': ['escritos'],
            'llamado': ['call', 'summons'],
            'call': ['llamado'],
            'summons': ['llamado'],
            'naciones': ['nations'],
            'nations': ['naciones'],
            'bahaullah': ['bahaullah'],
            'abdul': ['abdul'],
            'baha': ['baha'],
            'bab': ['bab']
        };
        
        let matchScore = 0;
        const pdfWords = pdfTitle.split(' ');
        const xmlWords = xmlTitle.split(' ');
        
        // Count matching words and their translations
        for (const pdfWord of pdfWords) {
            const matches = titleMatches[pdfWord] || [];
            if (xmlWords.includes(pdfWord) || matches.some(match => xmlWords.includes(match))) {
                matchScore += 1;
            }
        }
        
        // Normalize by the average number of words
        const avgWordCount = (pdfWords.length + xmlWords.length) / 2;
        return avgWordCount > 0 ? matchScore / avgWordCount : 0;
    }
    
    extractTitle(filename) {
        // Extract meaningful title from filename
        return filename
            .replace(/\.(pdf|xml)$/i, '')
            .replace(/[-_]/g, ' ')
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .trim();
    }
    
    structuralSimilarity(text1, text2) {
        // Compare structural features like number of paragraphs, sentences, etc.
        const paragraphs1 = text1.split(/\n\s*\n/).filter(p => p.trim().length > 0);
        const paragraphs2 = text2.split(/\n\s*\n/).filter(p => p.trim().length > 0);
        
        const sentences1 = text1.split(/[.!?]+/).filter(s => s.trim().length > 0);
        const sentences2 = text2.split(/[.!?]+/).filter(s => s.trim().length > 0);
        
        // Calculate structural similarity
        const paragraphRatio = paragraphs1.length > 0 && paragraphs2.length > 0 ? 
            Math.min(paragraphs1.length, paragraphs2.length) / Math.max(paragraphs1.length, paragraphs2.length) : 0;
            
        const sentenceRatio = sentences1.length > 0 && sentences2.length > 0 ? 
            Math.min(sentences1.length, sentences2.length) / Math.max(sentences1.length, sentences2.length) : 0;
        
        return (paragraphRatio + sentenceRatio) / 2;
    }
    
    normalizeText(text) {
        if (!text) return '';
        
        return text
            .toLowerCase()
            .replace(/[^\w\s]/g, ' ') // Remove punctuation
            .replace(/\s+/g, ' ') // Normalize whitespace
            .trim();
    }
    
    jaccardSimilarity(text1, text2) {
        const tokens1 = new Set(text1.split(' ').filter(t => t.length > 2));
        const tokens2 = new Set(text2.split(' ').filter(t => t.length > 2));
        
        if (tokens1.size === 0 && tokens2.size === 0) return 1.0;
        if (tokens1.size === 0 || tokens2.size === 0) return 0.0;
        
        const intersection = new Set([...tokens1].filter(token => tokens2.has(token)));
        const union = new Set([...tokens1, ...tokens2]);
        
        return intersection.size / union.size;
    }
    
    cosineSimilarity(text1, text2) {
        const tokens1 = text1.split(' ').filter(t => t.length > 2);
        const tokens2 = text2.split(' ').filter(t => t.length > 2);
        
        if (tokens1.length === 0 || tokens2.length === 0) return 0.0;
        
        // Create vocabulary
        const vocab = new Set([...tokens1, ...tokens2]);
        const vocabArray = Array.from(vocab);
        
        // Create vectors
        const vector1 = this.createVector(tokens1, vocabArray);
        const vector2 = this.createVector(tokens2, vocabArray);
        
        // Calculate cosine similarity
        const dotProduct = vector1.reduce((sum, val, i) => sum + val * vector2[i], 0);
        const magnitude1 = Math.sqrt(vector1.reduce((sum, val) => sum + val * val, 0));
        const magnitude2 = Math.sqrt(vector2.reduce((sum, val) => sum + val * val, 0));
        
        if (magnitude1 === 0 || magnitude2 === 0) return 0.0;
        
        return dotProduct / (magnitude1 * magnitude2);
    }
    
    createVector(tokens, vocabulary) {
        const vector = new Array(vocabulary.length).fill(0);
        const tokenCounts = {};
        
        // Count token frequencies
        tokens.forEach(token => {
            tokenCounts[token] = (tokenCounts[token] || 0) + 1;
        });
        
        // Create vector based on vocabulary
        vocabulary.forEach((word, index) => {
            vector[index] = tokenCounts[word] || 0;
        });
        
        return vector;
    }
    
    lengthSimilarity(text1, text2) {
        const len1 = text1.length;
        const len2 = text2.length;
        
        if (len1 === 0 && len2 === 0) return 1.0;
        if (len1 === 0 || len2 === 0) return 0.0;
        
        const maxLen = Math.max(len1, len2);
        const minLen = Math.min(len1, len2);
        
        return minLen / maxLen;
    }
    
    async calculateEmbeddingSimilarity(text1, text2) {
        // TODO: Implement when embedding model is available
        // This would use the nomic-embed-text-v2-moe model
        // For now, fall back to text-based similarity
        return this.calculateSimilarity(text1, text2);
    }
}