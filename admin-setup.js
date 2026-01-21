/**
 * سكربت لتعيين custom claim { admin: true } لمستخدم Firebase Authentication
 * الاستخدام:
 * 1) تنزيل ملف service account JSON من Firebase Console أو اضبط GOOGLE_APPLICATION_CREDENTIALS
 * 2) npm install firebase-admin minimist
 * 3) node admin-setup.js --uid <USER_UID>
 */
const admin = require('firebase-admin');
const argv = require('minimist')(process.argv.slice(2));

if (!argv.uid) {
  console.error('Usage: node admin-setup.js --uid <USER_UID>');
  process.exit(1);
}

// تأكد من ضبط GOOGLE_APPLICATION_CREDENTIALS أو استبدل المسار هنا:
try {
  admin.initializeApp({
    credential: admin.credential.applicationDefault()
  });
} catch (err) {
  console.error('Failed to initialize admin SDK. تأكد من وجود GOOGLE_APPLICATION_CREDENTIALS:', err.message);
  process.exit(1);
}

const uid = argv.uid;
admin.auth().setCustomUserClaims(uid, { admin: true })
  .then(() => {
    console.log(`Custom claim admin=true set for uid=${uid}`);
    process.exit(0);
  })
  .catch(err => {
    console.error('Error setting custom claim:', err);
    process.exit(1);
  });