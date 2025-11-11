import B2 from 'backblaze-b2';

const b2 = new B2({
  applicationKeyId: '005789fabffc33a0000000002',
  applicationKey: 'K005mzRgImk73DThoGoQCDtWf5XAfTc',
});

try {
  console.log('🔐 Testing B2 Authorization...');
  await b2.authorize();
  console.log('✅ SUCCESS! B2 auth worked!');
  console.log('📦 Authorized data:', b2.authorizationData);
} catch (error) {
  console.error('❌ FAILED:', error.response?.data || error.message);
}