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
  'src/app/actions',
  'src/components'
];

targetDirs.forEach(dir => {
  if (fs.existsSync(dir)) {
    walkDir(dir, (filePath) => {
      if (!filePath.endsWith('.tsx') && !filePath.endsWith('.ts')) return;
      let content = fs.readFileSync(filePath, 'utf8');
      let originalContent = content;

      // Case A: 
      // const { data: membership } = await supabase.from("dorm_memberships")...maybeSingle();
      // ...
      // if (!membership || !new Set(["admin", "adviser"]).has(membership.role)) {
      content = content.replace(
        /const\s+\{\s*data:\s*membership\s*\}\s*=\s*await\s*supabase(.*?)\.from\("dorm_memberships"\)(.*?)\.maybeSingle\(\);([\s\S]*?)if\s*\(\s*!membership\s*\|\|\s*!new\s*Set\(\[([^\]]+)\]\)\.has\(membership\.role\)\s*\)\s*\{/gs,
        `const { data: memberships } = await supabase$1.from("dorm_memberships")$2;
  const roles = memberships?.map(m => m.role) ?? [];
  const hasAccess = roles.some(r => new Set([$4]).has(r));$3if (!hasAccess) {`
      );

      // Case B:
      // const { data: membership, error: membershipError } = await supabase.from("dorm_memberships")...maybeSingle();
      // ...
      // if (membershipError || !membership || !new Set(["admin", "student_assistant", "adviser"]).has(membership.role)) {
      content = content.replace(
        /const\s+\{\s*data:\s*membership,\s*error:\s*([a-zA-Z0-9_]+)\s*\}\s*=\s*await\s*supabase(.*?)\.from\("dorm_memberships"\)(.*?)\.maybeSingle\(\);([\s\S]*?)if\s*\(\s*\1\s*\|\|\s*!membership\s*\|\|\s*!new\s*Set\(\[([^\]]+)\]\)\.has\(membership\.role\)\s*\)\s*\{/gs,
        `const { data: memberships, error: $1 } = await supabase$2.from("dorm_memberships")$3;
  const roles = memberships?.map((m) => m.role) ?? [];
  const hasAccess = roles.some((r) => new Set([$5]).has(r));$4if ($1 || !hasAccess) {`
      );

      // Save if modified
      if (content !== originalContent) {
        fs.writeFileSync(filePath, content);
        console.log("Patched:", filePath);
      }
    });
  }
});
