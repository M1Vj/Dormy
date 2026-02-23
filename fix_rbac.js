const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    if (!fs.statSync(dirPath).isDirectory()) {
      callback(dirPath);
    } else {
      walkDir(dirPath, callback);
    }
  });
}

const targetDirs = [
  'src/app/(app)/admin',
  'src/app/(app)/occupant',
  'src/app/(app)/officer',
  'src/app/(app)/student_assistant',
  'src/app/(app)/treasurer',
  'src/app/(app)/adviser',
  'src/app/actions'
];

targetDirs.forEach(dir => {
  if (fs.existsSync(dir)) {
    walkDir(dir, (filePath) => {
      if (!filePath.endsWith('.tsx') && !filePath.endsWith('.ts')) return;
      let content = fs.readFileSync(filePath, 'utf8');
      let originalContent = content;

      // Type 1: Page Routes with `maybeSingle()`
      //   const { data: membership } = await supabase
      //     ... .maybeSingle();
      //   const role = membership?.role ?? null;
      //   if (!role || !new Set(["admin", "treasurer"]).has(role)) {

      content = content.replace(
        /const\s+\{\s*data:\s*membership(.*?)?(\s*?\}\s*=\s*await\s*supabase\s*\.from\("dorm_memberships"\)[\s\S]*?)\.maybeSingle\(\);([\s\S]*?)const\s+role\s*=\s*membership\?.role\s*\?\?\s*null;\s*if\s*\(!role\s*\|\|\s*!new\s*Set\(\[([^\]]+)\]\)\.has\(role\)\)\s*\{/g,
        `const { data: memberships } = await supabase.from("dorm_memberships")$2;
  const roles = memberships?.map((m) => m.role) ?? [];
  const hasAccess = roles.some((r) => new Set([$4]).has(r));
  if (!hasAccess) {`
      );

      // Fix generic `.maybeSingle()` where `const role = membership?.role ?? null;` is checked directly
      content = content.replace(
        /const\s+\{\s*data:\s*membership\s*,?\s*error:\s*membershipError\s*\}\s*=\s*await\s*supabase\s*\.from\("dorm_memberships"\)[\s\S]*?\.maybeSingle\(\);\s*if\s*\(\s*membershipError\s*\|\|\s*!membership\s*\|\|\s*!new\s*Set\(\[([^\]]+)\]\)\.has\(membership\.role\)\s*\)\s*\{/g,
        `const { data: memberships, error: membershipError } = await supabase
    .from("dorm_memberships")$1; // Need to grab the rest
  const roles = memberships?.map((m) => m.role) ?? [];
  const hasAccess = roles.some((r) => new Set([$2]).has(r));
  if (membershipError || !hasAccess) {`
      );

      if (content !== originalContent) {
        fs.writeFileSync(filePath, content);
        console.log("Patched:", filePath);
      }
    });
  }
});
