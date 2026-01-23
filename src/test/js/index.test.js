const mainTest = require('./main.test');
const utilsTest = require('./utils.test');

async function runAllTests() {
    console.log('🚀 Starting all JavaScript tests...\n');
    let failed = false;

    try {
        await mainTest.runTests();
        console.log('');
        await utilsTest.runTests();
        console.log('\n✅ All JavaScript tests passed!');
    } catch (err) {
        console.error('\n❌ One or more tests failed.');
        failed = true;
    }

    if (failed) {
        process.exit(1);
    } else {
        process.exit(0);
    }
}

runAllTests();
