// Sets all required env vars before any module is loaded in tests.
// Values are dummies — tests run against mongodb-memory-server, never real services.
process.env.NODE_ENV = "test";
process.env.ACCESS_SECRET = "test-access-secret-at-least-32-chars!!";
process.env.STRIPE_SECRET_KEY_TEST = "sk_test_dummy1234567890abcdefghijk";
process.env.STRIPE_WEBHOOK_SECRET_TEST = "whsec_testdummy1234567890";
process.env.OPENAI_API_KEY = "sk-test-dummy-key";
process.env.FRONTEND_URL = "http://localhost:3000";
process.env.CLOUDINARY_CLOUD_NAME = "testcloud";
process.env.CLOUDINARY_API_KEY = "123456789012345";
process.env.CLOUDINARY_API_SECRET = "test-cloudinary-secret";
process.env.SMTP_HOST = "localhost";
process.env.SMTP_PORT = "25";
process.env.SMTP_USER = "test@test.com";
process.env.SMTP_PASS = "testpass";
process.env.GOOGLE_CLIENT_ID = "test-google-client-id";
process.env.GOOGLE_CLIENT_SECRET = "test-google-client-secret";
process.env.GOOGLE_REDIRECT_URI = "http://localhost:3001/api/v2/auth/google/callback";
