// Test NCAAB TheRundown integration
const { getPlayerPropsFromTheRundown } = require('./dist/odds/sources/therundownProps.js');

async function testNcaab() {
  console.log('Testing NCAAB TheRundown integration...');
  
  try {
    const result = await getPlayerPropsFromTheRundown(['NCAAB']);
    console.log(`✅ NCAAB Results: ${result.length} props found`);
    
    if (result.length > 0) {
      console.log('Sample NCAAB props:');
      result.slice(0, 3).forEach((prop, i) => {
        console.log(`${i+1}. ${prop.player} - ${prop.stat} ${prop.line} (${prop.overOdds}/${prop.underOdds})`);
      });
    }
  } catch (error) {
    console.log('❌ NCAAB Error:', error.message);
  }
}

testNcaab();
