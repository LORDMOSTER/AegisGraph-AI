import os
import math
from PIL import Image, ImageDraw, ImageFont

def create_social_preview():
    width = 1200
    height = 630
    
    # 1. Base Dark Canvas
    img = Image.new("RGBA", (width, height), (11, 15, 23, 255))
    draw = ImageDraw.Draw(img)
    
    # 2. Subtle Radial Background Glow (Emerald / Lime accent in top-right & bottom-left)
    for r in range(400, 0, -8):
        alpha = int(35 * (1 - r / 400))
        # Top right glow
        draw.ellipse([900 - r, 120 - r, 900 + r, 120 + r], fill=(22, 163, 74, alpha))
        # Bottom center glow
        draw.ellipse([300 - r, 550 - r, 300 + r, 550 + r], fill=(180, 255, 57, int(alpha * 0.4)))
        
    # 3. Geometric Tech Grid Lines
    grid_color = (255, 255, 255, 8)
    for x in range(0, width, 40):
        draw.line([(x, 0), (x, height)], fill=grid_color, width=1)
    for y in range(0, height, 40):
        draw.line([(0, y), (width, y)], fill=grid_color, width=1)
        
    # 4. Network Graph Nodes & Connections (representing GraphRAG)
    nodes = [
        (850, 160), (980, 200), (1060, 140), (920, 290),
        (1040, 280), (1120, 230), (870, 390), (990, 380),
        (1080, 420), (950, 480)
    ]
    
    # Draw connections
    for i, (x1, y1) in enumerate(nodes):
        for j, (x2, y2) in enumerate(nodes):
            if i < j:
                dist = math.hypot(x2 - x1, y2 - y1)
                if dist < 170:
                    alpha = int(70 * (1 - dist / 170))
                    draw.line([(x1, y1), (x2, y2)], fill=(180, 255, 57, alpha), width=1)
                    
    # Draw node circles
    for x, y in nodes:
        draw.ellipse([x - 5, y - 5, x + 5, y + 5], fill=(180, 255, 57, 180), outline=(22, 163, 74, 255), width=2)
        draw.ellipse([x - 2, y - 2, x + 2, y + 2], fill=(255, 255, 255, 240))
        
    # 5. AegisGraph Shield Brand Mark Icon (Left-side icon container)
    icon_x, icon_y = 100, 110
    icon_size = 96
    
    # Rounded badge container
    draw.rounded_rectangle(
        [icon_x, icon_y, icon_x + icon_size, icon_y + icon_size],
        radius=24,
        fill=(18, 25, 38, 255),
        outline=(22, 163, 74, 180),
        width=2
    )
    
    # Draw shield / A-graph geometry inside badge
    cx, cy = icon_x + icon_size // 2, icon_y + icon_size // 2
    pts = [
        (cx, cy - 28),
        (cx + 26, cy - 14),
        (cx + 26, cy + 12),
        (cx, cy + 28),
        (cx - 26, cy + 12),
        (cx - 26, cy - 14)
    ]
    draw.polygon(pts, outline=(180, 255, 57, 255), width=3)
    draw.line([(cx, cy - 28), (cx, cy + 28)], fill=(22, 163, 74, 220), width=2)
    draw.line([(cx - 26, cy + 2), (cx + 26, cy + 2)], fill=(22, 163, 74, 220), width=2)
    draw.ellipse([cx - 4, cy - 4, cx + 4, cy + 4], fill=(255, 255, 255, 255))
    
    # 6. Typography & Text Content
    # Load fonts or use default
    font_bold = None
    font_sub = None
    font_tag = None
    
    font_paths = [
        "C:/Windows/Fonts/segoeuib.ttf",
        "C:/Windows/Fonts/arialbd.ttf",
        "C:/Windows/Fonts/calibrib.ttf"
    ]
    for p in font_paths:
        if os.path.exists(p):
            font_title = ImageFont.truetype(p, 56)
            font_tag = ImageFont.truetype(p, 16)
            break
            
    reg_paths = [
        "C:/Windows/Fonts/segoeui.ttf",
        "C:/Windows/Fonts/arial.ttf",
        "C:/Windows/Fonts/calibri.ttf"
    ]
    for p in reg_paths:
        if os.path.exists(p):
            font_sub = ImageFont.truetype(p, 24)
            font_badge = ImageFont.truetype(p, 14)
            break

    # Tag / Category pill
    tag_x, tag_y = 220, 125
    draw.rounded_rectangle([tag_x, tag_y, tag_x + 230, tag_y + 32], radius=16, fill=(22, 163, 74, 40), outline=(22, 163, 74, 180), width=1)
    draw.text((tag_x + 16, tag_y + 6), "OFFLINE GRAPHRAG ENGINE", fill=(180, 255, 57, 255), font=font_tag)

    # Main Title
    draw.text((100, 240), "AegisGraph AI", fill=(255, 255, 255, 255), font=font_title)
    
    # Subtitle
    sub_text = "Mission-Critical Industrial Safety Assessment & Certification Platform"
    draw.text((100, 315), sub_text, fill=(203, 213, 225, 255), font=font_sub)
    
    sub_desc = "DCWGT v2 Graph Traversal · Dual-Factor Proctoring · Air-Gapped Edge Inference"
    draw.text((100, 355), sub_desc, fill=(148, 163, 184, 255), font=font_sub)

    # 7. Feature Badges at Bottom
    badges = [
        "100% Offline Architecture",
        "Biometric Face Verification",
        "Tamper-Evident Anomaly Clips",
        "Cryptographic QR Validation"
    ]
    
    bx = 100
    by = 480
    for badge in badges:
        bw = len(badge) * 9 + 32
        draw.rounded_rectangle([bx, by, bx + bw, by + 40], radius=10, fill=(18, 25, 38, 240), outline=(51, 65, 85, 200), width=1)
        draw.ellipse([bx + 14, by + 16, bx + 22, by + 24], fill=(22, 163, 74, 255))
        draw.text((bx + 30, by + 11), badge, fill=(241, 245, 249, 255), font=font_badge)
        bx += bw + 16

    # 8. Footer watermark
    draw.text((100, 560), "Tata Technologies · Safety Engineering", fill=(100, 116, 139, 255), font=font_badge)
    draw.text((1050, 560), "v2.0 Enterprise", fill=(100, 116, 139, 255), font=font_badge)

    # Save social preview
    out_dir = os.path.join(os.getcwd(), "frontend", "public")
    os.makedirs(out_dir, exist_ok=True)
    
    out_png = os.path.join(out_dir, "og-image.png")
    img.save(out_png, "PNG", optimize=True)
    
    out_preview = os.path.join(out_dir, "social-preview.png")
    img.save(out_preview, "PNG", optimize=True)
    print(f"Generated social preview: {out_png} ({os.path.getsize(out_png)} bytes)")

def create_favicons():
    out_dir = os.path.join(os.getcwd(), "frontend", "public")
    
    # 1. 180x180 Apple Touch Icon
    touch_size = 180
    touch_img = Image.new("RGBA", (touch_size, touch_size), (11, 15, 23, 255))
    draw = ImageDraw.Draw(touch_img)
    
    # Rounded badge container
    pad = 16
    draw.rounded_rectangle([pad, pad, touch_size - pad, touch_size - pad], radius=36, fill=(18, 25, 38, 255), outline=(22, 163, 74, 255), width=4)
    
    cx, cy = touch_size // 2, touch_size // 2
    pts = [
        (cx, cy - 44),
        (cx + 42, cy - 20),
        (cx + 42, cy + 20),
        (cx, cy + 44),
        (cx - 42, cy + 20),
        (cx - 42, cy - 20)
    ]
    draw.polygon(pts, outline=(180, 255, 57, 255), width=5)
    draw.line([(cx, cy - 44), (cx, cy + 44)], fill=(22, 163, 74, 255), width=3)
    draw.line([(cx - 42, cy + 4), (cx + 42, cy + 4)], fill=(22, 163, 74, 255), width=3)
    draw.ellipse([cx - 7, cy - 7, cx + 7, cy + 7], fill=(255, 255, 255, 255))
    
    touch_path = os.path.join(out_dir, "apple-touch-icon.png")
    touch_img.save(touch_path, "PNG", optimize=True)
    print(f"Generated apple-touch-icon: {touch_path}")
    
    # 2. Multi-size favicon.ico (16, 32, 48)
    ico_img = touch_img.copy()
    ico_path = os.path.join(out_dir, "favicon.ico")
    ico_img.save(ico_path, format="ICO", sizes=[(16, 16), (32, 32), (48, 48)])
    print(f"Generated favicon.ico: {ico_path}")

if __name__ == "__main__":
    create_social_preview()
    create_favicons()
