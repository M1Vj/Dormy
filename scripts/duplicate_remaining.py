import os
import shutil

base_dir = "src/app/(app)"

# Define source folders and which roles they go to
# committees is currently shared with admin.
# fines/admin is shared with student_assistant
# finance/admin is shared with treasurer, officer, student_assistant, adviser as base links or sub-links
sources = {
    "occupant/committees": ["admin"], # Currently occupants use it and admins borrow from occupant
    "admin/fines": ["student_assistant"], # Currently SA borrows from admin/fines
    "admin/finance": ["treasurer", "officer", "student_assistant", "adviser"], # Finance base and sub-pages borrowed in navs
}

for source, target_roles in sources.items():
    source_dir = os.path.join(base_dir, source)
    if not os.path.exists(source_dir):
        print(f"Warning: Source {source_dir} not found!")
        continue

    module_name = source.split("/")[-1]
    
    for role in target_roles:
        # Don't try to copy a directory into itself
        if source.startswith(role + "/"):
            continue
            
        target_dir = os.path.join(base_dir, role, module_name)
        
        # Remove empty target or duplicate if it exists safely
        if os.path.exists(target_dir):
            shutil.rmtree(target_dir)
            
        shutil.copytree(source_dir, target_dir)
        print(f"Deep copied: {source_dir} -> {target_dir}")

print("Remaining shared directories isolation complete.")
