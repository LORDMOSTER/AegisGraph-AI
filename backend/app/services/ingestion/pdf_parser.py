import asyncio
import logging
import time
import re
from pathlib import Path
from typing import List, Dict, Any, Tuple
import os
import uuid

import pymupdf as fitz

logger = logging.getLogger(__name__)

class NoDigitalTextError(Exception):
    """Raised when a PDF appears to be a scanned image with no selectable text."""
    pass

def _filter_noise(text: str) -> Tuple[bool, str]:
    """Returns (is_noise, reason)"""
    text = text.strip()
    if len(text) < 20:
        return True, "Too short (< 20 chars)"
        
    # Check if mostly TOC (leader dots/dashes connecting to page numbers)
    toc_leaders = re.findall(r'[\.\-_]{3,}\s*\d+', text)
    if len(toc_leaders) >= 2:
        return True, "Table of Contents leader lines"
        
    # High proportion of standalone numbers compared to total words
    words = text.split()
    if len(words) > 5 and len(re.findall(r'^\d+$', text, re.MULTILINE)) > len(words) * 0.4:
        return True, "Index or numerical column fragment"
        
    # Copyright/legal boilerplate
    lower = text.lower()
    if "all rights reserved" in lower or "registered trademark" in lower:
        return True, "Copyright/legal boilerplate"
        
    # Page number artifact
    if re.match(r'^(page\s+\d+|\d+|\/\d+)$', lower.strip()):
        return True, "Page number artifact"
        
    return False, ""

HEADING_PATTERN = re.compile(r'^\d+(\.\d+)*\s+[A-Z]')

async def extract_blocks_stream(pdf_path: str, queue: asyncio.Queue, image_dir: str):
    start_time = time.perf_counter()
    
    try:
        doc = fitz.open(pdf_path)
    except Exception as e:
        await queue.put({"type": "error", "error": str(e)})
        return
        
    if len(doc) == 0:
        await queue.put({"type": "done", "pages_needing_ocr": []})
        return
        
    # Sample first 5 pages for median body font size
    sizes = []
    for page in doc[:5]:
        for block in page.get_text("dict").get("blocks", []):
            for line in block.get("lines", []):
                for span in line.get("spans", []):
                    sizes.append(span["size"])
    median_size = sorted(sizes)[len(sizes) // 2] if sizes else 10.0

    current_heading = None
    current_body = []
    current_images = []
    pages_needing_ocr = []
    image_cache: Dict[int, str] = {}

    async def emit_current_block(p_num: int):
        nonlocal current_heading, current_body, current_images
        full_text = f"{current_heading or ''}\n{' '.join(current_body).strip()}".strip()
        if full_text:
            is_noise, reason = _filter_noise(full_text)
            await queue.put({
                "type": "block",
                "is_noise": is_noise,
                "reason": reason,
                "text": full_text,
                "page_number": p_num,
                "images": [img["path"] for img in current_images]
            })
        current_body = []
        current_images = []

    for page_num, page in enumerate(doc, start=1):
        page_height = page.rect.height
        crop_top, crop_bottom = page_height * 0.08, page_height * 0.92
        
        # Check if page has text
        page_text = page.get_text()
        if not page_text or not page_text.strip():
            pages_needing_ocr.append(page_num)
            await asyncio.sleep(0)
            await queue.put({"type": "progress", "page": page_num, "total": len(doc)})
            continue
            
        page_dict = page.get_text("dict")
        images_info = page.get_image_info(xrefs=True)
        
        for block in page_dict.get("blocks", []):
            if "lines" not in block:
                continue
                
            block_y0, block_y1 = block["bbox"][1], block["bbox"][3]
            
            for line in block.get("lines", []):
                y_pos = line["bbox"][1]
                if y_pos < crop_top or y_pos > crop_bottom:
                    continue 

                line_text = "".join(span["text"] for span in line.get("spans", [])).strip()
                if not line_text:
                    continue
                avg_size = sum(s["size"] for s in line.get("spans", [])) / max(1, len(line.get("spans", [])))

                is_heading = avg_size > median_size * 1.18 or bool(HEADING_PATTERN.match(line_text))
                
                # If chunk is getting too large (> 1200 chars), emit it to prevent stalling downstream
                body_length = sum(len(t) for t in current_body)
                if is_heading or body_length > 1200:
                    if current_heading or current_body:
                        await emit_current_block(page_num)
                    current_heading = line_text if is_heading else ""
                    if not is_heading:
                        current_body.append(line_text)
                else:
                    current_body.append(line_text)
                    
            if images_info:
                block_rect = fitz.Rect(block["bbox"])
                for img in images_info:
                    img_rect = fitz.Rect(img["bbox"])
                    if abs(img_rect.y0 - block_rect.y1) < 50 or abs(block_rect.y0 - img_rect.y1) < 50 or img_rect.intersects(block_rect):
                        xref = img["xref"]
                        if xref not in [i["xref"] for i in current_images]:
                            if xref in image_cache:
                                img_path = image_cache[xref]
                            else:
                                try:
                                    base_image = doc.extract_image(xref)
                                    image_bytes = base_image["image"]
                                    image_ext = base_image["ext"]
                                    img_filename = f"ref_img_{uuid.uuid4().hex[:8]}.{image_ext}"
                                    img_path = os.path.join(image_dir, img_filename)
                                    with open(img_path, "wb") as f:
                                        f.write(image_bytes)
                                    image_cache[xref] = img_path
                                except Exception:
                                    img_path = None
                            
                            if img_path:
                                current_images.append({
                                    "xref": xref,
                                    "path": img_path
                                })
                                
        await asyncio.sleep(0)
        await queue.put({"type": "progress", "page": page_num, "total": len(doc)})

    if len(doc) > 0 and len(pages_needing_ocr) == len(doc):
        await queue.put({"type": "error", "error": "No selectable text found in any pages. OCR is bypassed."})
        return

    if current_heading or current_body:
        await emit_current_block(len(doc))

    await queue.put({"type": "done", "pages_needing_ocr": pages_needing_ocr})
