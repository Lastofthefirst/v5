# Description of the task

First I have a set of authoritative english xml documents, each corresponding to a specific publication. 

I have a much larger number of pdfs that represent translations of those xml documents into all kinds of languages. However some of these are incomplete. These are in say 70 languages.

My goal is create copies of the english xml documents that swap out the english text for the corresponding translation from a pdf document. The resulting xml file must have the exact same xml structure.

For each pdf we extract the content to json with a library called marker and then flatten it to an array of the text blocks. 

-  want to automate matching the pdf with the xml document that it corresponds to or flagging it as unmatching.

- We want to automate the flagging of text content that was improperly extracted from the pdf. For example a paragraph has a missing letter. We need to also consider a custom list of terms because the documents will include transliterated arabic and persian.
    - once we have matched the paragraphs that could be a useful means for flagging

- Then we want to automate the process of filling the target xml tags' innertext with the respective translations.

- We could have manual review points in the process but we want to minimize these as much as possible without taking a hit on accuracy.

- We have had success with the first pass of the following approach:

The system iterates through translation chunks while maintaining a pointer to candidate XML elements. It uses either an LLM judge or embedding similarity strategy to find matches between translations and XML paragraphs. The PointerController manages traversal state, tracking consecutive failures and quarantining problematic elements. When matches are found, the XML is updated with translation metadata; unmatched chunks are deferred to a second pass that specifically targets remaining unmatched elements. This two-phase approach first establishes high-confidence matches, then performs targeted gap-filling for remaining content.

However taking a second pass with the same traversal algorithm ends up trying huge numbers of false matches to no fruit.

- When we extract the text content we need to make sure not to extract parents with several children; the worst example would by the html tag, which has all the innertext of all children below it. But we need a robust approach. 

- further to this challenge is that there will be certain paragraphs of the xml that have in them spans which are used to style parts of the paragraph, such as the first word. We need to both extract the full paragraph including the content of the span, then we need to insert the translation back in the same way, so in the case of a span covering the first word, we need to have that same span around the first word of the inserted translation(with its attributes intact).




### Detailed Steps with ID-Based Matching

#### 1. Preprocessing

**PDF Extraction:**
- Use Marker to extract content from PDFs into JSON, then flatten into an array of text blocks.
- Each text block should include its text content, position information, and a unique identifier (e.g., sequential ID).
- Store this information in a structured format for each PDF.
- **Language Identification:** Implement language validation using the `fastText` library to identify the language of extracted PDF content. This provides critical validation that the PDF's content matches its expected language before further processing, ensuring data integrity. `fastText` is recommended for its exceptional speed, accuracy with short or noisy text, and support for 170+ languages.

**XML Parsing:**
- Parse each English XML document using a parser like `lxml` (preferred for its robust XPath support) or `xml.etree.ElementTree`.
- **Targeted Element Extraction:** Implement a robust extraction strategy that focuses on leaf nodes and specific element types (e.g., `<p>`, `<li>`) rather than parent containers. Use XPath expressions like `.//p[text()]` or `.//text()[parent::p]` to avoid extracting large parent elements like the root HTML tag.
- Extract all elements containing translatable text along with their unique identifiers:
  - **Preferred:** If elements have unique ID attributes (e.g., `<p id="para1">`), use these as identifiers.
  - **Fallback:** If no IDs exist, generate stable XPaths that consider element indices.
- **Preserving Inline Formatting:** For elements containing formatting spans (e.g., `<p>This is <span class="first-word">important</span> text.</p>`):
  - Extract both the full plain text content ("This is important text.") for embedding and matching
  - **Preserve the complete XML structure** of the element, including all attributes and child nodes, for accurate reconstruction during translation insertion
- For each element, store:
  - The unique identifier (ID or XPath)
  - The original text content (plain text)
  - The complete XML structure of the element with all children and attributes preserved
  - A reference to the element itself (if keeping the parse tree in memory)
- Maintain the complete XML parse tree structure for later updating.

#### 2. Document Matching

**Generate Document Embeddings:**
- For each XML document, create a document-level embedding by concatenating all text content or using a representative sample.
- Use the multilingual embedding model with the `search_document` prefix.
- For each PDF, generate a document-level embedding from all text blocks concatenated, using the same model and prefix.

**Match PDFs to XMLs:**
- Compute cosine similarity between each PDF embedding and all XML document embeddings.
- Assign each PDF to the XML document with the highest similarity score.
- Set a threshold (e.g., 0.8) to flag PDFs with low scores for manual review.
- This step ensures each PDF is processed against the correct XML document.

#### 3. Paragraph Matching

**Generate Paragraph Embeddings:**
- For each XML document, generate embeddings for each text element using the multilingual model with the `search_document` prefix.
- For each PDF text block, generate embeddings with the `search_query` prefix.
- Use Matryoshka embeddings (truncate to 256 dimensions) to save storage and speed up search.

**Build FAISS Index:**
- For each XML document, create a FAISS index (IndexFlatIP) from its paragraph embeddings.
- Normalize the embeddings for cosine similarity.
- Maintain a mapping between FAISS index positions and XML element identifiers.

**Match Text Blocks to Paragraphs:**
- For each PDF text block, query the FAISS index to find the most similar XML paragraph.
- Record the similarity score and the corresponding XML element identifier.
- Consider the top K matches (e.g., K=3) for ambiguous cases, but use the top match if the score is above a threshold (e.g., 0.7).
- Track matches in a structured format, including:
  - PDF text block ID
  - XML element identifier
  - Similarity score
  - Confidence level

#### 4. Flagging and Validation

**Low Similarity Flags:**
- Flag matches with similarity scores below a threshold (e.g., 0.6) for manual review.
- These might indicate extraction errors or mismatches.

**Custom Terms Check:**
- Load a custom list of terms (e.g., transliterated Arabic/Persian words).
- For each matched text block, check if these terms are present in both the original and translated text.
- Flag mismatches for review even if similarity is high.

**Order Consistency:**
- Check if the order of matches is roughly consistent with the original XML order.
- Large skips or reversals might indicate issues—flag these for review.
- Use the position information from PDF extraction to help validate ordering.

#### 5. Gap Filling

**First Pass:**
- After initial matching, identify unmatched XML elements and unmatched PDF text blocks.

**Second Pass:**
- For unmatched XML elements, generate embeddings and query the FAISS index again with a lower similarity threshold (e.g., 0.4).
- Use context-based matching: for an unmatched XML element, consider the embeddings of adjacent elements.
- Flag all matches from this pass for manual review as they are lower confidence.

#### 6. XML Update

**Update Process:**
- For each confidently matched XML element (from the first pass), use the stored element reference or identifier to locate the element in the XML tree.
- **Structured Text Insertion:** For elements with inline formatting (spans):
  - Preserve the original XML structure and attributes
  - Replace only the text content while maintaining the existing markup structure
  - For spans and other formatting elements, map the translation to preserve the original formatting pattern where possible
- For simple elements, replace the element's text content with the corresponding translated PDF text block.
- For matches from the second pass, after manual review, update the XML similarly.
- Save the updated XML document with the translated content, ensuring the structure remains unchanged.

**Validation:**
- Validate the final XML against its schema to ensure structural integrity.
- Perform spot checks to verify translation quality and accuracy.
- Verify that formatting elements (spans, etc.) are preserved correctly in the translated content.

### Implementation Notes

**Embedding Model:**
- Use `nomic-embed-text-v2-moe` for its multilingual capabilities and efficiency.
- Run it locally with `llama.cpp` server for embeddings.
- Remember to use the required prefixes (`search_document` for XML content, `search_query` for PDF text blocks).

**FAISS and Indexing:**
- Use the Python `faiss` library for indexing and similarity search.
- Maintain a mapping between FAISS index positions and XML element identifiers.
- Consider using IVF or PQ indexes for larger datasets to improve search efficiency.

**State Management:**
- Implement a stateful pipeline that tracks the matching process for each document pair.
- Use a database or structured files to record:
  - Document-level matches
  - Paragraph-level matches with confidence scores
  - Manual review decisions
  - Update status

**Manual Review Interface:**
- Develop a web interface or tool for reviewing flagged matches and unmatched content.
- Display side-by-side comparisons of original and translated text.
- Provide easy options to accept, reject, or reassign matches.
- Specifically include visualization of formatting elements to ensure proper preservation.

**Performance Optimization:**
- Process documents in batches to improve efficiency.
- Use multithreading or multiprocessing for embedding generation and matching.
- Cache embeddings and indexes to avoid recomputation.

### Benefits of This ID-Based Approach

1. **Deterministic Updates:** Using unique identifiers ensures precise targeting of XML elements for text replacement.
2. **Structure Preservation:** The original XML structure remains intact, with only text content changed.
3. **Formatting Maintenance:** Inline formatting and styling elements (spans, etc.) are preserved through the translation process.
4. **Efficient Matching:** FAISS enables fast similarity search, even for large documents.
5. **Scalability:** The workflow can handle many PDFs and XMLs without significant performance issues.
6. **Minimal Manual Review:** Only low-confidence matches and gaps are reviewed, saving time.
7. **Traceability:** The use of identifiers provides clear tracing between source and translated content.

By implementing this ID-based approach, you can achieve accurate and efficient matching of translated content to XML documents while preserving the original structure and minimizing manual effort.

# important details


- The XML reference documents are in subfolders by author in ref_xml directory
- A sample set of input pdfs is in input_pdfs directory
- The nomic model is located at ../nomic-embed-text-v2-moe.f16.gguf
- build a solidjs ui for the pipeline.
- While we are building this out we will want to inspect the status as we go, so we want to be careful not to create long processes without changes in state and the ability to expose more verbose details as needed
- no typescript
- just use pnpm run build to test, not run dev
- we are using pnpm not npm
- You cant run any commands in subdirectories so you need to run them from this folder!
- We will just work on the backend, but make sure it exposes everything the front end needs for later developement!
