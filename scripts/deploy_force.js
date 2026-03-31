const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const sftpHost = 'access-5019362808.webspace-host.com';
const sftpUser = 'a901580';
const sftpPass = 'GjYtw28r6TpdpC';

console.log('=== DEPLOYING STATIC DASHBOARD ===');
console.log('FTP Config:', { host: sftpHost, port: 22, username: sftpUser });

// Ensure data is in dist
const distDataPath = path.join(process.cwd(), 'web-dashboard', 'dist', 'data');
const publicDataPath = path.join(process.cwd(), 'web-dashboard', 'public', 'data');

if (!fs.existsSync(distDataPath)) {
  fs.mkdirSync(distDataPath, { recursive: true });
}

// Copy data files
const dataFiles = ['prizepicks-cards.csv', 'prizepicks-legs.csv', 'underdog-cards.csv', 'underdog-legs.csv', 'last_fresh_run.json'];
dataFiles.forEach(file => {
  const src = path.join(process.cwd(), file);
  const dest = path.join(distDataPath, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`Copied ${file} → web-dashboard/dist/data/`);
  }
});

// Create SFTP command with lftp-style using Node's built-in modules
// Use scp-style SFTP via a simple batch file

const deployScript = `
echo "open sftp://${sftpUser}:${sftpPass}@${sftpHost} -hostkey=*" > deploy_tmp.txt
echo "put ${path.join(process.cwd(), 'web-dashboard', 'dist', 'index.html')} /dfs/index.html" >> deploy_tmp.txt
echo "put ${path.join(process.cwd(), 'web-dashboard', 'dashboard.html')} /dfs/dashboard.html" >> deploy_tmp.txt
echo "mkdir /dfs/data" >> deploy_tmp.txt
echo "cd /dfs/data" >> deploy_tmp.txt
${dataFiles.map(file => `echo "put ${path.join(distDataPath, file)} ${file}" >> deploy_tmp.txt`).join('\n')}
echo "exit" >> deploy_tmp.txt
`;

fs.writeFileSync('deploy_tmp.txt', deployScript);

console.log('Using WinSCP for deployment...');
exec('winscp.com /script=deploy_tmp.txt', (err, stdout, stderr) => {
  if (err) {
    console.error('WinSCP not found. Trying alternative...');
    // Fallback: use scp if available
    exec(`scp ${path.join(process.cwd(), 'web-dashboard', 'dist', 'index.html')} ${sftpUser}@${sftpHost}:/dfs/index.html`, (err2, stdout2) => {
      if (err2) {
        console.log('Manual upload required:');
        console.log(`1. FTP to ${sftpHost}`);
        console.log(`2. Upload: ${path.join(process.cwd(), 'web-dashboard', 'dist', 'index.html')} → /dfs/`);
        console.log(`3. Upload: ${path.join(process.cwd(), 'web-dashboard', 'dashboard.html')} → /dfs/`);
        console.log(`4. Upload folder: ${distDataPath} → /dfs/data`);
      } else {
        console.log('Deployed index.html via scp!');
        // Also deploy dashboard.html
        exec(`scp ${path.join(process.cwd(), 'web-dashboard', 'dashboard.html')} ${sftpUser}@${sftpHost}:/dfs/dashboard.html`, (err3) => {
          if (err3) {
            console.log('Failed to deploy dashboard.html via scp');
          } else {
            console.log('Deployed dashboard.html via scp!');
          }
        });
      }
    });
  } else {
    console.log('Deployed successfully via WinSCP!');
    console.log(stdout);
  }
  fs.unlinkSync('deploy_tmp.txt');
});
