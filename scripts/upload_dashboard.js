const Client = require('ssh2-sftp-client');
const path = require('path');
require('dotenv').config();

async function uploadDashboard() {
    const sftp = new Client();
    
    try {
        console.log('=== FORCE UPLOAD DASHBOARD.HTML ===');
        
        const config = {
            host: process.env.FTP_SERVER || 'access-5019362808.webspace-host.com',
            port: parseInt(process.env.FTP_PORT || '22', 10),
            username: process.env.FTP_USERNAME,
            password: process.env.FTP_PASSWORD,
        };
        
        console.log('Connecting to:', config.host);
        await sftp.connect(config);
        console.log('✅ Connected');
        
        const localPath = path.join(__dirname, '..', 'web-dashboard', 'dashboard.html');
        const remotePath = '/dfs/dashboard.html';
        
        console.log('Uploading:', localPath, '→', remotePath);
        await sftp.put(localPath, remotePath);
        console.log('✅ Dashboard uploaded successfully');
        
        // Verify
        const exists = await sftp.exists(remotePath);
        const stats = await sftp.stat(remotePath);
        console.log('✅ File exists:', exists);
        console.log('✅ Modified:', stats.mtime);
        
        await sftp.end();
        console.log('✅ Upload completed');
        
    } catch (err) {
        console.error('❌ Upload failed:', err.message);
        process.exit(1);
    }
}

uploadDashboard();
