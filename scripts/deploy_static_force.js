const { exec } = require('child_process');
require('dotenv').config();

const sftpHost = 'access-5019362808.webspace-host.com';
const sftpUser = 'a901580';
const sftpPass = 'GjYtw28r6TpdpC';

console.log('=== DEPLOYING STATIC DASHBOARD ===');
console.log(`Deploying to: ${sftpHost}`);

// Use WinSCP command line if available, or fallback to the existing method
// For now, we'll use the same SFTP method as before but without the check

const command = `node scripts/deploy_sftp.js --skip-check`;

exec(command, (err, stdout) => {
  if (err) console.error(err);
  console.log(stdout);
});
