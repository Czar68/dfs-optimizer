#!/usr/bin/env node
/**
 * Clean IONOS Deployment Script
 * Deploys to the correct web root structure
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('=== CLEAN IONOS DEPLOY ===');

// Configuration - CORRECT WEB ROOT IDENTIFIED
const config = {
    host: 'access-5019362808.webspace-host.com',
    user: 'a901580',
    // Web root is /htdocs/, not /dfs/
    remoteRoot: '/htdocs/', // CONFIRMED: This is the true web root
    localRoot: path.join(__dirname, 'web-dashboard')
};

// Files to deploy
const files = [
    'index.html',
    'dashboard.html'
];

// CSV files from data directory
const csvFiles = [
    'prizepicks-cards.csv',
    'prizepicks-legs.csv', 
    'underdog-cards.csv',
    'underdog-legs.csv'
];

async function deployToRoot(rootPath) {
    console.log(`\n🚀 Deploying to ${rootPath}...`);
    
    try {
        // Deploy HTML files
        for (const file of files) {
            const localPath = path.join(config.localRoot, file);
            const remotePath = `${rootPath}${file}`;
            
            if (fs.existsSync(localPath)) {
                const cmd = `scp "${localPath}" ${config.user}@${config.host}:${remotePath}`;
                console.log(`📤 Uploading ${file} to ${rootPath}...`);
                
                await new Promise((resolve, reject) => {
                    exec(cmd, (error, stdout, stderr) => {
                        if (error) {
                            console.error(`❌ Failed to upload ${file}:`, error.message);
                            reject(error);
                        } else {
                            console.log(`✅ Uploaded ${file}`);
                            resolve();
                        }
                    });
                });
            } else {
                console.log(`⚠️  ${file} not found locally`);
            }
        }
        
        // Create data directory and upload CSV files
        console.log(`📁 Creating data directory in ${rootPath}...`);
        await new Promise((resolve, reject) => {
            exec(`ssh ${config.user}@${config.host} "mkdir -p ${rootPath}data"`, (error, stdout, stderr) => {
                if (error) {
                    console.error(`❌ Failed to create data directory:`, error.message);
                    reject(error);
                } else {
                    console.log(`✅ Data directory created`);
                    resolve();
                }
            });
        });
        
        // Deploy CSV files
        for (const file of csvFiles) {
            const localPath = path.join(config.localRoot, 'data', file);
            const remotePath = `${rootPath}data/${file}`;
            
            if (fs.existsSync(localPath)) {
                const cmd = `scp "${localPath}" ${config.user}@${config.host}:${remotePath}`;
                console.log(`📤 Uploading data/${file}...`);
                
                await new Promise((resolve, reject) => {
                    exec(cmd, (error, stdout, stderr) => {
                        if (error) {
                            console.error(`❌ Failed to upload data/${file}:`, error.message);
                            reject(error);
                        } else {
                            console.log(`✅ Uploaded data/${file}`);
                            resolve();
                        }
                    });
                });
            } else {
                console.log(`⚠️  data/${file} not found locally`);
            }
        }
        
        console.log(`✅ Deployment to ${rootPath} completed!`);
        return true;
        
    } catch (error) {
        console.error(`❌ Deployment to ${rootPath} failed:`, error.message);
        return false;
    }
}

async function deploy() {
    try {
        console.log('📋 Local files verified:');
        console.log(`  index.html: ${(fs.existsSync(path.join(config.localRoot, 'index.html')) ? '✅' : '❌')} (${fs.statSync(path.join(config.localRoot, 'index.html')).size} bytes)`);
        console.log(`  dashboard.html: ${(fs.existsSync(path.join(config.localRoot, 'dashboard.html')) ? '✅' : '❌')} (${fs.statSync(path.join(config.localRoot, 'dashboard.html')).size} bytes)`);
        console.log(`  data/ folder: ${(fs.existsSync(path.join(config.localRoot, 'data')) ? '✅' : '❌')} (${fs.readdirSync(path.join(config.localRoot, 'data')).length} files)`);
        
        // Try primary web root first
        const success = await deployToRoot(config.remoteRoot);
        
        if (success) {
            console.log('\n🎉 DEPLOYMENT SUCCESSFUL!');
            console.log('\n📋 Test URLs:');
            console.log(`   Landing Page: https://dfs.gamesmoviesmusic.com/`);
            console.log(`   Dashboard:    https://dfs.gamesmoviesmusic.com/dashboard.html`);
            console.log(`   Data Files:   https://dfs.gamesmoviesmusic.com/data/`);
        } else {
            console.log('\n❌ Primary deployment failed. Try fallback root or check permissions.');
        }
        
    } catch (error) {
        console.error('❌ Deployment failed:', error.message);
        process.exit(1);
    }
}

deploy();
