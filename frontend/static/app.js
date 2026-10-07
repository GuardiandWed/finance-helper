// Telegram WebApp Initialization
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
let currentTab = 'home'; // 'home' | 'expenses' | 'incomes' | 'analytics'
let activeModalType = 'expense';
let categories = [];
let selectedCategory = null;
let allTransactions = [];
let selectedExpenseFilter = 'ALL';
let chartInstance = null;

const monthNames = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
];

document.addEventListener('DOMContentLoaded', () => {
  const now = new Date();
  const periodLabel = `${monthNames[now.getMonth()]} ${now.getFullYear()}`;
  const headerPeriod = document.getElementById('header-period-label');
  const analyticsMonth = document.getElementById('analytics-month-name');
  if (headerPeriod) headerPeriod.textContent = periodLabel;
  if (analyticsMonth) analyticsMonth.textContent = monthNames[now.getMonth()];

  refreshAllData();
});

async function refreshAllData() {
  await Promise.all([loadStats(), loadTransactions()]);
}

// Navigation between 4 Tabs
function navigateToTab(tab) {
  triggerHaptic('light');
  currentTab = tab;

  // Screens
  const screens = ['home', 'expenses', 'incomes', 'analytics'];
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

  if (tab === 'analytics') {
    renderAnalytics();
  } else if (tab === 'expenses') {
    renderExpensesScreen();
  } else if (tab === 'incomes') {
    renderIncomesScreen();
  } else if (tab === 'home') {
    renderHomeScreen();
  }
}

// Load Stats from Backend
async function loadStats() {
  try {
    const res = await fetch('/api/stats');
    if (!res.ok) return;
    const data = await res.json();

    // Home screen values
    document.getElementById('home-total-expense').textContent = `${data.total_expense.toFixed(2)} €`;
    document.getElementById('home-total-income').textContent = `${data.total_income.toFixed(2)} €`;
    
    const netEl = document.getElementById('home-net-savings');
    netEl.textContent = `${data.net_savings > 0 ? '+' : ''}${data.net_savings.toFixed(2)} €`;
    netEl.className = data.net_savings >= 0 
      ? "text-3xl sm:text-4xl font-black tracking-tight mt-1.5 text-emerald-400"
      : "text-3xl sm:text-4xl font-black tracking-tight mt-1.5 text-rose-400";

    // Savings rate
    const savingsRateEl = document.getElementById('savings-rate');
    if (data.total_income > 0) {
      const rate = Math.round((data.net_savings / data.total_income) * 100);
      savingsRateEl.textContent = `${rate >= 0 ? '+' : ''}${rate}% сбережений`;
    } else {
      savingsRateEl.textContent = '0%';
    }

    // Screens subtotals
    document.getElementById('expenses-screen-total').textContent = `${data.total_expense.toFixed(2)} €`;
    document.getElementById('incomes-screen-total').textContent = `${data.total_income.toFixed(2)} €`;

    // Daily average
    const today = new Date().getDate() || 1;
    const dailyAvg = (data.total_expense / today).toFixed(2);
    document.getElementById('home-daily-avg').textContent = `${dailyAvg} €`;

    window.statsData = data;
  } catch (err) {
    console.error('Stats error:', err);
  }
}

// Load Transactions
async function loadTransactions() {
  try {
    const res = await fetch('/api/transactions?limit=100');
    if (!res.ok) return;
    allTransactions = await res.json();

    document.getElementById('home-tx-count').textContent = allTransactions.length;
    renderHomeScreen();
    renderExpensesScreen();
    renderIncomesScreen();
  } catch (err) {
    console.error('Transactions error:', err);
  }
}

// Render Home Screen (Recent 5-7 events)
function renderHomeScreen() {
  const container = document.getElementById('home-tx-list');
  if (!allTransactions.length) {
    container.innerHTML = `
      <div class="p-8 text-center bg-cardDark/50 rounded-3xl border border-borderDark/60 text-slate-500">
        <div class="text-3xl mb-1.5">🛒</div>
        <div class="text-sm font-semibold text-slate-300">Пока нет записей</div>
        <div class="text-xs text-slate-500 mt-0.5">Внесите первую покупку или доход выше</div>
      </div>
    `;
    return;
  }

  const recent = allTransactions.slice(0, 6);
  container.innerHTML = recent.map(tx => renderTxCard(tx)).join('');
}

// Render Expenses Screen
function renderExpensesScreen() {
  const container = document.getElementById('expenses-full-list');
  const countEl = document.getElementById('expenses-list-count');
  const chipsContainer = document.getElementById('expense-filter-chips');

  const expenses = allTransactions.filter(t => t.type === 'expense');
  countEl.textContent = `${expenses.length} трат`;

  // Render category chips
  const uniqueCats = ['ALL', ...new Set(expenses.map(e => e.category_name))];
  chipsContainer.innerHTML = uniqueCats.map(cat => {
    const isSelected = selectedExpenseFilter === cat;
    return `
      <button onclick="setExpenseFilter('${cat}')" class="px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition border ${
        isSelected 
          ? 'bg-rose-500/20 text-rose-300 border-rose-500/50 shadow-sm' 
          : 'bg-cardDark text-slate-400 border-borderDark hover:text-white'
      }">
        ${cat === 'ALL' ? '⚡ Все' : cat}
      </button>
    `;
  }).join('');

  // Filtered list
  const filtered = selectedExpenseFilter === 'ALL' 
    ? expenses 
    : expenses.filter(e => e.category_name === selectedExpenseFilter);

  if (!filtered.length) {
    container.innerHTML = `
      <div class="p-8 text-center bg-cardDark/50 rounded-3xl border border-borderDark/60 text-slate-500">
        <div class="text-xs">В этой категории пока нет расходов</div>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(tx => renderTxCard(tx)).join('');
}

function setExpenseFilter(cat) {
  triggerHaptic('light');
  selectedExpenseFilter = cat;
  renderExpensesScreen();
}

// Render Incomes Screen
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
        <div class="text-xs text-slate-500 mt-0.5">Нажмите «Внести доход» выше</div>
      </div>
    `;
    return;
  }

  container.innerHTML = incomes.map(tx => renderTxCard(tx)).join('');
}

// Helper: Single Transaction Item Component
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
          <div class="text-sm font-bold text-white truncate">${tx.category_name}</div>
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

// Delete Transaction
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

// Render Analytics Chart and Category Breakdown
function renderAnalytics() {
  const data = window.statsData;
  const chartEl = document.getElementById('expenseChart');
  const noChartEl = document.getElementById('no-chart-data');
  const breakdownEl = document.getElementById('analytics-categories-breakdown');

  if (!data || !data.categories_breakdown || !data.categories_breakdown.length) {
    chartEl.classList.add('hidden');
    noChartEl.classList.remove('hidden');
    breakdownEl.innerHTML = '<div class="text-center py-6 text-slate-500 text-xs">Нет данных о расходах</div>';
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

// Modal Handlers
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
      body: JSON.stringify({
        name: name,
        type: activeModalType,
        icon: emoji
      })
    });
    if (res.ok) {
      triggerHaptic('success');
      document.getElementById('new-cat-name').value = '';
      document.getElementById('new-cat-container').classList.add('hidden');
      await loadCategoriesForModal(activeModalType);
    }
  } catch (err) {
    console.error('Error saving category:', err);
  }
}

// Save Transaction
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
    alert('Ошибка при сохранении. Проверьте соединение.');
  }
}

function escapeHtml(string) {
  const el = document.createElement('div');
  el.innerText = string;
  return el.innerHTML;
}
