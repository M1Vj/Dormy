const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ?
      walkDir(dirPath, callback) : callback(path.join(dir, f));
  });
}

const targetDir = path.join(__dirname, 'src');

walkDir(targetDir, function (file) {
  if (!file.endsWith('.tsx')) return;

  let content = fs.readFileSync(file, 'utf8');
  let original = content;

  // Generic root-level hrefs to occupant routes
  content = content.replace(/href="\/payments"/g, 'href="/occupant/payments"');
  content = content.replace(/href="\/cleaning"/g, 'href="/occupant/cleaning"');
  content = content.replace(/href="\/evaluation"/g, 'href="/occupant/evaluation"');
  content = content.replace(/href="\/events"/g, 'href="/occupant/events"');
  content = content.replace(/href="\/fines(\/reports)?"/g, 'href="/occupant/fines$1"');
  content = content.replace(/href="\/fines"/g, 'href="/occupant/fines"');
  content = content.replace(/href="\/committees"/g, 'href="/occupant/committees"');

  const roleMatch = file.match(/src\/app\/\(app\)\/([^/]+)\/home/);
  if (roleMatch) {
    const role = roleMatch[1];
    content = content.replace(/href="\/home\/announcements"/g, `href="/${role}/home/announcements"`);
  } else {
    content = content.replace(/href="\/home\/announcements"/g, 'href="/occupant/home/announcements"');
  }

  // Generic `/home` -> `/occupant/home` fallback
  if (!file.endsWith('middleware.ts')) {
    content = content.replace(/href="\/home"/g, 'href="/occupant/home"');
  }

  if (content !== original) {
    fs.writeFileSync(file, content);
    console.log('Fixed links in', file);
  }
});
