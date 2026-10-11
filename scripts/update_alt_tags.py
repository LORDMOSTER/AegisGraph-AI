import os

rules_path = r"c:\Users\hsri5\OneDrive\Desktop\AegisGraph-AI-main\frontend\src\pages\Rules.tsx"
with open(rules_path, 'r', encoding='utf-8') as f:
    content = f.read()

target = 'alt="Reference"'
replacement = 'alt={`Safety procedure visual reference ${idx + 1} for ${editingRule.rule_code || "compliance standard"}: ${filename || "diagram"}`}'
if target in content:
    content = content.replace(target, replacement, 1)
    with open(rules_path, 'w', encoding='utf-8', newline='') as f:
        f.write(content)
    print("Rules.tsx updated successfully")
else:
    print("Target not found in Rules.tsx")

# ExamDashboard.tsx
exam_path = r"c:\Users\hsri5\OneDrive\Desktop\AegisGraph-AI-main\frontend\src\pages\ExamDashboard.tsx"
with open(exam_path, 'r', encoding='utf-8') as f:
    exam_content = f.read()

target_exam = 'alt="Profile"'
replacement_exam = 'alt={`${userProfile?.full_name || "Operator"} verified profile photo`}'
if target_exam in exam_content:
    exam_content = exam_content.replace(target_exam, replacement_exam, 1)
    with open(exam_path, 'w', encoding='utf-8', newline='') as f:
        f.write(exam_content)
    print("ExamDashboard.tsx updated successfully")
else:
    print("Target not found in ExamDashboard.tsx")

# Employees.tsx
emp_path = r"c:\Users\hsri5\OneDrive\Desktop\AegisGraph-AI-main\frontend\src\pages\Employees.tsx"
with open(emp_path, 'r', encoding='utf-8') as f:
    emp_content = f.read()

target_emp = 'alt={viewPhotoTarget.name}'
replacement_emp = 'alt={`Personnel photograph and facial verification reference for ${viewPhotoTarget.name}`}'
if target_emp in emp_content:
    emp_content = emp_content.replace(target_emp, replacement_emp, 1)
    with open(emp_path, 'w', encoding='utf-8', newline='') as f:
        f.write(emp_content)
    print("Employees.tsx updated successfully")
else:
    print("Target not found in Employees.tsx")
