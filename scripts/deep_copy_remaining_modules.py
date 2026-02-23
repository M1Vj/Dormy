import os
import shutil

base_dir = "src/app/(app)"

# Modules and the roles that link to them in the sidebar
modules_to_copy = {
    "cleaning": ["student_assistant", "treasurer", "officer", "adviser", "admin"], 
    "events": ["student_assistant", "treasurer", "officer", "adviser", "admin"],
    "payments": ["student_assistant", "treasurer", "officer", "adviser", "admin"]
}

for module, roles in modules_to_copy.items():
    source_dir = os.path.join(base_dir, "occupant", module)
    
    if not os.path.exists(source_dir):
        print(f"Warning: Source {source_dir} not found!")
        continue

    for role in roles:
        target_dir = os.path.join(base_dir, role, module)
        
        if os.path.exists(target_dir):
            if os.path.isdir(target_dir):
                shutil.rmtree(target_dir)
            else:
                os.remove(target_dir)

        shutil.copytree(source_dir, target_dir)
        print(f"Deep copied: {source_dir} -> {target_dir}")

        # Fix internal links for the newly copied directory
        for root_dir, _, files in os.walk(target_dir):
            for file in files:
                if file.endswith(".tsx"):
                    file_path = os.path.join(root_dir, file)
                    with open(file_path, "r") as f:
                        content = f.read()
                    
                    content = content.replace(f'href="/occupant/{module}', f'href="/{role}/{module}')
                    
                    with open(file_path, "w") as f:
                        f.write(content)

print("Remaining modules fully isolated.")
