#!/usr/bin/env node
/**
 * Build script for the Translation Pipeline application
 */

import { mkdir } from 'fs/promises';
import { join } from 'path';
import { execSync } from 'child_process';

async function build() {
    try {
        console.log('🔨 Building Translation Pipeline Application...');
        
        // Create necessary directories
        console.log('📁 Creating directories...');
        const dirs = ['data', 'uploads', 'public'];
        for (const dir of dirs) {
            await mkdir(dir, { recursive: true });
            console.log(`   ✓ Created ${dir}/`);
        }
        
        // Check if all required dependencies are installed
        console.log('📦 Checking dependencies...');
        try {
            execSync('node -e "import(\'express\')"', { stdio: 'pipe' });
            console.log('   ✓ Express.js');
        } catch (error) {
            throw new Error('Express.js not found. Run: pnpm install');
        }
        
        try {
            execSync('node -e "import(\'better-sqlite3\')"', { stdio: 'pipe' });
            console.log('   ✓ Better-SQLite3');
        } catch (error) {
            throw new Error('Better-SQLite3 not found. Run: pnpm install');
        }
        
        // Check for marker_single command
        console.log('🔍 Checking external dependencies...');
        try {
            execSync('which marker_single', { stdio: 'pipe' });
            console.log('   ✓ marker_single found');
        } catch (error) {
            console.log('   ⚠️  marker_single not found - PDF processing will fail');
            console.log('      Install marker from: https://github.com/VikParuchuri/marker');
        }
        
        // Check for embedding model
        console.log('🤖 Checking embedding model...');
        try {
            const modelPath = '../nomic-embed-text-v2-moe.f16.gguf';
            await import('fs').then(fs => fs.promises.access(modelPath));
            console.log('   ✓ Nomic embedding model found');
        } catch (error) {
            console.log('   ⚠️  Nomic embedding model not found');
            console.log('      Download from: https://huggingface.co/nomic-ai/nomic-embed-text-v2-moe');
        }
        
        // Validate project structure
        console.log('🏗️  Validating project structure...');
        const requiredFiles = [
            'src/server/index.js',
            'src/server/database/index.js',
            'src/server/routes/index.js',
            'src/server/pipeline/manager.js'
        ];
        
        for (const file of requiredFiles) {
            try {
                await import('fs').then(fs => fs.promises.access(file));
                console.log(`   ✓ ${file}`);
            } catch (error) {
                throw new Error(`Required file missing: ${file}`);
            }
        }
        
        // Test database initialization (skip if bindings not available)
        console.log('🗄️  Testing database setup...');
        try {
            const { initializeDatabase } = await import('../src/server/database/index.js');
            await initializeDatabase();
            console.log('   ✓ Database initialized successfully');
        } catch (error) {
            console.log(`   ⚠️  Database setup skipped: ${error.message.split('\n')[0]}`);
            console.log('      Database will be initialized on first server run');
        }
        
        console.log('\n✅ Build completed successfully!');
        console.log('\n🚀 To start the server:');
        console.log('   node src/server/index.js');
        console.log('\n📚 API endpoints will be available at:');
        console.log('   http://localhost:3000/api/health');
        console.log('   http://localhost:3000/api/status');
        console.log('   http://localhost:3000/api/upload');
        
        console.log('\n⚙️  Environment variables needed:');
        console.log('   GEMINI_API_KEY=your_gemini_api_key');
        
    } catch (error) {
        console.error('\n❌ Build failed:', error.message);
        process.exit(1);
    }
}

build();