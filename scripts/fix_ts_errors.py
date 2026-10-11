# 1. Fix Login.tsx
login_path = r"c:\Users\hsri5\OneDrive\Desktop\AegisGraph-AI-main\frontend\src\pages\Login.tsx"
with open(login_path, "r", encoding="utf-8") as f:
    login_c = f.read()
login_c = login_c.replace("useRef<NodeJS.Timeout | null>(null);", "useRef<ReturnType<typeof setTimeout> | null>(null);")
with open(login_path, "w", encoding="utf-8", newline="\n") as f:
    f.write(login_c)
print("Fixed Login.tsx")

# 2. Fix NotFound.tsx
nf_path = r"c:\Users\hsri5\OneDrive\Desktop\AegisGraph-AI-main\frontend\src\pages\NotFound.tsx"
with open(nf_path, "r", encoding="utf-8") as f:
    nf_c = f.read()
nf_c = nf_c.replace("<ThemeToggle darkMode={Boolean(darkMode)} onToggle={onToggleDark} />", "<ThemeToggle darkMode={Boolean(darkMode)} onToggleDark={onToggleDark} />")
with open(nf_path, "w", encoding="utf-8", newline="\n") as f:
    f.write(nf_c)
print("Fixed NotFound.tsx")

# 3. Fix analytics.ts
ana_path = r"c:\Users\hsri5\OneDrive\Desktop\AegisGraph-AI-main\frontend\src\utils\analytics.ts"
with open(ana_path, "r", encoding="utf-8") as f:
    ana_c = f.read()
ana_c = ana_c.replace("import.meta.env.DEV", "(import.meta as any)?.env?.DEV")
with open(ana_path, "w", encoding="utf-8", newline="\n") as f:
    f.write(ana_c)
print("Fixed analytics.ts")
