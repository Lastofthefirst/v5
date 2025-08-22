/**
 * Paragraph Matcher - Handles paragraph-level similarity matching
 * Enhanced version of document matcher for shorter text segments
 */

export class ParagraphMatcher {
    constructor() {
        this.threshold = 0.4; // Lower threshold for paragraph matching
    }
    
    async calculateSimilarity(text1, text2) {
        try {
            // Handle empty or very short texts
            if (!text1 || !text2) return 0.0;
            if (text1.trim().length < 3 || text2.trim().length < 3) return 0.0;
            
            // Normalize texts
            const normalized1 = this.normalizeText(text1);
            const normalized2 = this.normalizeText(text2);
            
            // For very similar texts, return high score quickly
            if (normalized1 === normalized2) return 1.0;
            
            // Calculate similarity using multiple methods optimized for paragraphs
            const exactMatchScore = this.exactPhraseMatching(normalized1, normalized2);
            const sequenceScore = this.longestCommonSubsequence(normalized1, normalized2);
            const wordOrderScore = this.wordOrderSimilarity(normalized1, normalized2);
            const semanticScore = this.semanticSimilarity(normalized1, normalized2);
            
            // Weighted combination optimized for paragraph matching
            const combinedScore = (
                exactMatchScore * 0.3 + 
                sequenceScore * 0.25 + 
                wordOrderScore * 0.25 +
                semanticScore * 0.2
            );
            
            return Math.min(1.0, Math.max(0.0, combinedScore));
            
        } catch (error) {
            console.error('Error calculating paragraph similarity:', error);
            return 0.0;
        }
    }
    
    normalizeText(text) {
        if (!text) return '';
        
        return text
            .toLowerCase()
            .replace(/[^\w\s]/g, ' ') // Remove punctuation
            .replace(/\s+/g, ' ') // Normalize whitespace
            .trim();
    }
    
    exactPhraseMatching(text1, text2) {
        const words1 = text1.split(' ').filter(w => w.length > 2);
        const words2 = text2.split(' ').filter(w => w.length > 2);
        
        if (words1.length === 0 || words2.length === 0) return 0.0;
        
        let matches = 0;
        let totalPhrases = 0;
        
        // Check for 2-word and 3-word phrase matches
        for (let phraseLen = 2; phraseLen <= 3; phraseLen++) {
            const phrases1 = this.getPhrases(words1, phraseLen);
            const phrases2 = this.getPhrases(words2, phraseLen);
            
            const phraseSet2 = new Set(phrases2);
            
            for (const phrase of phrases1) {
                totalPhrases++;
                if (phraseSet2.has(phrase)) {
                    matches++;
                }
            }
        }
        
        return totalPhrases > 0 ? matches / totalPhrases : 0.0;
    }
    
    getPhrases(words, length) {
        const phrases = [];
        for (let i = 0; i <= words.length - length; i++) {
            phrases.push(words.slice(i, i + length).join(' '));
        }
        return phrases;
    }
    
    longestCommonSubsequence(text1, text2) {
        const words1 = text1.split(' ');
        const words2 = text2.split(' ');
        
        const lcs = this.lcsLength(words1, words2);
        const maxLength = Math.max(words1.length, words2.length);
        
        return maxLength > 0 ? lcs / maxLength : 0.0;
    }
    
    lcsLength(arr1, arr2) {
        const m = arr1.length;
        const n = arr2.length;
        const dp = Array(m + 1).fill().map(() => Array(n + 1).fill(0));
        
        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                if (arr1[i - 1] === arr2[j - 1]) {
                    dp[i][j] = dp[i - 1][j - 1] + 1;
                } else {
                    dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
                }
            }
        }
        
        return dp[m][n];
    }
    
    wordOrderSimilarity(text1, text2) {
        const words1 = text1.split(' ').filter(w => w.length > 2);
        const words2 = text2.split(' ').filter(w => w.length > 2);
        
        if (words1.length === 0 || words2.length === 0) return 0.0;
        
        // Find common words
        const commonWords = words1.filter(word => words2.includes(word));
        
        if (commonWords.length === 0) return 0.0;
        
        // Calculate order preservation
        let orderScore = 0;
        for (let i = 0; i < commonWords.length - 1; i++) {
            const word1 = commonWords[i];
            const word2 = commonWords[i + 1];
            
            const pos1_1 = words1.indexOf(word1);
            const pos1_2 = words1.indexOf(word2);
            const pos2_1 = words2.indexOf(word1);
            const pos2_2 = words2.indexOf(word2);
            
            // Check if order is preserved
            if ((pos1_1 < pos1_2) === (pos2_1 < pos2_2)) {
                orderScore++;
            }
        }
        
        const maxPairs = commonWords.length - 1;
        return maxPairs > 0 ? orderScore / maxPairs : 0.0;
    }
    
    semanticSimilarity(text1, text2) {
        // Enhanced word overlap with semantic considerations
        const words1 = text1.split(' ').filter(w => w.length > 2);
        const words2 = text2.split(' ').filter(w => w.length > 2);
        
        if (words1.length === 0 || words2.length === 0) return 0.0;
        
        // Weight words by their rarity (longer words are often more meaningful)
        const weightedOverlap = this.calculateWeightedOverlap(words1, words2);
        const totalWeight = Math.max(
            this.calculateTotalWeight(words1),
            this.calculateTotalWeight(words2)
        );
        
        return totalWeight > 0 ? weightedOverlap / totalWeight : 0.0;
    }
    
    calculateWeightedOverlap(words1, words2) {
        const set2 = new Set(words2);
        let overlap = 0;
        
        for (const word of words1) {
            if (set2.has(word)) {
                // Weight by word length (longer words are more meaningful)
                overlap += Math.min(word.length / 3, 3); // Cap at 3x weight
            }
        }
        
        return overlap;
    }
    
    calculateTotalWeight(words) {
        return words.reduce((total, word) => {
            return total + Math.min(word.length / 3, 3);
        }, 0);
    }
    
    async calculateEmbeddingSimilarity(text1, text2) {
        // TODO: Implement when embedding model is available
        // This would use the nomic-embed-text-v2-moe model with proper prefixes
        // search_query for PDF text, search_document for XML text
        return this.calculateSimilarity(text1, text2);
    }
    
    // Validation helpers
    validateMatch(text1, text2, score, customTerms = []) {
        const flags = [];
        
        // Check for significant length differences
        const lengthRatio = Math.min(text1.length, text2.length) / Math.max(text1.length, text2.length);
        if (lengthRatio < 0.3) {
            flags.push('significant_length_difference');
        }
        
        // Check for custom terms presence/absence
        if (customTerms && customTerms.length > 0) {
            const hasTerms1 = customTerms.some(term => text1.toLowerCase().includes(term.toLowerCase()));
            const hasTerms2 = customTerms.some(term => text2.toLowerCase().includes(term.toLowerCase()));
            
            if (hasTerms1 !== hasTerms2) {
                flags.push('custom_terms_mismatch');
            }
        }
        
        // Check for very low content similarity despite high score
        const contentWords1 = text1.split(' ').filter(w => w.length > 3);
        const contentWords2 = text2.split(' ').filter(w => w.length > 3);
        const contentOverlap = contentWords1.filter(w => contentWords2.includes(w)).length;
        const contentSimilarity = contentOverlap / Math.max(contentWords1.length, 1);
        
        if (score > 0.6 && contentSimilarity < 0.2) {
            flags.push('low_content_overlap');
        }
        
        return flags;
    }
}