const fs = require('fs');

let f1 = 'src/app/(app)/admin/fines/page.tsx';
let c1 = fs.readFileSync(f1, 'utf8');
c1 = c1.replace(/activeDormId\),/g, 'activeDormId!),');
c1 = c1.replace(/activeDormId,/g, 'activeDormId!,');
c1 = c1.replace(/activeDormId\)/g, 'activeDormId!)');
c1 = c1.replace(/defaultDormId=\{activeDormId\}/g, 'defaultDormId={activeDormId!}');
c1 = c1.replace(/dormId=\{activeDormId\}/g, 'dormId={activeDormId!}');
fs.writeFileSync(f1, c1);

let f2 = 'src/app/(app)/admin/occupants/[id]/page.tsx';
let c2 = fs.readFileSync(f2, 'utf8');
c2 = c2.replace(/activeDormId,/g, 'activeDormId!,');
c2 = c2.replace(/activeDormId\)/g, 'activeDormId!)');
c2 = c2.replace(/dormId=\{activeDormId\}/g, 'dormId={activeDormId!}');
c2 = c2.replace(/defaultDormId=\{activeDormId\}/g, 'defaultDormId={activeDormId!}');
fs.writeFileSync(f2, c2);

let f3 = 'src/app/(app)/admin/occupants/page.tsx';
let c3 = fs.readFileSync(f3, 'utf8');
c3 = c3.replace(/activeDormId,/g, 'activeDormId!,');
c3 = c3.replace(/dormId=\{activeDormId\}/g, 'dormId={activeDormId!}');
fs.writeFileSync(f3, c3);

let f4 = 'src/app/(app)/admin/rooms/page.tsx';
let c4 = fs.readFileSync(f4, 'utf8');
c4 = c4.replace(/activeDormId\)/g, 'activeDormId!)');
c4 = c4.replace(/activeDormId,/g, 'activeDormId!,');
c4 = c4.replace(/dormId=\{activeDormId\}/g, 'dormId={activeDormId!}');
fs.writeFileSync(f4, c4);

let f5 = 'src/app/actions/expenses.ts';
let c5 = fs.readFileSync(f5, 'utf8');
c5 = c5.replace(/if \(!hasAccess\) \{/g, 'if (!new Set(["admin", "treasurer"]).has(memberships[0]?.role)) {'); 
fs.writeFileSync(f5, c5);

console.log("TS issues patched.");
