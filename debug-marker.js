import { spawn } from 'child_process';
import { existsSync } from 'fs';

console.log('Debugging Marker Installation and Environment');

// Check if marker_single command exists
const command = 'marker_single';
const args = ['--help'];

console.log('Testing if marker_single command is available...');

const process = spawn(command, args, {
    stdio: ['pipe', 'pipe', 'pipe']
});

let stdout = '';
let stderr = '';

process.stdout.on('data', (data) => {
    stdout += data.toString();
});

process.stderr.on('data', (data) => {
    stderr += data.toString();
});

process.on('close', (code) => {
    console.log('Marker command test result:');
    console.log('Exit code:', code);
    console.log('Stdout:', stdout);
    console.log('Stderr:', stderr);
    
    if (code === 0) {
        console.log('✓ Marker is installed and accessible');
    } else {
        console.log('✗ Marker is not installed or not accessible');
        console.log('Please install Marker by running:');
        console.log('git clone https://github.com/VikParuchuri/marker.git');
        console.log('cd marker');
        console.log('pip install -e .');
    }
});

process.on('error', (error) => {
    console.log('Failed to start marker process:', error.message);
    console.log('This usually means Marker is not installed or not in PATH');
});