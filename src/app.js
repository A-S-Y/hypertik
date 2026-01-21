import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  getIdTokenResult
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import {
  getDatabase,
  ref,
  onValue,
  update,
  set
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-database.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// DOM
const loginSection = document.getElementById('login-section');
const dashboard = document.getElementById('dashboard');
const accountDetail = document.getElementById('account-detail');
const accountsTableBody = document.querySelector('#accounts-table tbody');
const btnLogin = document.getElementById('btn-login');
const btnSignout = document.getElementById('btn-signout');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const loginMsg = document.getElementById('login-msg');
const filterInput = document.getElementById('filter');

let accountsCache = {};

// Login
btnLogin.addEventListener('click', async () => {
  loginMsg.textContent = "";
  try {
    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();
    if (!email || !password) {
      loginMsg.textContent = "أدخل البريد وكلمة المرور";
      return;
    }
    await signInWithEmailAndPassword(auth, email, password);
    loginMsg.textContent = "جاري الدخول...";
  } catch (err) {
    console.error(err);
    loginMsg.textContent = "فشل تسجيل الدخول: " + err.message;
  }
});

btnSignout.addEventListener('click', async () => {
  await signOut(auth);
});

// Auth state
onAuthStateChanged(auth, async (user) => {
  if (user) {
    // تحقق من custom claim admin
    const tokenResult = await getIdTokenResult(user, true).catch(()=>({claims:{}}));
    const isAdmin = tokenResult && tokenResult.claims && tokenResult.claims.admin;
    if (!isAdmin) {
      alert('حسابك ليس لديه صلاحية المشرف. تواصل مع المسؤول.');
      await signOut(auth);
      return;
    }

    loginSection.style.display = 'none';
    dashboard.style.display = '';
    btnSignout.style.display = '';
    loadAccounts();
  } else {
    loginSection.style.display = '';
    dashboard.style.display = 'none';
    accountDetail.style.display = 'none';
    btnSignout.style.display = 'none';
  }
});

// Load accounts
function loadAccounts() {
  const accountsRef = ref(db, 'accounts');
  onValue(accountsRef, (snapshot) => {
    const data = snapshot.val() || {};
    accountsCache = data;
    renderAccounts(data);
    renderStats(data);
  });
}

function renderStats(data) {
  const total = Object.keys(data).length;
  const premium = Object.values(data).filter(a => a.isPremium).length;
  document.getElementById('stats').innerHTML =
    `<div>إجمالي الحسابات: ${total}</div><div>حسابات مميزة: ${premium}</div>`;
}

function renderAccounts(data) {
  accountsTableBody.innerHTML = '';
  const filter = filterInput.value.trim();
  Object.entries(data).forEach(([phone, acc]) => {
    if (filter && !(phone.includes(filter) || (acc.name && acc.name.includes(filter)))) return;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${phone}</td>
      <td>${acc.name || ''}</td>
      <td>${acc.networkName || ''}</td>
      <td>${acc.isActive ? 'نعم' : 'لا'}</td>
      <td>${acc.plan ? (acc.plan.name || acc.plan.type) : ''}</td>
      <td>
        <button data-phone="${phone}" class="btn-open">فتح</button>
      </td>
    `;
    accountsTableBody.appendChild(tr);
  });

  document.querySelectorAll('.btn-open').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const phone = e.currentTarget.dataset.phone;
      openAccountDetail(phone);
    });
  });
}

filterInput.addEventListener('input', () => {
  renderAccounts(accountsCache);
});

// Open account detail
async function openAccountDetail(phone) {
  const acc = accountsCache[phone];
  if (!acc) return alert('الحساب غير موجود');
  loginSection.style.display = 'none';
  dashboard.style.display = 'none';
  accountDetail.style.display = '';

  document.getElementById('detail-phone').textContent = phone;
  document.getElementById('detail-general').innerHTML = `
    <h3>عام</h3>
    <div>الاسم: ${acc.name || ''}</div>
    <div>الشبكة: ${acc.networkName || ''}</div>
    <div>PublicNetworkId: ${acc.publicNetworkId || ''}</div>
    <div>نشط: ${acc.isActive ? 'نعم' : 'لا'} <button id="toggle-active">تبديل</button></div>
  `;

  document.getElementById('detail-plan').innerHTML = `
    <h3>الخطة</h3>
    <pre>${JSON.stringify(acc.plan || {}, null, 2)}</pre>
    <button id="btn-edit-plan">تعديل الخطة</button>
  `;

  const routersHtml = acc.routersID ? Object.keys(acc.routersID).map(r => `<li>${r}</li>`).join('') : '';
  document.getElementById('detail-routers').innerHTML = `<h3>Routers</h3><ul>${routersHtml}</ul><button id="btn-add-router">إضافة راوتر يدوي</button>`;

  const employeesHtml = acc.employees ? Object.entries(acc.employees).map(([k,v]) => `<li>${v.name} (${v.id})</li>`).join('') : '';
  document.getElementById('detail-employees').innerHTML = `<h3>الموظفين</h3><ul>${employeesHtml}</ul>`;

  document.getElementById('back-to-list').onclick = () => {
    accountDetail.style.display = 'none';
    dashboard.style.display = '';
  };

  document.getElementById('toggle-active').onclick = async () => {
    const newVal = !acc.isActive;
    await update(ref(db, `accounts/${phone}`), { isActive: newVal });
    alert('تم تغيير الحالة');
  };

  document.getElementById('btn-edit-plan').onclick = async () => {
    const newEnd = prompt('تاريخ الانتهاء (YYYY-MM-DD):', (acc.plan && acc.plan.endDate) || '');
    if (!newEnd) return;
    await update(ref(db, `accounts/${phone}/plan`), { endDate: newEnd });
    alert('تم تحديث تاريخ الانتهاء');
  };

  document.getElementById('btn-add-router').onclick = async () => {
    const routerId = prompt('أدخل Router ID جديد:');
    if (!routerId) return;
    await set(ref(db, `accounts/${phone}/routersID/${routerId}`), true);
    alert('تم إضافة الراوتر إلى الحساب');
  };
}