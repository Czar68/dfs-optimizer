#!/usr/bin/env node
/**
 * Simple deployment script for SlipStrength dashboard
 * Usage: node deploy.js
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('=== SLIPSTRENGTH DASHBOARD DEPLOY ===');

// Configuration
const config = {
    host: 'access-5019362808.webspace-host.com',
    user: 'a901580',
    remoteRoot: '/dfs/',
    localRoot: path.join(__dirname, 'web-dashboard')
};

const projectRoot = __dirname;

// Files to deploy
const files = [
    'index.html',
    'dashboard.html'
];

// CSV files from project root
const csvFiles = [
    'prizepicks-cards.csv',
    'prizepicks-legs.csv', 
    'underdog-cards.csv',
    'underdog-legs.csv',
    'last_fresh_run.json'
];

async function deploy() {
    try {
        console.log('📁 Copying CSV files to data directory...');
        
        // Ensure data directory exists
        const dataDir = path.join(config.localRoot, 'data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        
        // Copy CSV files from project root to web-dashboard/data
        for (const file of csvFiles) {
            const src = path.join(config.projectRoot, file);
            const dest = path.join(dataDir, file);
            
            if (fs.existsSync(src)) {
                fs.copyFileSync(src, dest);
                console.log(`✅ Copied ${file}`);
            } else {
                console.log(`⚠️  ${file} not found in project root`);
            }
        }
        
        console.log('\n🚀 Deploying files to server...');
        
        // Deploy HTML files using scp
        for (const file of files) {
            const localPath = path.join(config.localRoot, file);
            const remotePath = `${config.remoteRoot}${file}`;
            
            if (fs.existsSync(localPath)) {
                const cmd = `scp "${localPath}" ${config.user}@${config.host}:${remotePath}`;
                console.log(`📤 Uploading ${file}...`);
                
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
        
        // Deploy data files
        console.log('\n📊 Deploying data files...');
        for (const file of csvFiles) {
            const localPath = path.join(dataDir, file);
            const remotePath = `${config.remoteRoot}data/${file}`;
            
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
            }
        }
        
        console.log('\n🎉 DEPLOYMENT COMPLETE!');
        console.log('\n📋 Live URLs:');
        console.log(`   Landing Page: https://dfs.gamesmoviesmusic.com/`);
        console.log(`   Dashboard:    https://dfs.gamesmoviesmusic.com/dashboard.html`);
        console.log(`   Data Files:   https://dfs.gamesmoviesmusic.com/data/`);
        
    } catch (error) {
        console.error('❌ Deployment failed:', error.message);
        process.exit(1);
    }
}

deploy();
