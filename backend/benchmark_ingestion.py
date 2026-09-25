import asyncio
import time
import os
import argparse
import sys

# Ensure we can import from app
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from app.services.ingestion.pdf_parser import extract_blocks_stream

async def run_benchmark(pdf_path: str):
    print(f"Starting benchmark for {pdf_path}...")
    start_time = time.perf_counter()
    
    queue = asyncio.Queue()
    image_dir = os.path.join(os.getcwd(), "benchmark_images")
    os.makedirs(image_dir, exist_ok=True)
    
    producer_task = asyncio.create_task(extract_blocks_stream(pdf_path, queue, image_dir))
    
    blocks = 0
    pages = 0
    
    while True:
        item = await queue.get()
        if item["type"] == "progress":
            pages = item["page"]
            if pages % 10 == 0:
                print(f"Parsed page {pages}/{item['total']}")
        elif item["type"] == "error":
            print(f"Error: {item['error']}")
            break
        elif item["type"] == "done":
            print("Finished parsing.")
            break
        elif item["type"] == "block":
            blocks += 1
            
    end_time = time.perf_counter()
    print(f"\n--- Benchmark Results ---")
    print(f"Total time: {end_time - start_time:.2f} seconds")
    print(f"Pages processed: {pages}")
    print(f"Structural blocks found: {blocks}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf", help="Path to PDF file")
    args = parser.parse_args()
    asyncio.run(run_benchmark(args.pdf))
