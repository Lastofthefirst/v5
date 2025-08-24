# How to Run the Translation Pipeline Application

This document explains how to set up and run the Translation Pipeline application, which matches translated PDF documents with their corresponding English XML reference documents.

## Project Overview

The Translation Pipeline application processes PDF translations and matches them with their corresponding English XML documents. It extracts text content from both formats, performs similarity matching, and facilitates the creation of translated XML documents.

## Prerequisites

Before running the application, ensure you have the following installed:

1. **Node.js** (v14 or higher)
2. **pnpm** package manager
3. **Python 3.8+** (for Marker PDF extraction tool)
4. **Git** (for cloning repositories)

## Installation

### 1. Clone and Install Dependencies

```bash
# Navigate to the project directory
cd /path/to/gv5

# Install Node.js dependencies
pnpm install
```

### 2. Install External Tools

#### Marker PDF Extraction Tool

The application uses the Marker tool for PDF text extraction:

```bash
# Clone the Marker repository
git clone https://github.com/VikParuchuri/marker.git
cd marker

# Install Marker dependencies
pip install -e .
```

#### Nomic Embedding Model (Optional but Recommended)

For better matching accuracy, download the Nomic embedding model:

```bash
# Download the model file to the parent directory
wget -O ../nomic-embed-text-v2-moe.f16.gguf https://huggingface.co/nomic-ai/nomic-embed-text-v2-moe/resolve/main/nomic-embed-text-v2-moe.f16.gguf
```

Note: The current implementation uses basic text similarity algorithms. The embedding model integration is planned for future enhancement.

### 3. Environment Variables

The application loads environment variables from a `.env` file. Create a `.env` file by copying the example:

```bash
cp .env.example .env
```

Then edit the `.env` file to set your configuration:

```bash
# Required for PDF processing with Marker
GEMINI_API_KEY=your_gemini_api_key_here

# Optional: Set custom port (defaults to 3000)
PORT=3000

# Optional: Set custom directories
DATA_DIR=./data
UPLOADS_DIR=./uploads
MARKER_OUTPUT_DIR=./data/marker_output
```

## Building the Application

Before running the application, build it to ensure all dependencies are properly set up:

```bash
pnpm run build
```

This command will:
- Create necessary directories (data, uploads, public)
- Check for required dependencies
- Validate project structure
- Initialize the database

## Running the Application

### Start the Server

```bash
# Start the server
pnpm run start

# Or directly with Node.js
node src/server/index.js
```

The server will start on `http://localhost:3000` (or your custom PORT).

### Access the Web Interface

Open your browser and navigate to `http://localhost:3000` to access the web interface.

## Using the Application

### 1. Initialize XML Documents

First, initialize the reference XML documents:

1. Click the "Initialize XML Documents" button in the web interface
2. This will scan the `ref_xml` directory and process all XML files

### 2. Upload PDF Documents

Upload translation PDFs using either method:

1. **Drag & Drop**: Drag PDF files onto the upload area
2. **File Browser**: Click the upload area to open the file browser

Uploaded PDFs will be automatically processed and their text content extracted.

### 3. Start Document Matching

After uploading PDFs and initializing XML documents:

1. Click "Start Document Matching"
2. The system will match PDFs to their corresponding XML documents based on content similarity

### 4. Monitor Progress

The dashboard shows:
- Document counts (PDFs, XMLs, matches)
- Active jobs
- Document processing status
- Activity log

### 5. API Endpoints

The application provides REST API endpoints for programmatic access:

- `GET /api/health` - Health check
- `GET /api/status` - Pipeline status
- `GET /api/documents` - List all documents
- `GET /api/matches` - Get document matches
- `POST /api/upload` - Upload PDF files
- `POST /api/start-matching` - Start document matching
- `POST /api/initialize-xml` - Initialize XML documents

## Directory Structure

- `ref_xml/` - Reference English XML documents organized by author
- `input_pdfs/` - Sample translation PDFs
- `src/server/` - Backend server code
- `public/` - Frontend static files
- `data/` - Application data and database (created on first run)
- `uploads/` - Uploaded PDF files (created on first run)

## Troubleshooting

### Common Issues

1. **Marker not found**: Ensure Marker is installed and accessible in your PATH
2. **PDF processing fails**: Check that GEMINI_API_KEY is set correctly in your `.env` file
3. **Database errors**: Delete the `data/pipeline.json` file to reset the database

### Logs

Check the terminal output for detailed logs during processing. The web interface also shows an activity log.

## Development

To modify the application:

1. Backend code is in `src/server/`
2. Frontend code is in `public/` (HTML, CSS, JavaScript)
3. Build script is in `scripts/build.js`

Use `pnpm run build` to validate changes.

## Future Enhancements

1. Integration with Nomic embedding model for improved matching accuracy
2. Advanced gap-filling algorithms for unmatched content
3. Support for more complex XML formatting preservation
4. Enhanced manual review interface for low-confidence matches

## Support

For issues or questions, check the project documentation or contact the development team.