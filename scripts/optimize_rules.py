rules_path = r"c:\Users\hsri5\OneDrive\Desktop\AegisGraph-AI-main\frontend\src\pages\Rules.tsx"

with open(rules_path, "r", encoding="utf-8") as f:
    code = f.read()

# Replace hardcoded light-only button styling in Rules.tsx
old_btn_1 = 'className="px-3 py-1.5 text-xs rounded border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer whitespace-nowrap"'
new_btn_1 = 'className="btn btn-secondary" style={{ padding: "4px 12px", fontSize: 12 }}'

old_btn_del = 'className="px-3 py-1.5 text-xs rounded border border-gray-200 bg-white text-red-600 hover:bg-red-50 transition-colors cursor-pointer whitespace-nowrap"'
new_btn_del = 'className="btn btn-destructive" style={{ padding: "4px 12px", fontSize: 12 }}'

old_badge_red = 'className="bg-red-50 text-red-700 border border-red-200 font-medium text-xs px-2.5 py-0.5 rounded-full inline-block"'
new_badge_red = 'className="badge badge-crimson"'

code = code.replace(old_btn_1, new_btn_1)
code = code.replace(old_btn_del, new_btn_del)
code = code.replace(old_badge_red, new_badge_red)

with open(rules_path, "w", encoding="utf-8", newline="\n") as f:
    f.write(code)

print("Rules.tsx buttons updated for theme compatibility")
