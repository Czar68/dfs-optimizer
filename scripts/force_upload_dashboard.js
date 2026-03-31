const SftpClient = require('ssh2-sftp-client');
const path = require('path');
require('dotenv').config();

async function forceUpload() {
    const sftp = new SftpClient();
    
    try {
        console.log('=== FORCE UPLOAD DASHBOARD.HTML ===');
        
        const config = {
            host: 'access-5019362808.webspace-host.com',
            port: 22,
            username: 'a901580',
            password: 'GjYtw28r6TpdpC'
        };
        
        console.log('Connecting to SFTP server...');
        await sftp.connect(config);
        console.log('✅ Connected to SFTP');
        
        const localPath = path.join(__dirname, '..', 'web-dashboard', 'dashboard.html');
        const remotePath = '/dfs/dashboard.html';
        
        console.log('Uploading dashboard.html...');
        console.log(`From: ${localPath}`);
        console.log(`To: ${remotePath}`);
        
        // Force upload (overwrite existing file)
        await sftp.put(localPath, remotePath, {
            mode: 'overwrite'
        });
        
        console.log('✅ Dashboard uploaded successfully!');
        
        // Verify the upload
        const exists = await sftp.exists(remotePath);
        if (exists) {
            const stats = await sftp.stat(remotePath);
            console.log(`✅ File verified on server`);
            console.log(`✅ Modified: ${stats.mtime}`);
            console.log(`✅ Size: ${stats.size} bytes`);
        } else {
            console.log('❌ File not found after upload');
        }
        
        await sftp.end();
        console.log('✅ SFTP connection closed');
        
    } catch (err) {
        console.error('❌ Upload failed:', err.message);
        process.exit(1);
    }
}

forceUpload();
