const fs = require('fs');

const replacements = [
  { file: 'src/app/dashboard/layout.tsx', regex: /redirect\("\/events"\)/g, replace: 'redirect("/occupant/events")' },
  { file: 'src/app/(app)/page.tsx', regex: /redirect\("\/home"\)/g, replace: 'redirect("/occupant/home")' },
  { file: 'src/app/(app)/occupant/evaluation/[id]/rate/page.tsx', regex: /redirect\("\/evaluation"\)/g, replace: 'redirect("/occupant/evaluation")' },
  { file: 'src/app/(app)/join/page.tsx', regex: /redirect\("\/home"\)/g, replace: 'redirect("/occupant/home")' },
  { file: 'src/components/events/delete-event-button.tsx', regex: /router\.push\("\/events"\)/g, replace: 'router.push("/occupant/events")' },
  { file: 'src/components/evaluation/rating-form.tsx', regex: /router\.push\("\/evaluation"\)/g, replace: 'router.push("/occupant/evaluation")' },
  { file: 'src/components/auth/LoginForm.tsx', regex: /router\.push\("\/home"\)/g, replace: 'router.push("/occupant/home")' },
  { file: 'src/app/actions/finance.ts', regex: /redirect\("\/payments"\)/g, replace: 'redirect("/occupant/payments")' },
  { file: 'src/app/actions/fines.ts', regex: /redirect\("\/fines"\)/g, replace: 'redirect("/occupant/fines")' },
];

replacements.forEach(({ file, regex, replace }) => {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    if (regex.test(content)) {
      content = content.replace(regex, replace);
      fs.writeFileSync(file, content);
      console.log('Fixed router links in', file);
    }
  }
});
