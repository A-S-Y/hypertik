import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, getIdTokenResult
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import {
  getDatabase, ref, onValue, update, set, query, limitToLast
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-database.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// Data Cache
let accountsCache = {};
let networksCache = {};
let currentPhone = null;

// DOM Elements
const sidebar = document.getElementById('sidebar');
const mainContent = document.getElementById('main-content');
const loginSection = document.getElementById('login-section');
const navItems = document.querySelectorAll('.nav-item[data-view]');
const themeToggle = document.getElementById('theme-toggle');

// Init
function init() {
  // Navigation
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      showView(item.dataset.view);
    });
  });

  // Login
  document.getElementById('btn-login').addEventListener('click', handleLogin);
  document.getElementById('btn-signout').addEventListener('click', () => signOut(auth));

  // Theme
  themeToggle.addEventListener('click', toggleTheme);
  const savedTheme = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);

  // Modals
  window.closeModal = (id) => document.getElementById(id).style.display = 'none';
  document.getElementById('plan-form').addEventListener('submit', handlePlanSubmit);

  window.showView = showView;
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const target = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', target);
  localStorage.setItem('theme', target);
}

async function handleLogin() {
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value.trim();
  const msg = document.getElementById('login-msg');
  msg.textContent = "جاري الدخول...";
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    msg.textContent = "فشل: " + err.message;
  }
}

function showView(viewId) {
  // Hide all views
  document.querySelectorAll('section[id^="view-"]').forEach(s => s.style.display = 'none');
  // Show target
  const target = document.getElementById(`view-${viewId}`);
  if (target) target.style.display = 'block';

  // Active nav
  navItems.forEach(n => n.classList.toggle('active', n.dataset.view === viewId));

  // Breadcrumbs/Titles
  const titles = { dashboard: 'لوحة التحكم', accounts: 'إدارة الحسابات', 'new-users': 'مستخدمين جدد', networks: 'إدارة الشبكات', employees: 'إدارة الموظفين', logs: 'سجلات النشاط', detail: 'تفاصيل الحساب' };
  document.getElementById('page-title').textContent = titles[viewId] || 'لوحة التحكم';

  if (viewId === 'dashboard') renderDashboard();
  if (viewId === 'networks') renderNetworks();
  if (viewId === 'employees') renderEmployees();
}

// Auth Observer
onAuthStateChanged(auth, async (user) => {
  if (user) {
    const res = await getIdTokenResult(user, true).catch(() => ({ claims: {} }));
    if (!res.claims.admin) {
      alert('لا تملك صلاحيات مسؤول.');
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

let usersCache = {};

function loadData() {
  onValue(ref(db, 'accounts'), (snap) => {
    accountsCache = snap.val() || {};
    renderDashboard();
    renderAccounts();
  });

  onValue(ref(db, 'users'), (snap) => {
    usersCache = snap.val() || {};
    renderNewUsers();
  });

  onValue(ref(db, 'networks'), (snap) => {
    networksCache = snap.val() || {};
    renderNetworks();
  });

  onValue(query(ref(db, 'activities'), limitToLast(50)), (snap) => {
    renderLogs(snap.val() || {});
  });
}

// Rendering Logic
function renderDashboard() {
  const accs = Object.values(accountsCache);
  const usrs = Object.values(usersCache);
  document.getElementById('stat-total').textContent = accs.length;
  document.getElementById('stat-active').textContent = accs.filter(a => a.isActive).length;
  document.getElementById('stat-premium').textContent = accs.filter(a => a.isPremium).length;

  const tbody = document.querySelector('#recent-networks-table tbody');
  tbody.innerHTML = '';
  Object.entries(networksCache).slice(0, 5).forEach(([id, net]) => {
    const row = `<tr><td>${net.name || '---'}</td><td>${net.ownerPhone || '---'}</td><td>${net.routers ? Object.keys(net.routers).length : 0}</td><td>${Object.values(net.routers || {})[0]?.ip || '---'}</td></tr>`;
    tbody.innerHTML += row;
  });
}

function renderAccounts() {
  const tbody = document.querySelector('#accounts-table tbody');
  const queryVal = document.getElementById('acc-search').value.toLowerCase();
  tbody.innerHTML = '';
  Object.entries(accountsCache).forEach(([phone, acc]) => {
    if (queryVal && !(`${phone} ${acc.name} ${acc.networkName}`.toLowerCase().includes(queryVal))) return;
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${phone}</td>
      <td>${acc.name || '---'}</td>
      <td>${acc.networkName || '---'}</td>
      <td><span class="badge badge-primary">${acc.plan?.name || 'بدون'}</span></td>
      <td><span class="badge ${acc.isActive ? 'badge-success' : 'badge-danger'}">${acc.isActive ? 'نشط' : 'معطل'}</span></td>
      <td><button class="glass" onclick="openDetail('${phone}')">إدارة</button></td>
    `;
    tbody.appendChild(row);
  });
}

document.getElementById('acc-search').addEventListener('input', renderAccounts);

function renderNewUsers() {
  const tbody = document.querySelector('#new-users-table tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  Object.entries(usersCache).forEach(([deviceId, user]) => {
    // Only show if not already an "Account" (checking by phone if exists or if it's just a raw visitor)
    const isAccount = Object.keys(accountsCache).some(p => p === user.phone);

    tbody.innerHTML += `<tr>
            <td style="font-size:12px">${deviceId}</td>
            <td style="font-weight:600">${user.name || 'زائر جديد'}</td>
            <td>${user.firstLogin?.split(' ')[0] || '---'}</td>
            <td>
                <button class="btn-primary" style="padding:6px 12px; font-size:12px;" onclick="convertUserToAccount('${deviceId}')">تفعيل كحساب</button>
            </td>
        </tr>`;
  });
}

function renderNetworks() {
  const tbody = document.querySelector('#networks-table tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  Object.entries(networksCache).forEach(([id, net]) => {
    const routers = net.routers ? Object.values(net.routers) : [];
    tbody.innerHTML += `<tr>
            <td>${id}</td>
            <td style="font-weight:600">${net.name || '---'}</td>
            <td>${net.ownerPhone || '---'}</td>
            <td>${routers[0]?.ip || '---'}</td>
            <td>${routers.length}</td>
        </tr>`;
  });
}

function renderEmployees() {
  const tbody = document.querySelector('#employees-table tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  Object.entries(accountsCache).forEach(([phone, acc]) => {
    if (acc.employees) {
      Object.values(acc.employees).forEach(emp => {
        tbody.innerHTML += `<tr>
                    <td>${emp.name}</td>
                    <td>${emp.id}</td>
                    <td>${phone} (${acc.name || '---'})</td>
                    <td>${Object.keys(emp.permissions || {}).length} صلاحيات</td>
                </tr>`;
      });
    }
  });
}

function renderLogs(logs) {
  const tbody = document.querySelector('#logs-table tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  const flat = [];
  Object.entries(logs).forEach(([dev, devLogs]) => {
    Object.values(devLogs).forEach(l => flat.push({ ...l, deviceId: dev }));
  });
  flat.sort((a, b) => new Date(b.timestamp || b.time) - new Date(a.timestamp || a.time))
    .slice(0, 50).forEach(l => {
      tbody.innerHTML += `<tr><td>${(l.timestamp || l.time || '').split('.')[0]}</td><td><span class="badge badge-primary">${l.action || l.type || 'إجراء'}</span></td><td>${l.details || '---'}</td><td>${l.deviceId}</td></tr>`;
    });
}

// Detail View
window.openDetail = (phone) => {
  currentPhone = phone;
  const acc = accountsCache[phone];
  showView('detail');
  document.getElementById('det-name').textContent = acc.name || 'بدون اسم';
  document.getElementById('det-phone').textContent = phone;

  const actBtn = document.getElementById('btn-toggle-active');
  actBtn.className = acc.isActive ? 'btn-primary badge-danger' : 'btn-primary badge-success';
  actBtn.textContent = acc.isActive ? 'تعطيل الحساب' : 'تفعيل الحساب';
  actBtn.onclick = () => update(ref(db, `accounts/${phone}`), { isActive: !acc.isActive });

  document.getElementById('btn-open-plan').onclick = () => openPlanModal(acc.plan || {});

  // Routers
  const rList = document.getElementById('det-routers');
  rList.innerHTML = '';
  if (acc.routersID) Object.keys(acc.routersID).forEach(rid => {
    rList.innerHTML += `<li class="glass" style="margin-bottom:8px; padding:10px; display:flex; justify-content:space-between;">${rid} <button style="color:red; background:none;" onclick="removeRouter('${phone}', '${rid}')">🗑️</button></li>`;
  });

  // Employees
  const eList = document.getElementById('det-employees');
  eList.innerHTML = '';
  if (acc.employees) Object.values(acc.employees).forEach(emp => {
    eList.innerHTML += `<li class="glass" style="margin-bottom:8px; padding:10px;">${emp.name} (${emp.id})</li>`;
  });
};

window.removeRouter = (phone, rid) => {
  if (confirm('هل أنت متأكد؟')) set(ref(db, `accounts/${phone}/routersID/${rid}`), null);
};

async function convertUserToAccount(deviceId) {
  const user = usersCache[deviceId];
  if (!user) return;

  const phone = prompt('أدخل رقم الهاتف لربطه بهذا الجهاز:', user.phone || '');
  if (!phone) return;

  if (accountsCache[phone]) {
    if (!confirm('هذا الحساب موجود بالفعل. هل تريد إضافة هذا الجهاز إليه؟')) return;
    await set(ref(db, `accounts/${phone}/routersID/${deviceId}`), true);
  } else {
    const name = prompt('أدخل اسم صاحب الحساب:', user.name || '');
    const newAcc = {
      phone: phone,
      name: name,
      createdAt: new Date().toISOString().replace('T', ' ').split('.')[0],
      isActive: true,
      isPremium: false,
      routersID: { [deviceId]: true },
      plan: user.trialPlan || { name: 'تجريبي', type: 'trial', endDate: '2026-01-30' }
    };
    await set(ref(db, `accounts/${phone}`), newAcc);
  }
  alert('تم تفعيل الحساب بنجاح');
}

window.convertUserToAccount = convertUserToAccount;

// Plan Modal
function openPlanModal(plan) {
  const modal = document.getElementById('modal-plan');
  const form = document.getElementById('plan-form');
  modal.style.display = 'flex';

  // Fill fields
  const fields = ['name', 'type', 'startDate', 'endDate', 'maxRouters', 'maxDevices', 'maxExports', 'maxFetches'];
  fields.forEach(f => {
    form.elements[f].value = plan[f] || '';
  });
  form.elements.allowMultiAccess.checked = !!plan.allowMultiAccess;
}

async function handlePlanSubmit(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const plan = {};
  fd.forEach((val, key) => {
    if (['maxRouters', 'maxDevices', 'maxExports', 'maxFetches'].includes(key)) {
      plan[key] = parseInt(val) || 0;
    } else {
      plan[key] = val;
    }
  });
  plan.allowMultiAccess = e.target.elements.allowMultiAccess.checked;

  try {
    await update(ref(db, `accounts/${currentPhone}/plan`), plan);
    alert('تم تحديث الخطة بنجاح');
    closeModal('modal-plan');
  } catch (err) {
    alert('خطأ: ' + err.message);
  }
}

init();