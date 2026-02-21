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

      // Pattern 1 (Event page style):
      // const { data: membership } = await supabase
      //   .from("dorm_memberships")
      //   ...
      //   .maybeSingle();
      //
      // const role = membership?.role ?? null;
      // if (!role || !new Set(["admin", "treasurer"]).has(role)) {

      content = content.replace(
        /const\s+\{\s*data:\s*membership\s*\}\s*=\s*await\s*supabase\s*\.from\("dorm_memberships"\)(.*?)\.maybeSingle\(\);\s*const\s*role\s*=\s*membership\?\.role\s*\?\?\s*null;\s*if\s*\(!role\s*\|\|\s*!new\s*Set\(\[([^\]]+)\]\)\.has\(role\)\)\s*\{/gs,
        `const { data: memberships } = await supabase.from("dorm_memberships")$1;
  const roles = memberships?.map(m => m.role) ?? [];
  const hasAccess = roles.some(r => new Set([$2]).has(r));
  if (!hasAccess) {`
      );

      // Pattern 2 (Action style):
      // const { data: membership, error: membershipError } = await supabase
      //   .from("dorm_memberships")
      //   ...
      //   .maybeSingle();
      //
      // if (
      //   membershipError ||
      //   !membership ||
      //   !new Set(["admin", "student_assistant", "adviser"]).has(membership.role)
      // ) {

      content = content.replace(
        /const\s+\{\s*data:\s*membership,\s*error:\s*membershipError\s*\}\s*=\s*await\s*supabase\s*\.from\("dorm_memberships"\)(.*?)\.maybeSingle\(\);\s*if\s*\(\s*membershipError\s*\|\|\s*!membership\s*\|\|\s*!new\s*Set\(\[([^\]]+)\]\)\.has\(membership\.role\)\s*\)\s*\{/gs,
        `const { data: memberships, error: membershipError } = await supabase.from("dorm_memberships")$1;
  const roles = memberships?.map(m => m.role) ?? [];
  const hasAccess = roles.some(r => new Set([$2]).has(r));
  if (membershipError || !hasAccess) {`
      );

      // Pattern 3 (Occupants page - find activeMembership array filtering):
      // const { data: memberships } = await supabase...eq("user_id", user.id);
      // const activeMembership = memberships?.find((membership) => membership.dorm_id === activeDormId) ?? memberships?.[0];
      // if (!activeMembership || !new Set(["admin", "student_assistant"]).has(activeMembership.role)) {
      content = content.replace(
        /const\s+activeMembership\s*=\s*memberships\?\.find\(\(membership\)\s*=>\s*membership\.dorm_id\s*===\s*activeDormId\)\s*\?\?\s*memberships\?\.\[0\];\s*if\s*\(\s*!activeMembership\s*\|\|\s*!new\s*Set\(\[([^\]]+)\]\)\.has\(activeMembership\.role\)\s*\)\s*\{/gs,
        `const activeMemberships = memberships?.filter(m => m.dorm_id === activeDormId) ?? [];
  const hasAccess = activeMemberships.some(m => new Set([$1]).has(m.role));
  if (!hasAccess) {`
      );

      if (content !== originalContent) {
        fs.writeFileSync(filePath, content);
        console.log("Patched:", filePath);
      }
    });
  }
});
