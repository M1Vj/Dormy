import os

base_dir = "src/app/(app)"
roles = ["student_assistant", "officer", "treasurer", "adviser", "admin", "occupant"]

# Specifically target the recently copied modules
modules_copied = ["reporting", "profile", "settings", "ai", "occupants", "rooms"]

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
                    
                    # Fix hardcoded paths in the copied global views
                    content = content.replace('href="/reporting', f'href="/{role}/reporting')
                    content = content.replace('href="/profile', f'href="/{role}/profile')
                    content = content.replace('href="/settings', f'href="/{role}/settings')
                    content = content.replace('href="/ai', f'href="/{role}/ai')
                    
                    # Fix admin borrowed pages
                    content = content.replace('href="/admin/occupants', f'href="/{role}/occupants')
                    content = content.replace('href={`/admin/occupants/', f'href={{`/{role}/occupants/')
                    content = content.replace('href="/admin/rooms', f'href="/{role}/rooms')
                    
                    # Ensure redirects use the domain-matched auth routes safely
                    # E.g., if there's navigate/redirects we should be careful but let's stick to Link hrefs
                    
                    with open(file_path, "w") as f:
                        f.write(content)

print("Global deep links fixed.")
