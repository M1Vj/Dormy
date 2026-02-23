import os
import shutil

base_dir = "src/app/(app)"
roles = ["student_assistant", "officer", "treasurer", "adviser"]

# Define source folders and which roles they go to
sources = {
    # Occupant sources
    "occupant/cleaning": roles,
    "occupant/evaluation": roles,
    "occupant/events": roles,
    "occupant/payments": roles,
    
    # Admin sources
    "admin/fines": ["student_assistant"],
    "admin/finance/maintenance": ["student_assistant", "adviser"],
    "admin/finance/events": ["treasurer"],
    "admin/finance/expenses": ["officer"]
}

# 1. Clean up old shallow wrappers
def cleanup_shallow_wrappers():
    for source, target_roles in sources.items():
        module_path = source.split("/")[-1] # cleaning, evaluation, events, payments, fines, maintenance, expenses
        if "finance" in source:
             module_path = source.split("admin/")[-1] # finance/maintenance etc

        for role in target_roles:
            target_dir = os.path.join(base_dir, role, module_path)
            if os.path.exists(target_dir):
                # We expect these to only contain page.tsx or be empty now if we are removing aliases
                page_file = os.path.join(target_dir, "page.tsx")
                if os.path.exists(page_file):
                    with open(page_file, "r") as f:
                        if "export default" in f.read() and "Page from" in f.read():
                            os.remove(page_file)
                            print(f"Removed shallow alias: {page_file}")

cleanup_shallow_wrappers()

# 2. Deep copy directories
for source, target_roles in sources.items():
    source_dir = os.path.join(base_dir, source)
    if not os.path.exists(source_dir):
        print(f"Warning: Source {source_dir} not found!")
        continue

    module_name = source.split("/")[-1]
    if "finance" in source:
        module_name = source.split("admin/")[-1] 
    
    for role in target_roles:
        target_dir = os.path.join(base_dir, role, module_name)
        
        # Remove target if it exists to ensure clean copy
        if os.path.exists(target_dir):
            shutil.rmtree(target_dir)
            
        shutil.copytree(source_dir, target_dir)
        print(f"Deep copied: {source_dir} -> {target_dir}")

print("Deep copy complete.")
