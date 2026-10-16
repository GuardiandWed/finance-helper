// Telegram WebApp Initialization
// Все запросы к /api получают PIN-токен; при 401 экран блокируется
const _origFetch = window.fetch.bind(window);
window.fetch = async (url, opts = {}) => {
  const isApi = typeof url === 'string' && url.startsWith('/api/') && !url.startsWith('/api/auth/') && !url.startsWith('/api/health');
  if (isApi) opts.headers = { ...(opts.headers || {}), 'X-Pin-Token': localStorage.getItem('finance_pin_token') || '' };
  const res = await _origFetch(url, opts);
  if (isApi && res.status === 401) lockScreenNow();
  return res;
};

const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  if (tg.enableClosingConfirmation) {
    tg.enableClosingConfirmation();
  }
}

function triggerHaptic(type = 'light') {
  if (tg?.HapticFeedback) {
    if (type === 'success') tg.HapticFeedback.notificationOccurred('success');
    else if (type === 'warning') tg.HapticFeedback.notificationOccurred('warning');
    else tg.HapticFeedback.impactOccurred(type);
  }
}

// Global State
let currentTab = 'home'; // 'home' | 'expenses' | 'incomes' | 'plans' | 'analytics'
let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth() + 1; // 1-12
let currentHalf = 0; // 0 = all month, 1 = 1-15, 2 = 16-end

let enteredPin = '';

let activeModalType = 'expense';
let categories = [];
let selectedCategory = null;
let allTransactions = [];
let allPlannedPurchases = [];
let selectedExpenseFilter = 'ALL';
let currentPlansFilter = 'pending';
let selectedPlanPriority = 'medium';
let selectedPlanCategory = null;
let chartInstance = null;

const monthNames = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
];

document.addEventListener('DOMContentLoaded', () => {
  initPinLock();
  initMonthSelector();
  initPeriodButtons();
});

// ----------------- PIN LOCK SCREEN -----------------
function initPinLock() {
  if (localStorage.getItem('finance_pin_token')) unlockApp(true);
  else lockScreenNow();
  // Ввод с физической клавиатуры (Telegram Desktop / Web)
  document.addEventListener('keydown', e => {
    if (document.getElementById('pin-lock-screen').classList.contains('hidden')) return;
    if (/^[0-9]$/.test(e.key)) pressPinKey(e.key);
    else if (e.key === 'Backspace') backspacePinKey();
    else if (e.key === 'Escape') clearPinKey();
  });
}

function updatePinDots() {
  const dots = document.querySelectorAll('#pin-dots div');
  dots.forEach((dot, idx) => {
    if (idx < enteredPin.length) {
      dot.className = "w-3.5 h-3.5 rounded-full bg-sky-400 border border-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.6)] transition-all";
    } else {
      dot.className = "w-3.5 h-3.5 rounded-full border border-slate-700 bg-slate-900 transition-all";
    }
  });
}

function pressPinKey(digit) {
  triggerHaptic('light');
  if (enteredPin.length < 6) {
    enteredPin += digit;
    updatePinDots();
  }
  if (enteredPin.length === 6) {
    checkPin();
  }
}

function clearPinKey() {
  triggerHaptic('light');
  enteredPin = '';
  updatePinDots();
  document.getElementById('pin-error').classList.add('hidden');
}

function backspacePinKey() {
  triggerHaptic('light');
  enteredPin = enteredPin.slice(0, -1);
  updatePinDots();
  document.getElementById('pin-error').classList.add('hidden');
}

let pinChecking = false;
async function checkPin() {
  if (pinChecking) return;
  pinChecking = true;
  const pin = enteredPin;
  try {
    const res = await _origFetch('/api/auth/verify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin })
    });
    const data = await res.json();
    if (data.success) {
      triggerHaptic('success');
      localStorage.setItem('finance_pin_token', data.token);
      unlockApp();
      return;
    }
  } catch (e) { console.error(e); }
  finally { pinChecking = false; }
  triggerHaptic('warning');
  document.getElementById('pin-error').classList.remove('hidden');
  enteredPin = '';
  updatePinDots();
}

function unlockApp(instant = false) {
  enteredPin = '';
  updatePinDots();
  const lock = document.getElementById('pin-lock-screen');
  if (instant) lock.classList.add('hidden');
  else {
    lock.classList.add('opacity-0', 'pointer-events-none');
    setTimeout(() => lock.classList.add('hidden'), 300);
  }
  refreshAllData();
}

function lockScreenNow() {
  triggerHaptic('medium');
  enteredPin = '';
  updatePinDots();
  const lock = document.getElementById('pin-lock-screen');
  lock.classList.remove('hidden', 'opacity-0', 'pointer-events-none');
  localStorage.removeItem('finance_pin_token');
  closeAdminModal();
}

// ----------------- MONTH & HALF SELECTOR -----------------
function initMonthSelector() {
  const select = document.getElementById('period-month-select');
  select.innerHTML = '';
  
  const now = new Date();
  const y = now.getFullYear();

  // Добавляем месяцы текущего года +- пару соседних
  for (let m = 1; m <= 12; m++) {
    const opt = document.createElement('option');
    opt.value = `${y}-${m}`;
    opt.textContent = `${monthNames[m - 1]} ${y}`;
    if (m === currentMonth) opt.selected = true;
    select.appendChild(opt);
  }

  updateHeaderLabels();
}

function updateHeaderLabels() {
  const label = `${monthNames[currentMonth - 1]} ${currentYear}`;
  const headerPeriod = document.getElementById('header-period-label');
  if (headerPeriod) headerPeriod.textContent = label;
}

function changeSelectedMonth(val) {
  triggerHaptic('light');
  const [y, m] = val.split('-').map(Number);
  currentYear = y;
  currentMonth = m;
  updateHeaderLabels();
  refreshAllData();
}

function initPeriodButtons() {
  setPeriodHalf(0);
}

function setPeriodHalf(half) {
  triggerHaptic('light');
  currentHalf = half;

  for (let i = 0; i <= 2; i++) {
    const btn = document.getElementById(`period-half-${i}`);
    if (i === half) {
      btn.className = "flex-1 py-1 rounded-lg text-white bg-slate-800 shadow transition text-center";
    } else {
      btn.className = "flex-1 py-1 rounded-lg text-slate-400 hover:text-white transition text-center";
    }
  }

  const periodTitles = {
    0: 'Весь месяц',
    1: '1-я половина (1-15)',
    2: '2-я половина (16-конец)'
  };
  const homePeriodTitle = document.getElementById('home-period-title');
  const analyticsPeriodTitle = document.getElementById('analytics-period-title');
  if (homePeriodTitle) homePeriodTitle.textContent = `Баланс (${periodTitles[half]})`;
  if (analyticsPeriodTitle) analyticsPeriodTitle.textContent = `${monthNames[currentMonth - 1]} • ${periodTitles[half]}`;

  refreshAllData();
}

// ----------------- NAVIGATION -----------------
function navigateToTab(tab) {
  triggerHaptic('light');
  currentTab = tab;

  const screens = ['home', 'expenses', 'incomes', 'plans', 'analytics'];
  screens.forEach(s => {
    const el = document.getElementById(`screen-${s}`);
    const navBtn = document.getElementById(`nav-btn-${s}`);
    if (s === tab) {
      el.classList.remove('hidden');
      navBtn.classList.add('tab-active');
    } else {
      el.classList.add('hidden');
      navBtn.classList.remove('tab-active');
    }
  });

  if (tab === 'analytics') renderAnalytics();
  else if (tab === 'expenses') renderExpensesScreen();
  else if (tab === 'incomes') renderIncomesScreen();
  else if (tab === 'plans') renderPlansScreen();
  else if (tab === 'home') renderHomeScreen();
}

// ----------------- DATA LOADING -----------------
async function refreshAllData() {
  await Promise.all([loadStats(), loadTransactions(), loadPlannedPurchases()]);
}

async function loadStats() {
  try {
    const res = await fetch(`/api/stats?year=${currentYear}&month=${currentMonth}&half=${currentHalf}`);
    if (!res.ok) return;
    const data = await res.json();

    document.getElementById('home-total-expense').textContent = `${data.total_expense.toFixed(2)} €`;
    document.getElementById('home-total-income').textContent = `${data.total_income.toFixed(2)} €`;
    
    const netEl = document.getElementById('home-net-savings');
    netEl.textContent = `${data.net_savings > 0 ? '+' : ''}${data.net_savings.toFixed(2)} €`;
    netEl.className = data.net_savings >= 0 
      ? "text-3xl sm:text-4xl font-black tracking-tight mt-1.5 text-emerald-400"
      : "text-3xl sm:text-4xl font-black tracking-tight mt-1.5 text-rose-400";

    const savingsRateEl = document.getElementById('savings-rate');
    if (data.total_income > 0) {
      const rate = Math.round((data.net_savings / data.total_income) * 100);
      savingsRateEl.textContent = `${rate >= 0 ? '+' : ''}${rate}% сбережений`;
    } else {
      savingsRateEl.textContent = '0%';
    }

    document.getElementById('expenses-screen-total').textContent = `${data.total_expense.toFixed(2)} €`;
    document.getElementById('incomes-screen-total').textContent = `${data.total_income.toFixed(2)} €`;
    document.getElementById('home-daily-avg').textContent = `${data.daily_average.toFixed(2)} €`;

    // Runway days
    const runwayEl = document.getElementById('home-runway-days');
    if (data.runway_days !== null && data.runway_days !== undefined) {
      runwayEl.textContent = `~${data.runway_days} дн.`;
    } else {
      runwayEl.textContent = '∞ дн.';
    }

    window.statsData = data;
    updatePlansCoverage();
  } catch (err) {
    console.error('Stats error:', err);
  }
}

async function loadTransactions() {
  try {
    const res = await fetch(`/api/transactions?year=${currentYear}&month=${currentMonth}&half=${currentHalf}&limit=100`);
    if (!res.ok) return;
    allTransactions = await res.json();

    renderHomeScreen();
    renderExpensesScreen();
    renderIncomesScreen();
  } catch (err) {
    console.error('Transactions error:', err);
  }
}

async function loadPlannedPurchases() {
  try {
    const res = await fetch('/api/planned-purchases');
    if (!res.ok) return;
    allPlannedPurchases = await res.json();

    const pending = allPlannedPurchases.filter(p => !p.is_completed);
    const sum = pending.reduce((acc, p) => acc + p.estimated_amount, 0);
    
    document.getElementById('plans-screen-total').textContent = `${sum.toFixed(2)} €`;
    document.getElementById('home-planned-summary').textContent = `${pending.length} товаров на сумму ${sum.toFixed(2)} €`;

    updatePlansCoverage();
    renderPlansScreen();
  } catch (err) {
    console.error('Plans error:', err);
  }
}

function updatePlansCoverage() {
  if (!window.statsData) return;
  const netSavings = window.statsData.net_savings;
  const pending = allPlannedPurchases.filter(p => !p.is_completed);
  const plannedSum = pending.reduce((acc, p) => acc + p.estimated_amount, 0);
  const remaining = netSavings - plannedSum;

  const badge = document.getElementById('plans-coverage-badge');
  const text = document.getElementById('plans-coverage-text');

  if (remaining >= 0) {
    badge.className = "px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400";
    badge.textContent = "Хватает";
    text.textContent = `Остаток после всех покупок составит: +${remaining.toFixed(2)} €`;
  } else {
    badge.className = "px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-400";
    badge.textContent = "Дефицит";
    text.textContent = `Не хватает: ${Math.abs(remaining).toFixed(2)} € от текущего баланса`;
  }
}

// ----------------- RENDER SCREENS -----------------
function renderHomeScreen() {
  const container = document.getElementById('home-tx-list');
  if (!allTransactions.length) {
    container.innerHTML = `
      <div class="p-8 text-center bg-cardDark/50 rounded-3xl border border-borderDark/60 text-slate-500">
        <div class="text-3xl mb-1.5">🛒</div>
        <div class="text-sm font-semibold text-slate-300">Нет операций за период</div>
        <div class="text-xs text-slate-500 mt-0.5">Внесите первую покупку или доход выше</div>
      </div>
    `;
    return;
  }
  container.innerHTML = allTransactions.slice(0, 6).map(tx => renderTxCard(tx)).join('');
}

function renderExpensesScreen() {
  const container = document.getElementById('expenses-full-list');
  const countEl = document.getElementById('expenses-list-count');
  const chipsContainer = document.getElementById('expense-filter-chips');

  const expenses = allTransactions.filter(t => t.type === 'expense');
  countEl.textContent = `${expenses.length} трат`;

  const uniqueCats = ['ALL', ...new Set(expenses.map(e => e.category_name))];
  chipsContainer.innerHTML = uniqueCats.map(cat => {
    const isSelected = selectedExpenseFilter === cat;
    return `
      <button data-cat="${escapeHtml(cat)}" onclick="setExpenseFilter(this.dataset.cat)" class="px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition border ${
        isSelected 
          ? 'bg-rose-500/20 text-rose-300 border-rose-500/50 shadow-sm' 
          : 'bg-cardDark text-slate-400 border-borderDark hover:text-white'
      }">
        ${cat === 'ALL' ? '⚡ Все' : escapeHtml(cat)}
      </button>
    `;
  }).join('');

  const filtered = selectedExpenseFilter === 'ALL' 
    ? expenses 
    : expenses.filter(e => e.category_name === selectedExpenseFilter);

  if (!filtered.length) {
    container.innerHTML = `<div class="p-8 text-center bg-cardDark/50 rounded-3xl border border-borderDark/60 text-slate-500 text-xs">В этой категории пока нет расходов</div>`;
    return;
  }
  container.innerHTML = filtered.map(tx => renderTxCard(tx)).join('');
}

function setExpenseFilter(cat) {
  triggerHaptic('light');
  selectedExpenseFilter = cat;
  renderExpensesScreen();
}

function renderIncomesScreen() {
  const container = document.getElementById('incomes-full-list');
  const countEl = document.getElementById('incomes-list-count');
  const incomes = allTransactions.filter(t => t.type === 'income');
  countEl.textContent = `${incomes.length} поступлений`;

  if (!incomes.length) {
    container.innerHTML = `
      <div class="p-8 text-center bg-cardDark/50 rounded-3xl border border-borderDark/60 text-slate-500">
        <div class="text-3xl mb-1.5">💼</div>
        <div class="text-sm font-semibold text-slate-300">Доходы не внесены</div>
      </div>
    `;
    return;
  }
  container.innerHTML = incomes.map(tx => renderTxCard(tx)).join('');
}

function renderTxCard(tx) {
  const isExpense = tx.type === 'expense';
  const dateStr = new Date(tx.date).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });

  return `
    <div class="flex items-center justify-between p-3.5 bg-cardDark/80 rounded-2xl border border-borderDark/80 hover:border-slate-700 transition">
      <div class="flex items-center space-x-3 min-w-0">
        <div class="w-10 h-10 rounded-2xl ${isExpense ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'} flex items-center justify-center text-lg flex-shrink-0 shadow-sm">
          ${tx.category_icon || '💰'}
        </div>
        <div class="min-w-0">
          <div class="text-sm font-bold text-white truncate">${escapeHtml(tx.category_name)}</div>
          <div class="text-[11px] text-slate-400 flex items-center space-x-1 truncate mt-0.5">
            <span>${dateStr}</span>
            ${tx.comment ? `<span class="text-slate-500">•</span> <span class="truncate text-slate-300 font-medium">${escapeHtml(tx.comment)}</span>` : ''}
          </div>
        </div>
      </div>
      <div class="flex items-center space-x-2.5 flex-shrink-0 ml-2">
        <span class="text-sm font-black ${isExpense ? 'text-white' : 'text-emerald-400'}">
          ${isExpense ? '−' : '+'}${tx.amount.toFixed(2)} €
        </span>
        <button onclick="deleteTx('${tx.id}')" class="text-slate-600 hover:text-rose-400 p-1 text-xs transition">✕</button>
      </div>
    </div>
  `;
}

async function deleteTx(id) {
  if (!confirm('Удалить эту операцию?')) return;
  triggerHaptic('medium');
  try {
    const res = await fetch(`/api/transactions/${id}`, { method: 'DELETE' });
    if (res.ok) {
      await refreshAllData();
      if (currentTab === 'analytics') renderAnalytics();
    }
  } catch (err) {
    console.error('Delete error:', err);
  }
}

// ----------------- PLANS (WISHLIST) SCREEN -----------------
function setPlansFilter(status) {
  triggerHaptic('light');
  currentPlansFilter = status;
  const btnPending = document.getElementById('plans-filter-pending');
  const btnCompleted = document.getElementById('plans-filter-completed');

  if (status === 'pending') {
    btnPending.className = "flex-1 py-1.5 rounded-lg text-white bg-slate-800 shadow transition text-center";
    btnCompleted.className = "flex-1 py-1.5 rounded-lg text-slate-400 hover:text-white transition text-center";
  } else {
    btnCompleted.className = "flex-1 py-1.5 rounded-lg text-white bg-slate-800 shadow transition text-center";
    btnPending.className = "flex-1 py-1.5 rounded-lg text-slate-400 hover:text-white transition text-center";
  }
  renderPlansScreen();
}

function renderPlansScreen() {
  const container = document.getElementById('plans-full-list');
  const countEl = document.getElementById('plans-list-count');
  
  const isPending = currentPlansFilter === 'pending';
  const filtered = allPlannedPurchases.filter(p => isPending ? !p.is_completed : p.is_completed);
  countEl.textContent = `${filtered.length} позиций`;

  if (!filtered.length) {
    container.innerHTML = `
      <div class="p-8 text-center bg-cardDark/50 rounded-3xl border border-borderDark/60 text-slate-500">
        <div class="text-3xl mb-1.5">${isPending ? '🎯' : '✅'}</div>
        <div class="text-sm font-semibold text-slate-300">${isPending ? 'Все планы выполнены!' : 'Пока нет завершенных покупок'}</div>
        <div class="text-xs text-slate-500 mt-0.5">${isPending ? 'Добавьте новую цель кнопкой «+ В план»' : ''}</div>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(p => {
    const prioBadges = {
      high: '<span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">🔥 Срочно</span>',
      medium: '<span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">👌 Средний</span>',
      low: '<span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-700/50 text-slate-300">🌱 Не к спеху</span>',
    };

    return `
      <div class="p-4 bg-cardDark rounded-2xl border border-borderDark space-y-3 shadow-md">
        <div class="flex justify-between items-start">
          <div class="flex items-center space-x-3">
            <div class="w-10 h-10 rounded-2xl bg-purple-500/15 text-purple-300 border border-purple-500/30 flex items-center justify-center text-lg">
              ${p.category_icon || '🛒'}
            </div>
            <div>
              <div class="text-sm font-bold text-white">${escapeHtml(p.title)}</div>
              <div class="text-[11px] text-slate-400 flex items-center space-x-1.5 mt-0.5">
                <span>${p.category_name}</span>
                <span>•</span>
                ${prioBadges[p.priority] || ''}
              </div>
            </div>
          </div>
          <div class="text-right">
            <div class="text-base font-black text-white">${p.estimated_amount.toFixed(2)} €</div>
          </div>
        </div>

        ${!p.is_completed ? `
          <div class="flex space-x-2 pt-1 border-t border-borderDark/60">
            <button onclick="convertPlanToExpense('${p.id}')" class="btn-press flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center space-x-1 shadow-md shadow-emerald-600/20">
              <span>✅</span>
              <span>Куплено! Списать</span>
            </button>
            <button onclick="deletePlan('${p.id}')" class="btn-press px-3 py-2 rounded-xl bg-slate-800 text-slate-400 hover:text-rose-400 text-xs font-semibold">
              Удалить
            </button>
          </div>
        ` : `
          <div class="text-[11px] text-emerald-400 font-semibold flex items-center gap-1 pt-1 border-t border-borderDark/60">
            <span>✓ Куплено и внесено в расходы</span>
          </div>
        `}
      </div>
    `;
  }).join('');
}

async function convertPlanToExpense(id) {
  const plan = allPlannedPurchases.find(p => p.id === id);
  if (!plan) return;
  const estimatedAmount = plan.estimated_amount, title = plan.title;
  triggerHaptic('medium');
  const input = prompt(`Подтвердите фактическую сумму покупки в евро (€):`, estimatedAmount);
  if (input === null) return;
  const actualAmount = parseFloat(input) || estimatedAmount;

  try {
    const res = await fetch(`/api/planned-purchases/${id}/convert-to-expense`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actual_amount: actualAmount, comment: `Куплено по плану: ${title}` })
    });
    if (res.ok) {
      triggerHaptic('success');
      await refreshAllData();
    }
  } catch (err) {
    console.error('Convert plan error:', err);
  }
}

async function deletePlan(id) {
  if (!confirm('Удалить эту покупку из плана?')) return;
  triggerHaptic('medium');
  try {
    const res = await fetch(`/api/planned-purchases/${id}`, { method: 'DELETE' });
    if (res.ok) await refreshAllData();
  } catch (err) {
    console.error('Delete plan error:', err);
  }
}

// ----------------- ANALYTICS SCREEN -----------------
function renderAnalytics() {
  const data = window.statsData;
  const chartEl = document.getElementById('expenseChart');
  const noChartEl = document.getElementById('no-chart-data');
  const breakdownEl = document.getElementById('analytics-categories-breakdown');

  if (!data || !data.categories_breakdown || !data.categories_breakdown.length) {
    chartEl.classList.add('hidden');
    noChartEl.classList.remove('hidden');
    breakdownEl.innerHTML = '<div class="text-center py-6 text-slate-500 text-xs">Нет данных о расходах за этот период</div>';
    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }
    return;
  }

  chartEl.classList.remove('hidden');
  noChartEl.classList.add('hidden');

  const labels = data.categories_breakdown.map(c => `${c.category_icon} ${c.category_name}`);
  const amounts = data.categories_breakdown.map(c => c.total);
  const palette = [
    '#F43F5E', '#FB923C', '#FBBF24', '#34D399', '#38BDF8', 
    '#818CF8', '#C084FC', '#F472B6', '#94A3B8'
  ];

  if (chartInstance) chartInstance.destroy();

  chartInstance = new Chart(chartEl, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: amounts,
        backgroundColor: palette.slice(0, amounts.length),
        borderWidth: 2,
        borderColor: '#131A26',
        hoverOffset: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            boxWidth: 10,
            color: '#94A3B8',
            font: { size: 10, weight: '600' }
          }
        }
      },
      cutout: '72%'
    }
  });

  breakdownEl.innerHTML = data.categories_breakdown.map((c, i) => `
    <div class="p-3 bg-cardDark rounded-2xl border border-borderDark space-y-1.5 shadow-sm">
      <div class="flex justify-between items-center text-xs">
        <span class="font-bold text-slate-200 flex items-center gap-1.5">
          <span>${c.category_icon}</span>
          <span>${c.category_name}</span>
        </span>
        <span class="font-black text-white">${c.total.toFixed(2)} € <span class="text-slate-400 font-semibold text-[11px]">(${c.percentage}%)</span></span>
      </div>
      <div class="w-full bg-bgDark h-2 rounded-full overflow-hidden">
        <div class="h-full rounded-full transition-all duration-500" style="width: ${c.percentage}%; background-color: ${palette[i % palette.length]};"></div>
      </div>
    </div>
  `).join('');
}

// ----------------- MODAL: TRANSACTION -----------------
async function openTransactionModal(type) {
  triggerHaptic('medium');
  activeModalType = type;
  selectedCategory = null;

  const modal = document.getElementById('modal-tx');
  const title = document.getElementById('modal-title');
  const badge = document.getElementById('modal-type-badge');
  const saveBtn = document.getElementById('save-tx-btn');
  const amountInput = document.getElementById('tx-amount');
  const commentInput = document.getElementById('tx-comment');

  amountInput.value = '';
  commentInput.value = '';

  if (type === 'expense') {
    title.textContent = 'Внести расход';
    badge.textContent = '💸';
    saveBtn.className = "btn-press w-full py-4 rounded-2xl bg-rose-600 hover:bg-rose-500 font-extrabold text-white text-base shadow-xl shadow-rose-600/30 transition";
  } else {
    title.textContent = 'Внести доход';
    badge.textContent = '💰';
    saveBtn.className = "btn-press w-full py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 font-extrabold text-white text-base shadow-xl shadow-emerald-600/30 transition";
  }

  modal.classList.remove('hidden');
  modal.classList.add('flex');
  setTimeout(() => amountInput.focus(), 150);

  await loadCategoriesForModal(type);
}

function closeTransactionModal() {
  triggerHaptic('light');
  const modal = document.getElementById('modal-tx');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
  document.getElementById('new-cat-container').classList.add('hidden');
}

async function loadCategoriesForModal(type) {
  try {
    const res = await fetch(`/api/categories?type=${type}`);
    categories = await res.json();
    renderCategoriesGrid();
  } catch (err) {
    console.error('Categories error:', err);
  }
}

function renderCategoriesGrid() {
  const grid = document.getElementById('categories-grid');
  grid.innerHTML = '';

  categories.forEach((cat, index) => {
    const isSelected = selectedCategory?.id === cat.id || (!selectedCategory && index === 0);
    if (isSelected && !selectedCategory) selectedCategory = cat;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `p-2.5 rounded-2xl flex flex-col items-center justify-center space-y-1 transition border ${
      isSelected 
        ? 'bg-sky-500/25 border-sky-400 text-white shadow-md' 
        : 'bg-bgDark border-borderDark text-slate-300 hover:bg-cardDark'
    }`;
    btn.innerHTML = `
      <span class="text-xl">${cat.icon || '💰'}</span>
      <span class="text-[11px] font-semibold leading-tight truncate max-w-full text-center">${cat.name}</span>
    `;
    btn.onclick = () => {
      triggerHaptic('light');
      selectedCategory = cat;
      renderCategoriesGrid();
    };
    grid.appendChild(btn);
  });
}

function toggleNewCategoryInput() {
  triggerHaptic('light');
  document.getElementById('new-cat-container').classList.toggle('hidden');
}

async function saveNewCategory() {
  const name = document.getElementById('new-cat-name').value.trim();
  const emoji = document.getElementById('new-cat-emoji').value.trim() || '📦';
  if (!name) return alert('Введите название категории');

  try {
    const res = await fetch('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name, type: activeModalType, icon: emoji })
    });
    if (res.ok) {
      triggerHaptic('success');
      document.getElementById('new-cat-name').value = '';
      document.getElementById('new-cat-container').classList.add('hidden');
      await loadCategoriesForModal(activeModalType);
    }
  } catch (err) {
    console.error('Save category error:', err);
  }
}

async function saveTransaction() {
  const amountStr = document.getElementById('tx-amount').value.trim();
  const amount = parseFloat(amountStr);
  const comment = document.getElementById('tx-comment').value.trim();

  if (!amount || isNaN(amount) || amount <= 0) {
    triggerHaptic('warning');
    alert('Пожалуйста, введите сумму в евро');
    return;
  }

  if (!selectedCategory) {
    alert('Выберите категорию');
    return;
  }

  const payload = {
    type: activeModalType,
    amount: amount,
    category_name: selectedCategory.name,
    category_icon: selectedCategory.icon || '💰',
    comment: comment
  };

  try {
    const res = await fetch('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      triggerHaptic('success');
      closeTransactionModal();
      await refreshAllData();
      if (currentTab === 'analytics') renderAnalytics();
    }
  } catch (err) {
    console.error('Error saving tx:', err);
  }
}

// ----------------- MODAL: PLAN PURCHASE -----------------
async function openPlanModal() {
  triggerHaptic('medium');
  document.getElementById('plan-title').value = '';
  document.getElementById('plan-amount').value = '';
  selectPlanPriority('medium');

  const modal = document.getElementById('modal-plan');
  modal.classList.remove('hidden');
  modal.classList.add('flex');

  // Load expense categories
  try {
    const res = await fetch('/api/categories?type=expense');
    const cats = await res.json();
    const grid = document.getElementById('plan-categories-grid');
    grid.innerHTML = '';
    selectedPlanCategory = cats[0] || null;

    cats.forEach((cat, idx) => {
      const isSel = selectedPlanCategory?.id === cat.id;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `p-2 rounded-xl flex flex-col items-center justify-center space-y-1 transition border ${
        isSel ? 'bg-purple-600/30 border-purple-500 text-white' : 'bg-bgDark border-borderDark text-slate-300'
      }`;
      b.innerHTML = `<span class="text-lg">${cat.icon}</span><span class="text-[10px] truncate max-w-full">${cat.name}</span>`;
      b.onclick = () => {
        triggerHaptic('light');
        selectedPlanCategory = cat;
        openPlanModalRenderCats(cats);
      };
      grid.appendChild(b);
    });
  } catch (e) {
    console.error(e);
  }
}

function openPlanModalRenderCats(cats) {
  const grid = document.getElementById('plan-categories-grid');
  grid.innerHTML = '';
  cats.forEach(cat => {
    const isSel = selectedPlanCategory?.id === cat.id;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `p-2 rounded-xl flex flex-col items-center justify-center space-y-1 transition border ${
      isSel ? 'bg-purple-600/30 border-purple-500 text-white' : 'bg-bgDark border-borderDark text-slate-300'
    }`;
    b.innerHTML = `<span class="text-lg">${cat.icon}</span><span class="text-[10px] truncate max-w-full">${cat.name}</span>`;
    b.onclick = () => {
      triggerHaptic('light');
      selectedPlanCategory = cat;
      openPlanModalRenderCats(cats);
    };
    grid.appendChild(b);
  });
}

function closePlanModal() {
  triggerHaptic('light');
  const modal = document.getElementById('modal-plan');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

function selectPlanPriority(prio) {
  triggerHaptic('light');
  selectedPlanPriority = prio;
  const prios = ['high', 'medium', 'low'];
  prios.forEach(p => {
    const el = document.getElementById(`plan-prio-${p}`);
    if (p === prio) {
      el.className = "py-2.5 rounded-xl border border-purple-500 bg-purple-600 text-white text-xs font-bold transition";
    } else {
      el.className = "py-2.5 rounded-xl border border-slate-700 bg-cardDark text-slate-400 text-xs font-bold transition";
    }
  });
}

async function savePlannedPurchase() {
  const title = document.getElementById('plan-title').value.trim();
  const amount = parseFloat(document.getElementById('plan-amount').value);

  if (!title) return alert('Введите название покупки');
  if (!amount || isNaN(amount) || amount <= 0) return alert('Введите ориентировочную сумму в евро');

  const payload = {
    title: title,
    estimated_amount: amount,
    category_name: selectedPlanCategory ? selectedPlanCategory.name : 'Другое',
    category_icon: selectedPlanCategory ? selectedPlanCategory.icon : '🛒',
    priority: selectedPlanPriority,
    target_month: `${currentYear}-${String(currentMonth).padStart(2, '0')}`
  };

  try {
    const res = await fetch('/api/planned-purchases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      triggerHaptic('success');
      closePlanModal();
      await loadPlannedPurchases();
    }
  } catch (err) {
    console.error('Save plan error:', err);
  }
}

// ----------------- MODAL: ADMIN PANEL -----------------
async function openAdminModal() {
  triggerHaptic('medium');
  const modal = document.getElementById('modal-admin');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  await renderAdminCategories();
}

function closeAdminModal() {
  triggerHaptic('light');
  const modal = document.getElementById('modal-admin');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

async function renderAdminCategories() {
  const listEl = document.getElementById('admin-categories-list');
  try {
    const res = await fetch('/api/categories');
    const cats = await res.json();
    listEl.innerHTML = cats.map(c => `
      <div class="flex items-center justify-between p-2.5 bg-bgDark rounded-xl border border-borderDark text-xs">
        <div class="flex items-center space-x-2">
          <span>${c.icon}</span>
          <span class="font-bold text-slate-200">${c.name}</span>
          <span class="text-[10px] text-slate-500">(${c.type === 'expense' ? 'расход' : 'доход'})</span>
        </div>
        <button onclick="adminDeleteCategory('${c.id}')" class="text-rose-400 hover:text-rose-300 text-xs px-2 py-1 rounded bg-rose-500/10">✕</button>
      </div>
    `).join('');
  } catch (e) {
    console.error(e);
  }
}

async function adminDeleteCategory(id) {
  if (!confirm('Удалить эту категорию?')) return;
  triggerHaptic('medium');
  try {
    const res = await fetch(`/api/admin/categories/${id}`, { method: 'DELETE' });
    if (res.ok) await renderAdminCategories();
  } catch (e) {
    console.error(e);
  }
}

function adminResetToCurrentPeriod() {
  triggerHaptic('success');
  const now = new Date();
  currentYear = now.getFullYear();
  currentMonth = now.getMonth() + 1;
  const select = document.getElementById('period-month-select');
  select.value = `${currentYear}-${currentMonth}`;
  setPeriodHalf(now.getDate() <= 15 ? 1 : 2);
  closeAdminModal();
}

async function adminExportData() {
  triggerHaptic('light');
  try {
    const res = await fetch('/api/admin/export');
    const data = await res.json();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `finance_helper_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    alert('Ошибка экспорта данных: ' + e);
  }
}

function escapeHtml(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
