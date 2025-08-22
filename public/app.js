/**
 * Translation Pipeline Client Application
 * Vanilla JavaScript (no TypeScript as requested)
 */

class TranslationPipelineApp {
    constructor() {
        this.apiBase = '/api';
        this.refreshInterval = null;
        this.init();
    }
    
    init() {
        this.setupEventListeners();
        this.setupFileUpload();
        this.refreshStatus();
        this.startAutoRefresh();
        this.log('Application initialized');
    }
    
    setupEventListeners() {
        document.getElementById('initXmlBtn').addEventListener('click', () => this.initializeXml());
        document.getElementById('startMatchingBtn').addEventListener('click', () => this.startMatching());
        document.getElementById('refreshBtn').addEventListener('click', () => this.refreshStatus());
    }
    
    setupFileUpload() {
        const uploadArea = document.getElementById('uploadArea');
        const fileInput = document.getElementById('fileInput');
        
        // Click to browse
        uploadArea.addEventListener('click', () => {
            if (!document.getElementById('uploadProgress').classList.contains('hidden')) return;
            fileInput.click();
        });
        
        // File selection
        fileInput.addEventListener('change', (e) => {
            this.uploadFiles(e.target.files);
        });
        
        // Drag and drop
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });
        
        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('dragover');
        });
        
        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            const files = Array.from(e.dataTransfer.files).filter(file => file.type === 'application/pdf');
            this.uploadFiles(files);
        });
    }
    
    async uploadFiles(files) {
        if (!files || files.length === 0) {
            this.showAlert('No PDF files selected', 'error');
            return;
        }
        
        const formData = new FormData();
        Array.from(files).forEach(file => {
            formData.append('pdfs', file);
        });
        
        this.showUploadProgress(0);
        this.log(`Starting upload of ${files.length} files`);
        
        try {
            const response = await fetch(`${this.apiBase}/upload`, {
                method: 'POST',
                body: formData
            });
            
            const result = await response.json();
            
            if (response.ok) {
                this.showUploadResults(result.results);
                this.log(`Upload completed: ${result.results.length} files processed`);
                this.refreshStatus();
            } else {
                throw new Error(result.error || 'Upload failed');
            }
        } catch (error) {
            this.showAlert(`Upload failed: ${error.message}`, 'error');
            this.log(`Upload error: ${error.message}`);
        } finally {
            this.hideUploadProgress();
        }
    }
    
    showUploadProgress(progress) {
        const progressContainer = document.getElementById('uploadProgress');
        const progressFill = document.getElementById('progressFill');
        const uploadStatus = document.getElementById('uploadStatus');
        
        progressContainer.classList.remove('hidden');
        progressFill.style.width = `${progress}%`;
        uploadStatus.textContent = progress === 100 ? 'Processing...' : `Uploading... ${progress}%`;
    }
    
    hideUploadProgress() {
        document.getElementById('uploadProgress').classList.add('hidden');
    }
    
    showUploadResults(results) {
        const container = document.getElementById('uploadResults');
        container.innerHTML = '';
        
        results.forEach(result => {
            const div = document.createElement('div');
            div.className = `alert ${result.status === 'uploaded' ? 'alert-success' : 'alert-error'}`;
            div.textContent = `${result.filename}: ${result.status}`;
            if (result.error) {
                div.textContent += ` - ${result.error}`;
            }
            container.appendChild(div);
        });
        
        // Clear results after 5 seconds
        setTimeout(() => {
            container.innerHTML = '';
        }, 5000);
    }
    
    async initializeXml() {
        this.log('Initializing XML documents...');
        
        try {
            const response = await fetch(`${this.apiBase}/initialize-xml`, {
                method: 'POST'
            });
            
            const result = await response.json();
            
            if (response.ok) {
                this.showAlert(result.message, 'success');
                this.log(`XML initialization: ${result.message}`);
                this.refreshStatus();
            } else {
                throw new Error(result.error || 'XML initialization failed');
            }
        } catch (error) {
            this.showAlert(`XML initialization failed: ${error.message}`, 'error');
            this.log(`XML initialization error: ${error.message}`);
        }
    }
    
    async startMatching() {
        this.log('Starting document matching...');
        
        try {
            const response = await fetch(`${this.apiBase}/start-matching`, {
                method: 'POST'
            });
            
            const result = await response.json();
            
            if (response.ok) {
                this.showAlert(`Document matching started (Job ID: ${result.jobId})`, 'success');
                this.log(`Document matching started with job ID: ${result.jobId}`);
                this.refreshStatus();
            } else {
                throw new Error(result.error || 'Document matching failed to start');
            }
        } catch (error) {
            this.showAlert(`Failed to start matching: ${error.message}`, 'error');
            this.log(`Document matching error: ${error.message}`);
        }
    }
    
    async refreshStatus() {
        try {
            const [statusResponse, documentsResponse] = await Promise.all([
                fetch(`${this.apiBase}/status`),
                fetch(`${this.apiBase}/documents`)
            ]);
            
            if (statusResponse.ok && documentsResponse.ok) {
                const status = await statusResponse.json();
                const documents = await documentsResponse.json();
                
                this.updateStatusDisplay(status);
                this.updateDocumentsTable(documents);
                this.log('Status refreshed');
            } else {
                throw new Error('Failed to fetch status');
            }
        } catch (error) {
            this.log(`Status refresh error: ${error.message}`);
        }
    }
    
    updateStatusDisplay(status) {
        // Update counters
        const counts = {
            pdf: 0,
            xml: 0,
            matches: status.matches?.reduce((sum, m) => sum + m.count, 0) || 0,
            activeJobs: status.jobs?.filter(j => j.status === 'running').length || 0
        };
        
        if (status.documents) {
            status.documents.forEach(doc => {
                if (doc.type === 'pdf') counts.pdf += doc.count;
                if (doc.type === 'xml') counts.xml += doc.count;
            });
        }
        
        document.getElementById('pdfCount').textContent = counts.pdf;
        document.getElementById('xmlCount').textContent = counts.xml;
        document.getElementById('matchCount').textContent = counts.matches;
        document.getElementById('jobCount').textContent = counts.activeJobs;
        
        // Update pipeline status
        const pipelineStatus = document.getElementById('pipelineStatus');
        if (status.jobs && status.jobs.length > 0) {
            const latestJob = status.jobs[0];
            pipelineStatus.innerHTML = `
                <div style="margin-top: 1rem;">
                    <strong>Latest Job:</strong> ${latestJob.job_type}<br>
                    <strong>Status:</strong> <span class="badge badge-${latestJob.status}">${latestJob.status}</span><br>
                    ${latestJob.progress ? `<strong>Progress:</strong> ${latestJob.progress}/${latestJob.total_items || '?'}` : ''}
                </div>
            `;
        } else {
            pipelineStatus.innerHTML = '<div style="margin-top: 1rem;">No active jobs</div>';
        }
    }
    
    updateDocumentsTable(documents) {
        const tbody = document.getElementById('documentsTableBody');
        
        if (!documents || documents.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align: center; color: #7f8c8d;">
                        No documents found
                    </td>
                </tr>
            `;
            return;
        }
        
        tbody.innerHTML = documents.map(doc => `
            <tr>
                <td>${doc.filename}</td>
                <td>${doc.type.toUpperCase()}</td>
                <td><span class="badge badge-${doc.status}">${doc.status}</span></td>
                <td>${doc.language || '-'}</td>
                <td>${doc.author || '-'}</td>
                <td>${doc.processed_at ? new Date(doc.processed_at).toLocaleDateString() : '-'}</td>
            </tr>
        `).join('');
    }
    
    showAlert(message, type) {
        // Create alert element
        const alert = document.createElement('div');
        alert.className = `alert alert-${type}`;
        alert.textContent = message;
        
        // Insert after header
        const header = document.querySelector('header');
        header.insertAdjacentElement('afterend', alert);
        
        // Remove after 5 seconds
        setTimeout(() => {
            alert.remove();
        }, 5000);
    }
    
    log(message) {
        const logArea = document.getElementById('activityLog');
        const timestamp = new Date().toLocaleTimeString();
        logArea.textContent += `[${timestamp}] ${message}\n`;
        logArea.scrollTop = logArea.scrollHeight;
    }
    
    startAutoRefresh() {
        this.refreshInterval = setInterval(() => {
            this.refreshStatus();
        }, 5000); // Refresh every 5 seconds
    }
    
    stopAutoRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.pipelineApp = new TranslationPipelineApp();
});

// Handle page unload
window.addEventListener('beforeunload', () => {
    if (window.pipelineApp) {
        window.pipelineApp.stopAutoRefresh();
    }
});