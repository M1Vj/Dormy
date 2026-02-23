import os

base_dir = "src/app/(app)"
roles_with_finance = ["treasurer", "officer", "student_assistant", "adviser"]

for role in roles_with_finance:
    target_dir = os.path.join(base_dir, role, "finance")
    if not os.path.exists(target_dir):
        continue
    for root, _, files in os.walk(target_dir):
        for file in files:
            if file.endswith(".tsx"):
                file_path = os.path.join(root, file)
                with open(file_path, "r") as f:
                    content = f.read()
                
                content = content.replace('href="/admin/finance', f'href="/{role}/finance')
                
                with open(file_path, "w") as f:
                    f.write(content)

# Admin Committees
admin_committees_dir = os.path.join(base_dir, "admin", "committees")
if os.path.exists(admin_committees_dir):
    for root, _, files in os.walk(admin_committees_dir):
        for file in files:
            if file.endswith(".tsx"):
                file_path = os.path.join(root, file)
                with open(file_path, "r") as f:
                    content = f.read()
                
                content = content.replace('href="/occupant/committees', 'href="/admin/committees')
                
                with open(file_path, "w") as f:
                    f.write(content)

# SA Fines
sa_fines_dir = os.path.join(base_dir, "student_assistant", "fines")
if os.path.exists(sa_fines_dir):
    for root, _, files in os.walk(sa_fines_dir):
        for file in files:
            if file.endswith(".tsx"):
                file_path = os.path.join(root, file)
                with open(file_path, "r") as f:
                    content = f.read()
                
                content = content.replace('href="/admin/fines', 'href="/student_assistant/fines')
                
                with open(file_path, "w") as f:
                    f.write(content)

print("Remaining deep links fixed.")
