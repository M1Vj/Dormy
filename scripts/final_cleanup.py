import os
import shutil

base_dir = "src/app/(app)"

# 1. Delete legacy root `/occupants`
legacy_occupants = os.path.join(base_dir, "occupants")
if os.path.exists(legacy_occupants):
    shutil.rmtree(legacy_occupants)
    print(f"Deleted legacy global root: {legacy_occupants}")

# 2. Hard duplicate admin shallow wrappers from occupant module
admin_wrappers = ["events", "cleaning", "payments"]

for module in admin_wrappers:
    source_dir = os.path.join(base_dir, "occupant", module)
    target_dir = os.path.join(base_dir, "admin", module)
    
    if os.path.exists(target_dir):
        # Remove the file wrapper or directory
        if os.path.isdir(target_dir):
            shutil.rmtree(target_dir)
        else:
            os.remove(target_dir)

    shutil.copytree(source_dir, target_dir)
    print(f"Deep copied: {source_dir} -> {target_dir}")

# 3. Replace internal deep links in newly cloned admin folders
for module in admin_wrappers:
    target_dir = os.path.join(base_dir, "admin", module)
    if not os.path.exists(target_dir):
        continue
    for root_dir, _, files in os.walk(target_dir):
        for file in files:
            if file.endswith(".tsx"):
                file_path = os.path.join(root_dir, file)
                with open(file_path, "r") as f:
                    content = f.read()
                
                content = content.replace(f'href="/occupant/{module}', f'href="/admin/{module}')
                
                with open(file_path, "w") as f:
                    f.write(content)
                print(f"Fixed internal links in: {file_path}")

print("Final isolation cleanup script complete.")
