const fs = require('fs');
const path = require('path');

try {
  // Read .dev.vars
  const devVarsPath = path.join(__dirname, '.dev.vars');
  const devVarsContent = fs.readFileSync(devVarsPath, 'utf-8');
  
  // Extract FIREBASE_SERVICE_ACCOUNT
  const lines = devVarsContent.split('\n');
  for (const line of lines) {
    if (line.startsWith('FIREBASE_SERVICE_ACCOUNT=')) {
      const jsonStr = line.substring(26); // Remove "FIREBASE_SERVICE_ACCOUNT="
      
      // Convert to Base64
      const base64 = Buffer.from(jsonStr, 'utf-8').toString('base64');
      
      console.log('\n✓ Firebase Service Account converted to Base64');
      console.log('\nBase64 (ready to add as secret):');
      console.log(base64);
      
      // Save to temp file for use in wrangler command
      fs.writeFileSync(path.join(__dirname, 'firebase-base64-temp.txt'), base64);
      console.log('\n✓ Saved to firebase-base64-temp.txt');
      
      break;
    }
  }
} catch (error) {
  console.error('Error:', error.message);
  process.exit(1);
}
