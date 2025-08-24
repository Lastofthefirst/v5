// Test script to verify environment variables are loaded
import 'dotenv/config';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('Environment Variables Test:');
console.log('PORT:', process.env.PORT || 3000);
console.log('DATA_DIR:', process.env.DATA_DIR || 'data');
console.log('UPLOADS_DIR:', process.env.UPLOADS_DIR || 'uploads');
console.log('MARKER_OUTPUT_DIR:', process.env.MARKER_OUTPUT_DIR || 'data/marker_output');

console.log('\nResolved Paths:');
console.log('Data Directory:', join(process.cwd(), process.env.DATA_DIR || 'data'));
console.log('Uploads Directory:', join(process.cwd(), process.env.UPLOADS_DIR || 'uploads'));
console.log('Marker Output Directory:', join(process.cwd(), process.env.MARKER_OUTPUT_DIR || 'data/marker_output'));