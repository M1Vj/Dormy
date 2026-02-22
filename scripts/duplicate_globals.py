import os
import shutil

base_dir = "src/app/(app)"
all_roles = ["admin", "student_assistant", "officer", "treasurer", "adviser", "occupant"]

# Define source folders and which roles they go to
sources = {
    "reporting": all_roles,
    "profile": all_roles,
    "settings": all_roles,
    "ai": ["admin", "student_assistant", "officer", "treasurer", "adviser"], # Exclude occupant
    "admin/occupants": ["student_assistant", "adviser"], # Already in admin, just copying
    "admin/rooms": ["student_assistant", "adviser"]
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

# Remove original top-level shared directories
for source in ["reporting", "profile", "settings", "ai"]:
    source_dir = os.path.join(base_dir, source)
    if os.path.exists(source_dir):
        shutil.rmtree(source_dir)
        print(f"Removed original global root: {source_dir}")

print("Global pages isolation complete.")
