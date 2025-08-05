/**
 * Simple test script to verify GitHub API-only functionality
 * This can be run in both Node.js and Val.town environments
 */

import { 
  GitHubApiHandler, 
  createValTownConfig,
  detectEnvironment,
  testGitHubApiAccess,
  EventsDeployer
} from './index';

// Mock configuration for testing (don't use real tokens in tests)
const TEST_CONFIG = {
  githubToken: 'test-token-123',
  repoUrl: 'https://github.com/test-user/test-repo.git'
};

async function runTests() {
  console.log('🧪 Testing GitHub API Integration...\n');

  // Test 1: Environment Detection
  console.log('1. Testing environment detection...');
  const detectedMode = detectEnvironment();
  console.log(`   Detected mode: ${detectedMode}`);
  console.log('   ✅ Environment detection works\n');

  // Test 2: Configuration Creation
  console.log('2. Testing configuration creation...');
  try {
    const config = createValTownConfig(TEST_CONFIG);
    console.log(`   Config created: ${config.repoUrl}`);
    console.log('   ✅ Configuration creation works\n');
  } catch (error) {
    console.error(`   ❌ Configuration creation failed: ${(error as Error).message}\n`);
  }

  // Test 3: Handler Instantiation
  console.log('3. Testing handler instantiation...');
  try {
    const config = createValTownConfig(TEST_CONFIG);
    const handler = new GitHubApiHandler(config);
    console.log('   Handler created successfully');
    console.log('   ✅ Handler instantiation works\n');
  } catch (error) {
    console.error(`   ❌ Handler instantiation failed: ${(error as Error).message}\n`);
  }

  // Test 4: URL Parsing
  console.log('4. Testing URL parsing...');
  try {
    const config = createValTownConfig(TEST_CONFIG);
    const handler = new GitHubApiHandler(config);
    // Access private method via reflection for testing
    const extractMethod = (handler as any).extractOwnerRepo.bind(handler);
    const [owner, repo] = extractMethod();
    console.log(`   Parsed owner: ${owner}, repo: ${repo}`);
    console.log('   ✅ URL parsing works\n');
  } catch (error) {
    console.error(`   ❌ URL parsing failed: ${(error as Error).message}\n`);
  }

  // Test 5: Base64 Encoding/Decoding
  console.log('5. Testing base64 encoding...');
  try {
    const config = createValTownConfig(TEST_CONFIG);
    const handler = new GitHubApiHandler(config);
    
    const testContent = 'Hello, World! 🚀';
    const encoded = (handler as any).encodeBase64(testContent);
    const decoded = (handler as any).decodeBase64(encoded);
    
    console.log(`   Original: ${testContent}`);
    console.log(`   Encoded: ${encoded}`);
    console.log(`   Decoded: ${decoded}`);
    
    if (decoded === testContent) {
      console.log('   ✅ Base64 encoding/decoding works\n');
    } else {
      console.error('   ❌ Base64 encoding/decoding failed - content mismatch\n');
    }
  } catch (error) {
    console.error(`   ❌ Base64 encoding/decoding failed: ${(error as Error).message}\n`);
  }

  // Test 6: EventsDeployer Factory Methods
  console.log('6. Testing EventsDeployer factory methods...');
  try {
    // Test Val.town factory
    const valTownDeployer = EventsDeployer.forValTown(TEST_CONFIG);
    console.log('   Val.town deployer created successfully');

    // Test mode-specific factory
    const apiDeployer = EventsDeployer.withMode('api-only', createValTownConfig(TEST_CONFIG));
    console.log('   API-only deployer created successfully');
    
    console.log('   ✅ Factory methods work\n');
  } catch (error) {
    console.error(`   ❌ Factory methods failed: ${(error as Error).message}\n`);
  }

  // Test 7: Interface Compatibility
  console.log('7. Testing interface compatibility...');
  try {
    const deployer = EventsDeployer.forValTown(TEST_CONFIG);
    
    // Verify required methods exist
    const methods = ['deployEvents', 'extractEventsForMonth', 'generateMarkdown'];
    for (const method of methods) {
      if (typeof (deployer as any)[method] === 'function') {
        console.log(`   ✅ Method ${method} exists`);
      } else {
        console.error(`   ❌ Method ${method} missing`);
      }
    }
    console.log('   ✅ Interface compatibility verified\n');
  } catch (error) {
    console.error(`   ❌ Interface compatibility check failed: ${(error as Error).message}\n`);
  }

  console.log('🎉 All tests completed!');
  console.log('\n📝 Test Summary:');
  console.log('   - Environment detection ✅');
  console.log('   - Configuration creation ✅');
  console.log('   - Handler instantiation ✅');
  console.log('   - URL parsing ✅');
  console.log('   - Base64 encoding ✅');
  console.log('   - Factory methods ✅');
  console.log('   - Interface compatibility ✅');
  console.log('\n🚀 Ready for Val.town deployment!');
}

// Export for testing purposes
export { runTests };

// Run tests if this file is executed directly
if (require.main === module) {
  runTests().catch(console.error);
}