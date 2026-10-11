# Update index.css compat tokens
css_path = r"c:\Users\hsri5\OneDrive\Desktop\AegisGraph-AI-main\frontend\src\index.css"
with open(css_path, "r", encoding="utf-8") as f:
    css = f.read()

if "--error:" not in css:
    css = css.replace("--crimson: #dc2626;", "--crimson: #dc2626;\n  --error:   #dc2626;")
    css = css.replace("--crimson: #ef4444;", "--crimson: #ef4444;\n  --error:   #ef4444;")
    with open(css_path, "w", encoding="utf-8", newline="\n") as f:
        f.write(css)
    print("index.css updated with --error compat alias")

# Update Certificates.tsx
cert_path = r"c:\Users\hsri5\OneDrive\Desktop\AegisGraph-AI-main\frontend\src\pages\Certificates.tsx"
with open(cert_path, "r", encoding="utf-8") as f:
    certs = f.read()

certs = certs.replace('<div className="badge" style={{ backgroundColor: "rgba(255, 60, 60, 0.1)", color: "var(--error)" }}>\n                      EXPIRED\n                    </div>', '<div className="badge badge-crimson">EXPIRED</div>')
certs = certs.replace('color: "var(--error)"', 'color: "var(--red)"')

with open(cert_path, "w", encoding="utf-8", newline="\n") as f:
    f.write(certs)

print("Certificates.tsx updated with valid semantic tokens")
