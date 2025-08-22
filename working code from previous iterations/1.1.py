#!/usr/bin/env python3
"""
PDF Processing Pipeline: Step 1 - Marker Extraction

This script:
1. Processes all PDFs in a specified input folder using marker_single.
2. Saves the raw marker output, wrapped in a structured JSON object.
3. Records processing time for each PDF.

Usage:
    python 1.1.py --gemini-key YOUR_KEY --input-dir ./input --output-dir ./marker_output
"""

import os
import json
import subprocess
import sys
import argparse
from pathlib import Path
import time
import shutil
from tqdm import tqdm

def run_command(command, cwd=None):
    """Run a shell command and return the result"""
    try:
        # Using a file for stdout and stderr to keep the progress bar clean
        with open('marker.log', 'a') as log_file:
            result = subprocess.run(command, shell=True, stdout=log_file, stderr=log_file, text=True, cwd=cwd)
        if result.returncode != 0:
            # If there's an error, print the log file content
            with open('marker.log', 'r') as log_file:
                print(f"Error running command: {command}\nLog:\n{log_file.read()}")
            return False
        return True
    except Exception as e:
        print(f"Exception running command: {e}")
        return False

def process_pdf_with_marker(pdf_path, output_dir, gemini_api_key):
    """Process a single PDF with marker_single and return the output path"""
    relative_path = pdf_path.relative_to(Path(os.environ.get('INPUT_DIR', 'input')))
    pdf_output_dir = output_dir / relative_path.parent
    pdf_output_dir.mkdir(parents=True, exist_ok=True)
    
    output_json_path = pdf_output_dir / f"{pdf_path.stem}.json"
    
    if output_json_path.exists():
        return True, output_json_path, "skipped"

    cmd = f"marker_single '{pdf_path.resolve()}' --use_llm --gemini_api_key {gemini_api_key} --output_format json --output_dir '{pdf_output_dir.resolve()}'"
    
    success = run_command(cmd)
    
    marker_output_dir = pdf_output_dir / pdf_path.stem
    expected_output_file = marker_output_dir / f"{pdf_path.stem}.json"

    if success and expected_output_file.exists():
        with open(expected_output_file, 'r', encoding='utf-8') as f:
            marker_content = json.load(f)
        
        structured_data = {
            "source_pdf": str(pdf_path.relative_to(Path(os.environ.get('INPUT_DIR', 'input')))),
            "processing_date": time.strftime('%Y-%m-%d %H:%M:%S'),
            "content": marker_content
        }
        
        with open(output_json_path, 'w', encoding='utf-8') as f:
            json.dump(structured_data, f, indent=2, ensure_ascii=False)
            
        shutil.rmtree(marker_output_dir)
        return True, output_json_path, "processed"
    else:
        return False, None, "failed"

def main():
    """Main processing pipeline"""
    parser = argparse.ArgumentParser(description='Process PDFs with marker.')
    parser.add_argument('--gemini-key', type=str, help='Gemini API key')
    parser.add_argument('--input-dir', type=str, help='Input directory containing PDFs')
    parser.add_argument('--input-file', type=str, help='Path to a single PDF file to process')
    parser.add_argument('--output-dir', type=str, default='marker_output', help='Output directory for marker results')
    
    args = parser.parse_args()
    
    gemini_api_key = args.gemini_key or os.environ.get('GEMINI_API_KEY')
    output_dir = Path(args.output_dir or os.environ.get('OUTPUT_DIR', 'marker_output')).resolve()

    if not gemini_api_key:
        print("Error: Gemini API key is required.", file=sys.stderr)
        sys.exit(1)

    pdf_files = []
    if args.input_file:
        input_file = Path(args.input_file).resolve()
        if not input_file.exists():
            print(f"Error: Input file does not exist: {input_file}", file=sys.stderr)
            sys.exit(1)
        pdf_files.append(input_file)
        # Set input_dir to the parent of the file for relative path calculations
        input_dir = input_file.parent
    elif args.input_dir:
        input_dir = Path(args.input_dir).resolve()
        if not input_dir.is_dir():
            print(f"Error: Input directory does not exist: {input_dir}", file=sys.stderr)
            sys.exit(1)
        pdf_files = list(input_dir.rglob("*.pdf"))
    else:
        print("Error: Either --input-dir or --input-file must be provided.", file=sys.stderr)
        sys.exit(1)
    
    os.environ['INPUT_DIR'] = str(input_dir)
    
    output_dir.mkdir(parents=True, exist_ok=True)
    
    if not pdf_files:
        print("No PDF files found to process.")
        sys.exit(0)
    
    print(f"Found {len(pdf_files)} PDF files to process.")
    
    stats = []
    # Clear log file for new run
    if os.path.exists('marker.log'):
        os.remove('marker.log')

    processed_files = 0
    with tqdm(total=len(pdf_files), desc="Processing PDFs with Marker", unit="file") as pbar:
        for pdf_path in pdf_files:
            pbar.set_postfix_str(pdf_path.name)
            start_time = time.time()
            success, output_path, status = process_pdf_with_marker(pdf_path, output_dir, gemini_api_key)
            duration = time.time() - start_time
            
            if status != "skipped":
                processed_files += 1
                pbar.update(1)
            else:
                # If we skip, we need to reduce the total to get an accurate progress bar
                pbar.total = len(pdf_files) - (len(pdf_files) - processed_files)


            if success:
                stats.append({
                    "pdf_path": str(pdf_path.relative_to(input_dir)),
                    "output_path": str(output_path.relative_to(output_dir)),
                    "duration": duration,
                    "status": "success" if status != "skipped" else "skipped"
                })
            else:
                stats.append({
                    "pdf_path": str(pdf_path.relative_to(input_dir)),
                    "output_path": None,
                    "duration": duration,
                    "status": "failure"
                })

    stats_file = output_dir / 'marker_stats.json'
    with open(stats_file, 'w', encoding='utf-8') as f:
        json.dump(stats, f, indent=2, ensure_ascii=False)
        
    print(f"\nProcessing complete! Stats saved to {stats_file}")
    print(f"A detailed log of the marker process is in marker.log")

if __name__ == "__main__":
    main()