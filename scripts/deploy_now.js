const { Client } = require('ssh2-sftp-client');
require('dotenv').config();

const sftpConfig = {
  host: 'access-5019362808.webspace-host.com',
  port: 22,
  username: 'a901580',
  password: 'GjYtw28r6TpdpC'
};

const localFile = 'C:\\Dev\\Projects\\dfs-optimizer\\web-dashboard\\dist\\index.html';
const remoteFile = '/dfs/index.html';
const localDataFolder = 'C:\\Dev\\Projects\\dfs-optimizer\\web-dashboard\\dist\\data';
const remoteDataFolder = '/dfs/data';

async function deploy() {
  const client = new Client();
  try {
    await client.connect(sftpConfig);
    console.log('Connected');
    await client.put(localFile, remoteFile);
    console.log('Uploaded index.html');
    await client.uploadDir(localDataFolder, remoteDataFolder);
    console.log('Uploaded data folder');
    console.log('✅ Deployment complete!');
  } catch (err) {
    console.error('❌ Deployment failed:', err);
  } finally {
    client.end();
  }
}

deploy();
