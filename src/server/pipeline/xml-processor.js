/**
 * XML Processor - Handles XML parsing and element extraction
 */

import { readFile } from 'fs/promises';
import xml2js from 'xml2js';
import { DOMParser } from 'xmldom';

export class XmlProcessor {
    constructor() {
        this.parser = new xml2js.Parser({
            preserveChildrenOrder: true,
            explicitArray: false,
            explicitChildren: true,
            includeWhiteSpace: false
        });
    }
    
    async extractElements(xmlPath) {
        try {
            console.log(`Extracting elements from: ${xmlPath}`);
            
            const xmlContent = await readFile(xmlPath, 'utf-8');
            const doc = new DOMParser().parseFromString(xmlContent, 'text/xml');
            
            const elements = [];
            
            // Extract text-containing elements using DOM traversal
            this.extractTextElements(doc.documentElement, elements, '');
            
            console.log(`Extracted ${elements.length} text elements`);
            return elements;
            
        } catch (error) {
            console.error('Error extracting XML elements:', error);
            throw error;
        }
    }
    
    extractTextElements(node, elements, currentPath) {
        if (!node) return;
        
        // Build XPath-like identifier
        const nodeName = node.nodeName;
        const path = currentPath ? `${currentPath}/${nodeName}` : nodeName;
        
        // Check if this node has an ID attribute
        const idAttr = node.getAttribute && node.getAttribute('id');
        const nodeId = idAttr || this.generateXPathId(node, path);
        
        // Check if this is a text-containing element we want to extract
        if (this.isExtractableElement(node)) {
            const textContent = this.getTextContent(node);
            
            if (textContent && textContent.trim().length > 5) {
                elements.push({
                    id: nodeId,
                    text: textContent.trim(),
                    structure: this.preserveElementStructure(node),
                    type: this.getElementType(node),
                    xpath: path
                });
            }
        }
        
        // Recursively process child nodes
        if (node.childNodes) {
            for (let i = 0; i < node.childNodes.length; i++) {
                const child = node.childNodes[i];
                if (child.nodeType === 1) { // Element node
                    this.extractTextElements(child, elements, path);
                }
            }
        }
    }
    
    isExtractableElement(node) {
        if (!node || node.nodeType !== 1) return false; // Only element nodes
        
        const tagName = node.nodeName.toLowerCase();
        
        // Extract common text elements
        const textElements = [
            'p', 'div', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
            'li', 'td', 'th', 'blockquote', 'pre', 'article', 'section'
        ];
        
        if (textElements.includes(tagName)) {
            return true;
        }
        
        // Check if element has class attributes that suggest text content
        const className = node.getAttribute && node.getAttribute('class');
        if (className) {
            const textClasses = [
                'brl-title', 'brl-doc-author', 'brl-doc-byline', 
                'brl-text', 'content', 'paragraph'
            ];
            
            if (textClasses.some(cls => className.includes(cls))) {
                return true;
            }
        }
        
        // Check if it's a leaf node with meaningful text
        if (this.isLeafNode(node) && this.hasSignificantText(node)) {
            return true;
        }
        
        return false;
    }
    
    isLeafNode(node) {
        if (!node.childNodes) return true;
        
        // Check if all children are text nodes or insignificant elements
        for (let i = 0; i < node.childNodes.length; i++) {
            const child = node.childNodes[i];
            if (child.nodeType === 1) { // Element node
                const tagName = child.nodeName.toLowerCase();
                // Skip these formatting elements
                if (!['a', 'span', 'strong', 'em', 'i', 'b', 'br'].includes(tagName)) {
                    return false;
                }
            }
        }
        return true;
    }
    
    hasSignificantText(node) {
        const text = this.getTextContent(node);
        return text && text.trim().length > 5;
    }
    
    getTextContent(node) {
        if (!node) return '';
        
        let text = '';
        
        if (node.nodeType === 3) { // Text node
            return node.nodeValue || '';
        }
        
        if (node.childNodes) {
            for (let i = 0; i < node.childNodes.length; i++) {
                const child = node.childNodes[i];
                if (child.nodeType === 3) { // Text node
                    text += child.nodeValue || '';
                } else if (child.nodeType === 1) { // Element node
                    text += this.getTextContent(child);
                }
            }
        }
        
        return text;
    }
    
    preserveElementStructure(node) {
        if (!node) return null;
        
        const structure = {
            tagName: node.nodeName,
            attributes: {}
        };
        
        // Preserve attributes
        if (node.attributes) {
            for (let i = 0; i < node.attributes.length; i++) {
                const attr = node.attributes[i];
                structure.attributes[attr.name] = attr.value;
            }
        }
        
        // Preserve child structure for formatting
        structure.children = [];
        if (node.childNodes) {
            for (let i = 0; i < node.childNodes.length; i++) {
                const child = node.childNodes[i];
                if (child.nodeType === 1) { // Element node
                    structure.children.push(this.preserveElementStructure(child));
                } else if (child.nodeType === 3 && child.nodeValue.trim()) { // Text node
                    structure.children.push({
                        type: 'text',
                        content: child.nodeValue
                    });
                }
            }
        }
        
        return structure;
    }
    
    getElementType(node) {
        if (!node) return 'unknown';
        
        const tagName = node.nodeName.toLowerCase();
        const className = node.getAttribute && node.getAttribute('class');
        
        // Classify based on tag name and class
        if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
            return 'heading';
        }
        
        if (tagName === 'p' || (className && className.includes('paragraph'))) {
            return 'paragraph';
        }
        
        if (tagName === 'li') {
            return 'list-item';
        }
        
        if (className) {
            if (className.includes('title')) return 'title';
            if (className.includes('author')) return 'author';
            if (className.includes('quote')) return 'quote';
        }
        
        return 'text';
    }
    
    generateXPathId(node, path) {
        // Generate a stable identifier based on position and attributes
        let id = path;
        
        // Add position among siblings
        if (node.parentNode) {
            let position = 1;
            const siblings = node.parentNode.childNodes;
            for (let i = 0; i < siblings.length; i++) {
                if (siblings[i] === node) break;
                if (siblings[i].nodeType === 1 && siblings[i].nodeName === node.nodeName) {
                    position++;
                }
            }
            id += `[${position}]`;
        }
        
        // Add class or other identifying attributes
        const className = node.getAttribute && node.getAttribute('class');
        if (className) {
            id += `[@class='${className}']`;
        }
        
        return id;
    }
    
    async updateXmlWithTranslation(xmlPath, elementId, translatedText) {
        try {
            const xmlContent = await readFile(xmlPath, 'utf-8');
            const doc = new DOMParser().parseFromString(xmlContent, 'text/xml');
            
            // Find the element by ID or XPath
            const element = this.findElementById(doc, elementId);
            
            if (!element) {
                throw new Error(`Element not found: ${elementId}`);
            }
            
            // Update the text content while preserving structure
            this.updateElementText(element, translatedText);
            
            // Serialize back to XML
            const updatedXml = new XMLSerializer().serializeToString(doc);
            
            return updatedXml;
            
        } catch (error) {
            console.error('Error updating XML with translation:', error);
            throw error;
        }
    }
    
    findElementById(doc, elementId) {
        // Try to find by ID attribute first
        const elementWithId = doc.getElementById(elementId);
        if (elementWithId) return elementWithId;
        
        // Fall back to XPath-like search
        return this.findElementByXPath(doc.documentElement, elementId);
    }
    
    findElementByXPath(node, xpath) {
        // Simple XPath-like matching
        // This is a basic implementation - could be enhanced with proper XPath
        
        if (!node || !xpath) return null;
        
        // For now, just return the first match
        // In a full implementation, this would properly parse and execute XPath
        return null;
    }
    
    updateElementText(element, newText) {
        // Update text content while preserving formatting elements
        if (!element) return;
        
        // For simple elements, replace all text
        if (!this.hasFormattingChildren(element)) {
            element.textContent = newText;
            return;
        }
        
        // For complex elements with formatting, this would need more sophisticated logic
        // to map the translation to the original formatting structure
        // For now, we'll do a simple replacement
        const textNodes = this.getTextNodes(element);
        if (textNodes.length > 0) {
            textNodes[0].nodeValue = newText;
            // Clear other text nodes
            for (let i = 1; i < textNodes.length; i++) {
                textNodes[i].nodeValue = '';
            }
        }
    }
    
    hasFormattingChildren(element) {
        if (!element.childNodes) return false;
        
        for (let i = 0; i < element.childNodes.length; i++) {
            const child = element.childNodes[i];
            if (child.nodeType === 1) { // Element node
                const tagName = child.nodeName.toLowerCase();
                if (['span', 'strong', 'em', 'i', 'b', 'a'].includes(tagName)) {
                    return true;
                }
            }
        }
        return false;
    }
    
    getTextNodes(element) {
        const textNodes = [];
        
        function collectTextNodes(node) {
            if (node.nodeType === 3) { // Text node
                textNodes.push(node);
            } else if (node.childNodes) {
                for (let i = 0; i < node.childNodes.length; i++) {
                    collectTextNodes(node.childNodes[i]);
                }
            }
        }
        
        collectTextNodes(element);
        return textNodes;
    }
}