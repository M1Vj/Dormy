const fs = require('fs');

function globalReplace(file, searchRegex, replaceString) {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(searchRegex, replaceString);
  fs.writeFileSync(file, content);
}

// 1. Fix 'role' to 'roles.includes' in Finance pages
globalReplace('src/app/(app)/admin/finance/events/page.tsx', 
  /const canFilterDorm = role === "admin";/g, 
  'const canFilterDorm = roles.includes("admin");');
  
globalReplace('src/app/(app)/admin/finance/maintenance/page.tsx', 
  /const canFilterDorm = role === "admin";/g, 
  'const canFilterDorm = roles.includes("admin");');

// 2. Fix activeMembership.dorm_id to activeDormId
const membershipFiles = [
  'src/app/(app)/admin/fines/page.tsx',
  'src/app/(app)/admin/occupants/[id]/page.tsx',
  'src/app/(app)/admin/occupants/page.tsx',
  'src/app/(app)/admin/rooms/page.tsx'
];
membershipFiles.forEach(f => {
  globalReplace(f, /activeMembership\.dorm_id/g, 'activeDormId');
  globalReplace(f, /activeMembership\.role/g, 'roles[0]'); // Fallback if still lingering
});

// 3. Fix membership.role in admin/page.tsx
globalReplace('src/app/(app)/admin/page.tsx', 
  /membership\.role === "admin"/g, 
  'roles.includes("admin")');

// 4. Fix expenses.ts
let expPath = 'src/app/actions/expenses.ts';
let expContent = fs.readFileSync(expPath, 'utf8');
expContent = expContent.replace(
  /const isStaffSubmitter = Boolean\(membership && staffSubmitRoles\.has\(membership\.role\)\);/g,
  'const isStaffSubmitter = Boolean(memberships && roles.some(r => staffSubmitRoles.has(r)));'
);
expContent = expContent.replace(
  /if \(!membership\) \{/g,
  'if (!memberships || memberships.length === 0) {'
);
fs.writeFileSync(expPath, expContent);

console.log("Typescript fixes applied.");
