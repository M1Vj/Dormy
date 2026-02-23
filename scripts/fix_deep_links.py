import os

base_dir = "src/app/(app)"
roles = ["student_assistant", "officer", "treasurer", "adviser"]

modules_copied = ["cleaning", "evaluation", "events", "payments", "fines", "finance/maintenance", "finance/events", "finance/expenses"]

for role in roles:
    for module in modules_copied:
        target_dir = os.path.join(base_dir, role, module)
        if not os.path.exists(target_dir):
            continue
            
        for root, _, files in os.walk(target_dir):
            for file in files:
                if file.endswith(".tsx"):
                    file_path = os.path.join(root, file)
                    
                    with open(file_path, "r") as f:
                        content = f.read()
                    
                    # Fix hardcoded paths in the copied occupant views
                    content = content.replace('href="/occupant/', f'href="/{role}/')
                    content = content.replace('href={`/occupant/', f'href={{`/{role}/')
                    
                    # Fix hardcoded paths in the copied admin views (e.g., admin/finance/maintenance -> adviser/finance/maintenance)
                    content = content.replace('href="/admin/', f'href="/{role}/')
                    content = content.replace('href={`/admin/', f'href={{`/{role}/')
                    
                    # Edge case: occupant/evaluation/page.tsx has `href={`/evaluation/${occupant.id}/rate`}`
                    # which is totally relative and broken originally! It should be `href={`/occupant/evaluation/${occupant.id}/rate`}`
                    # so we fix it here to point to the current role
                    content = content.replace('href={`/evaluation/', f'href={{`/{role}/evaluation/')
                    
                    # Another edge case: admin/occupants linking in admin finance
                    content = content.replace(f'href="/{role}/occupants', 'href="/admin/occupants') # keep admin occupants as admin
                    
                    with open(file_path, "w") as f:
                        f.write(content)

print("Deep links fixed.")
