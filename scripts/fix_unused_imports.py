import os
import re

base_dir = "src/app/(app)"

# List of files to fix based on lint-output-subpages.txt
files_to_fix = [
    "adviser/payments/page.tsx",
    "occupant/payments/page.tsx",
    "officer/payments/page.tsx",
    "student_assistant/payments/page.tsx",
    "treasurer/payments/page.tsx"
]

for relative_path in files_to_fix:
    target_file = os.path.join(base_dir, relative_path)
    if not os.path.exists(target_file):
        continue
        
    with open(target_file, "r") as f:
        content = f.read()

    # Remove `redirect` from next/navigation imports if it exists
    # A simple regex to replace `import { redirect } from "next/navigation";` 
    # or `import { something, redirect, something_else } from "next/navigation";`
    
    # We can just run a quick sed-like replacement lines containing import { redirect }
    lines = content.split('\n')
    new_lines = []
    for line in lines:
        if "from \"next/navigation\"" in line and "redirect" in line:
            # If it's just redirect, remove line
            if line.strip() == "import { redirect } from \"next/navigation\";":
                continue
            # Otherwise just remove redirect from the destructured object
            line = re.sub(r',\s*redirect\b|\bredirect\s*,', '', line)
            line = re.sub(r'{\s*redirect\s*}', '{}', line)
            # if {} is left, remove the line
            if "{}" in line:
                continue
        new_lines.append(line)
        
    with open(target_file, "w") as f:
        f.write('\n'.join(new_lines))
    print(f"Fixed unused redirect import in {target_file}")

