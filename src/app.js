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
  set,
  query,
  limitToLast
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-database.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// DOM Elements
const loginSection = document.getElementById('login-section');
const sidebar = document.getElementById('sidebar');
const mainContent = document.getElementById('main-content');
const loginMsg = document.getElementById('login-msg');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const btnLogin = document.getElementById('btn-login');
const btnSignout = document.getElementById('btn-signout');

// Views
const views = {
  dashboard: document.getElementById('dashboard-view'),
  accounts: document.getElementById('accounts-view'),
  logs: document.getElementById('logs-view'),
  detail: document.getElementById('account-detail-view')
};

// Navigation
const navItems = {
  dashboard: document.getElementById('nav-dashboard'),
  accounts: document.getElementById('nav-accounts'),
  logs: document.getElementById('nav-logs')
};

let accountsCache = {};
let currentView = 'dashboard';

// Init
function init() {
  Object.keys(navItems).forEach(key => {
    navItems[key].addEventListener('click', (e) => {
      e.preventDefault();
      showView(key);
    });
  });

  btnLogin.addEventListener('click', handleLogin);
  btnSignout.addEventListener('click', () => signOut(auth));

  window.showView = showView; // Expose to global for button clicks
}

async function handleLogin() {
  loginMsg.textContent = "جاري التحقق...";
  try {
    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();
    if (!email || !password) {
      loginMsg.textContent = "أدخل البريد وكلمة المرور";
      return;
    }
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    console.error(err);
    loginMsg.textContent = "فشل الدخول: " + err.message;
  }
}

function showView(viewId) {
  Object.keys(views).forEach(key => {
    views[key].style.display = key === viewId ? 'block' : 'none';
  });

  Object.keys(navItems).forEach(key => {
    navItems[key].classList.toggle('active', key === viewId);
  });

  const titles = {
    dashboard: 'لوحة التحكم',
    accounts: 'إدارة الحسابات',
    logs: 'سجلات النشاط',
    detail: 'تفاصيل الحساب'
  };
  document.getElementById('page-title').textContent = titles[viewId] || '';
  currentView = viewId;
}

// Auth state
onAuthStateChanged(auth, async (user) => {
  if (user) {
    const tokenResult = await getIdTokenResult(user, true).catch(() => ({ claims: {} }));
    const isAdmin = tokenResult && tokenResult.claims && tokenResult.claims.admin;

    if (!isAdmin) {
      alert('حسابك ليس لديه صلاحية المشرف.');
      await signOut(auth);
      return;
    }

    document.getElementById('admin-email').textContent = user.email;
    loginSection.style.display = 'none';
    sidebar.style.display = 'flex';
    mainContent.style.display = 'block';

    loadData();
  } else {
    loginSection.style.display = 'flex';
    sidebar.style.display = 'none';
    mainContent.style.display = 'none';
  }
});

function loadData() {
  // Load Accounts
  const accountsRef = ref(db, 'accounts');
  onValue(accountsRef, (snapshot) => {
    const data = snapshot.val() || {};
    accountsCache = data;
    renderDashboard(data);
    renderAccounts(data);
  });

  // Load Recent Logs
  const logsRef = query(ref(db, 'activities'), limitToLast(50));
  onValue(logsRef, (snapshot) => {
    const allActivities = snapshot.val() || {};
    renderLogs(allActivities);
  });
}

function renderDashboard(data) {
  const accounts = Object.values(data);
  document.getElementById('total-accounts').textContent = accounts.length;
  document.getElementById('premium-accounts').textContent = accounts.filter(a => a.isPremium).length;
  document.getElementById('active-accounts').textContent = accounts.filter(a => a.isActive).length;

  const recentTbody = document.querySelector('#recent-accounts-table tbody');
  recentTbody.innerHTML = '';

  // Sort by createdAt or take last 5
  const sorted = Object.entries(data).sort((a, b) => {
    return new Date(b[1].createdAt) - new Date(a[1].createdAt);
  }).slice(0, 5);

  sorted.forEach(([phone, acc]) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${phone}</td>
      <td>${acc.name || '---'}</td>
      <td>${acc.networkName || '---'}</td>
      <td><span class="badge ${acc.isActive ? 'badge-success' : 'badge-danger'}">${acc.isActive ? 'نشط' : 'معطل'}</span></td>
      <td><button class="glass" style="padding: 5px 15px;" onclick="openDetail('${phone}')">فتح</button></td>
    `;
    recentTbody.appendChild(tr);
  });
}

function renderAccounts(data) {
  const tbody = document.querySelector('#accounts-table tbody');
  const filter = document.getElementById('filter').value.toLowerCase();
  tbody.innerHTML = '';

  Object.entries(data).forEach(([phone, acc]) => {
    const searchStr = `${phone} ${acc.name || ''} ${acc.networkName || ''}`.toLowerCase();
    if (filter && !searchStr.includes(filter)) return;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight: 600;">${phone}</td>
      <td>${acc.name || '---'}</td>
      <td>${acc.networkName || '---'}</td>
      <td><span class="badge badge-primary">${acc.plan ? acc.plan.name : 'بدون خطة'}</span></td>
      <td><span class="badge ${acc.isActive ? 'badge-success' : 'badge-danger'}">${acc.isActive ? 'نشط' : 'معطل'}</span></td>
      <td>${acc.createdAt ? acc.createdAt.split(' ')[0] : '---'}</td>
      <td>
        <button class="glass" style="padding: 8px 15px;" onclick="openDetail('${phone}')">إدارة</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

document.getElementById('filter').addEventListener('input', () => {
  renderAccounts(accountsCache);
});

function renderLogs(allActivities) {
  const tbody = document.querySelector('#logs-table tbody');
  tbody.innerHTML = '';

  const flatLogs = [];
  Object.entries(allActivities).forEach(([id, deviceLogs]) => {
    Object.entries(deviceLogs).forEach(([logId, log]) => {
      flatLogs.push({ ...log, logId, deviceId: id });
    });
  });

  flatLogs.sort((a, b) => new Date(b.timestamp || b.time) - new Date(a.timestamp || a.time))
    .slice(0, 100)
    .forEach(log => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
            <td style="font-size: 0.8rem; color: var(--text-muted);">${log.timestamp || log.time || '---'}</td>
            <td><span class="badge badge-primary">${log.action || log.type || 'إجراء'}</span></td>
            <td style="font-size: 0.9rem;">${log.details || '---'}</td>
            <td style="font-size: 0.8rem; color: var(--primary);">${log.deviceId}</td>
        `;
      tbody.appendChild(tr);
    });
}

async function openDetail(phone) {
  const acc = accountsCache[phone];
  if (!acc) return;

  showView('detail');

  document.getElementById('detail-phone').textContent = phone;
  document.getElementById('detail-name').textContent = acc.name || 'مستخدم بدون اسم';
  document.getElementById('detail-network-name').textContent = acc.networkName || '---';
  document.getElementById('detail-public-id').textContent = acc.publicNetworkId || '---';

  const planName = acc.plan ? acc.plan.name : 'بدون خطة';
  document.getElementById('detail-plan-name').textContent = planName;
  document.getElementById('detail-plan-end').textContent = (acc.plan && acc.plan.endDate) || '---';
  document.getElementById('detail-max-routers').textContent = (acc.plan && acc.plan.maxRouters) || '---';

  const toggleBtn = document.getElementById('toggle-active');
  toggleBtn.textContent = acc.isActive ? 'تعطيل الحساب' : 'تنشيط الحساب';
  toggleBtn.onclick = async () => {
    const newVal = !acc.isActive;
    await update(ref(db, `accounts/${phone}`), { isActive: newVal });
    alert('تم تحديث الحالة');
  };

  const routersList = document.getElementById('detail-routers-list');
  routersList.innerHTML = '';
  if (acc.routersID) {
    Object.keys(acc.routersID).forEach(id => {
      const li = document.createElement('li');
      li.className = 'glass';
      li.style.padding = '10px 15px';
      li.style.marginBottom = '10px';
      li.style.display = 'flex';
      li.style.justifyContent = 'space-between';
      li.innerHTML = `<span>${id}</span> <button style="color: var(--accent); background: none;" onclick="removeRouter('${phone}', '${id}')">حذف</button>`;
      routersList.appendChild(li);
    });
  }

  const employeesList = document.getElementById('detail-employees-list');
  employeesList.innerHTML = '';
  if (acc.employees) {
    Object.values(acc.employees).forEach(emp => {
      const li = document.createElement('li');
      li.className = 'glass';
      li.style.padding = '10px 15px';
      li.style.marginBottom = '10px';
      li.innerHTML = `<div>${emp.name}</div><div style="font-size: 0.7rem; color: var(--text-muted);">ID: ${emp.id}</div>`;
      employeesList.appendChild(li);
    });
  }

  document.getElementById('btn-edit-plan').onclick = async () => {
    const newEnd = prompt('تاريخ الانتهاء الجديد (YYYY-MM-DD):', (acc.plan && acc.plan.endDate) || '');
    if (!newEnd) return;
    await update(ref(db, `accounts/${phone}/plan`), { endDate: newEnd });
  };

  document.getElementById('btn-add-router').onclick = async () => {
    const routerId = prompt('أدخل معرف الراوتر (Router ID):');
    if (!routerId) return;
    await set(ref(db, `accounts/${phone}/routersID/${routerId}`), true);
  };
}

async function removeRouter(phone, routerId) {
  if (!confirm(`هل أنت متأكد من حذف الراوتر ${routerId}؟`)) return;
  await set(ref(db, `accounts/${phone}/routersID/${routerId}`), null);
}

window.openDetail = openDetail;
window.removeRouter = removeRouter;

init();