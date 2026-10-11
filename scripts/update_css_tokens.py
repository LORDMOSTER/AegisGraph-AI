css_path = r"c:\Users\hsri5\OneDrive\Desktop\AegisGraph-AI-main\frontend\src\index.css"

with open(css_path, "r", encoding="utf-8") as f:
    css = f.read()

# 1. Update light mode tokens
css = css.replace("--muted:   #71716C;", "--muted:   #52524E;")
css = css.replace("--text-tertiary:  #A8A8A2;", "--text-tertiary:  #5C5C57;")

# 2. Update dark mode tokens
css = css.replace("--muted:   #7878a0;", "--muted:   #9CA3AF;")
css = css.replace("--text-tertiary:  #50507a;", "--text-tertiary:  #8B949E;")

# 3. Update background images to webp
old_auth_bg = """[data-theme="dark"] .auth-split-container {
  background-image: url('/bg-dark.png');
}
.auth-split-container {
  background-image: url('/bg-light.png');
}
[data-theme="dark"] .auth-split-container {
  background-image: url('/bg-dark.png');
}"""

new_auth_bg = """[data-theme="dark"] .auth-split-container {
  background-image: url('/bg-dark.webp');
}
.auth-split-container {
  background-image: url('/bg-light.webp');
}"""

if old_auth_bg in css:
    css = css.replace(old_auth_bg, new_auth_bg)
    print("Replaced auth background images with WebP")
else:
    # Try replacing line by line if CRLF difference
    css = css.replace("url('/bg-dark.png')", "url('/bg-dark.webp')")
    css = css.replace("url('/bg-light.png')", "url('/bg-light.webp')")
    print("Replaced auth background URLs directly")

with open(css_path, "w", encoding="utf-8", newline="") as f:
    f.write(css)

print("index.css updated successfully")
