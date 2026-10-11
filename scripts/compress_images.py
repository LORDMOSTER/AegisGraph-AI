import os
from PIL import Image

public_dir = r"c:\Users\hsri5\OneDrive\Desktop\AegisGraph-AI-main\frontend\public"

images_to_compress = [
    ("bg-dark.png", "bg-dark.webp", 82),
    ("bg-light.png", "bg-light.webp", 82),
    ("logo.png", "logo.webp", 85),
    ("logo-new.png", "logo-new.webp", 85),
]

for src_name, out_name, quality in images_to_compress:
    src_path = os.path.join(public_dir, src_name)
    out_path = os.path.join(public_dir, out_name)
    if os.path.exists(src_path):
        img = Image.open(src_path)
        img.save(out_path, "WEBP", quality=quality, method=6)
        src_size = os.path.getsize(src_path)
        out_size = os.path.getsize(out_path)
        reduction = (1 - (out_size / src_size)) * 100
        print(f"Compressed {src_name} ({src_size/1024:.1f} KB) -> {out_name} ({out_size/1024:.1f} KB) [{reduction:.1f}% reduction]")

# Also create optimized pngs in-place with Pillow optimize=True
for png_name in ["bg-dark.png", "bg-light.png"]:
    p = os.path.join(public_dir, png_name)
    if os.path.exists(p):
        img = Image.open(p)
        orig_size = os.path.getsize(p)
        # Save optimized backup
        img.save(p, "PNG", optimize=True)
        new_size = os.path.getsize(p)
        print(f"Re-saved {png_name}: {orig_size/1024:.1f} KB -> {new_size/1024:.1f} KB")
