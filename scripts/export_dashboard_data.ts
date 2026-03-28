import * as fs from 'fs';
import * as path from 'path';

const SOURCE_DIR = path.join(__dirname, '..', 'data', 'reports');
const DEST_DIR = path.join(__dirname, '..', 'web-dashboard', 'public', 'live-data');

const FILES_TO_COPY = [
  'data/reports/latest_run_status.json',
  'prizepicks-cards.json',
  'underdog-cards.json',
  'data/reports/latest_merge_quality.json'
];

function ensureDirectoryExists(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`Created directory: ${dirPath}`);
  }
}

function copyFile(sourcePath: string, destPath: string): void {
  try {
    fs.copyFileSync(sourcePath, destPath);
    console.log(`Copied: ${path.basename(sourcePath)}`);
  } catch (error) {
    console.error(`Failed to copy ${path.basename(sourcePath)}:`, error);
  }
}

function main(): void {
  console.log('Exporting dashboard data...');
  
  // Ensure destination directory exists
  ensureDirectoryExists(DEST_DIR);
  
  // Copy each file if it exists
  FILES_TO_COPY.forEach(filename => {
    const isReportsFile = filename.startsWith('data/reports/');
    const sourcePath = isReportsFile 
      ? path.join(__dirname, '..', filename)
      : path.join(__dirname, '..', filename);
    const destFileName = path.basename(filename);
    const destPath = path.join(DEST_DIR, destFileName);
    
    if (fs.existsSync(sourcePath)) {
      copyFile(sourcePath, destPath);
    } else {
      console.warn(`Warning: Source file not found: ${filename}`);
    }
  });
  
  console.log('Dashboard data export complete.');
}

if (require.main === module) {
  main();
}
