import asyncio
import logging
import time
import re
from pathlib import Path
from typing import List, Dict, Any, Tuple
import statistics

import pdfplumber
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

class NoDigitalTextError(Exception):
    """Raised when a PDF appears to be a scanned image with no selectable text."""
    pass

class PDFExtractionResult(BaseModel):
    """Pydantic model representing the result of a PDF extraction."""
    chunks: List[Dict[str, Any]] = Field(default_factory=list, description="List of extracted text chunks with page numbers")
    filtered_blocks: List[Dict[str, Any]] = Field(default_factory=list, description="Blocks filtered out as noise")
    chunk_count: int = Field(default=0, description="Total number of chunks extracted")
    extraction_time_ms: float = Field(default=0.0, description="Time taken to extract text in milliseconds")
    file_path: str = Field(..., description="Path to the extracted PDF file")


def _is_heading(text: str, size: float, median_size: float) -> bool:
    if size > median_size * 1.15:
        return True
    
    # Check for numbered headings like "3.1 Safety" or "1. Introduction"
    heading_pattern = r'^\d+(\.\d+)*\s+[A-Z]'
    if re.match(heading_pattern, text.strip()):
        return True
        
    return False

def _filter_noise(text: str) -> Tuple[bool, str]:
    """Returns (is_noise, reason)"""
    text = text.strip()
    if len(text) < 20:
        return True, "Too short (< 20 chars)"
        
    # Check if mostly TOC (lots of numbers, dots, and slashes)
    toc_pattern = r'(\.{3,}|\b\d+\s*$|\/\d+\s*$)'
    matches = re.findall(toc_pattern, text)
    if len(matches) >= 2 or len(re.findall(r'\b\d+\b', text)) > len(text.split()) * 0.3:
        return True, "Looks like Table of Contents or index fragment"
        
    # Copyright/legal boilerplate
    lower = text.lower()
    if "copyright" in lower or "all rights reserved" in lower or "registered trademark" in lower:
        return True, "Copyright/legal boilerplate"
        
    # Page number artifact
    if re.match(r'^page\s+\d+$', lower) or re.match(r'^\d+$', lower) or re.match(r'^/\d+$', lower):
        return True, "Page number artifact"
        
    return False, ""


def _extract_text_sync(file_path: str) -> PDFExtractionResult:
    start_time = time.perf_counter()
    path = Path(file_path)
    
    if not path.exists():
        raise FileNotFoundError(f"PDF file not found: {file_path}")

    chunks = []
    filtered_blocks = []
    
    with pdfplumber.open(file_path) as pdf:
        if not pdf.pages:
            return PDFExtractionResult(file_path=file_path)

        first_page_text = pdf.pages[0].extract_text()
        if not first_page_text or not first_page_text.strip():
            raise NoDigitalTextError(
                f"No selectable text found on page 1 of {path.name}. "
                f"OCR is currently bypassed; please provide a digital text PDF."
            )

        # Pass 1: Get median font size
        sizes = []
        for page in pdf.pages[:5]: # sample first 5 pages for speed
            for char in page.chars:
                if 'size' in char:
                    sizes.append(char['size'])
        
        median_size = statistics.median(sizes) if sizes else 10.0
        
        # Pass 2: Extract text and group by structural segmentation
        current_heading = ""
        current_block = ""
        current_page = 1
        
        def push_block():
            nonlocal current_block, current_heading, chunks, filtered_blocks, current_page
            full_text = ""
            if current_heading:
                full_text += current_heading + "\n"
            full_text += current_block
            full_text = full_text.strip()
            
            if full_text:
                is_noise, reason = _filter_noise(full_text)
                if is_noise:
                    filtered_blocks.append({
                        "text": full_text,
                        "page_number": current_page,
                        "reason": reason
                    })
                else:
                    chunks.append({
                        "text": full_text,
                        "page_number": current_page
                    })
            current_block = ""
            current_heading = ""

        for page in pdf.pages:
            crop_bbox = (0, page.height * 0.1, page.width, page.height * 0.9)
            try:
                cropped_page = page.within_bbox(crop_bbox)
                
                # Extract dictionary data to get size of lines
                words = cropped_page.extract_words(extra_attrs=["size"])
                
                # Group words into lines
                lines = []
                current_line = []
                last_bottom = 0
                
                for word in words:
                    # simplistic line grouping
                    if current_line and abs(word['bottom'] - last_bottom) > 5:
                        lines.append(current_line)
                        current_line = []
                    current_line.append(word)
                    last_bottom = word['bottom']
                if current_line:
                    lines.append(current_line)
                    
                for line in lines:
                    line_text = " ".join(w['text'] for w in line)
                    line_size = statistics.mean(w['size'] for w in line) if line else median_size
                    
                    if _is_heading(line_text, line_size, median_size):
                        # Commit previous block
                        push_block()
                        current_heading = line_text
                        current_page = page.page_number
                    else:
                        current_block += line_text + "\n"
                        
                # Commit at page end if needed, or keep accumulating across pages
                # For structural logic, we can just keep accumulating until next heading
                
            except ValueError as e:
                logger.warning(f"Failed to crop page {page.page_number}: {e}")
                
        # Push final block
        push_block()

    extraction_time_ms = (time.perf_counter() - start_time) * 1000
    
    return PDFExtractionResult(
        chunks=chunks,
        filtered_blocks=filtered_blocks,
        chunk_count=len(chunks),
        extraction_time_ms=extraction_time_ms,
        file_path=file_path
    )

async def extract_text_from_pdf(file_path: str) -> PDFExtractionResult:
    return await asyncio.to_thread(_extract_text_sync, file_path)
