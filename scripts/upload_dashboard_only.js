const SftpClient = require('ssh2-sftp-client');
const path = require('path');
require('dotenv').config();

async function uploadDashboardOnly() {
    const sftp = new SftpClient();
    
    try {
        console.log('=== UPLOAD DASHBOARD.HTML ONLY ===');
        
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
        
        console.log('Uploading dashboard.html...');
        console.log(`From: ${localPath}`);
        console.log(`To: ${remotePath}`);
        
        // Force upload the dashboard file
        await sftp.put(localPath, remotePath);
        
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
        console.log('✅ Upload completed');
        
    } catch (err) {
        console.error('❌ Upload failed:', err.message);
        process.exit(1);
    }
}

uploadDashboardOnly();
