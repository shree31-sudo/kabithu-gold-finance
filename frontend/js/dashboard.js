(function () {
  const CURRENCY = (v) => '\u20b9' + Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtDate = (d) => (d ? new Date(d + (String(d).length <= 10 ? 'T00:00:00' : '')).toLocaleDateString() : '-');
  const todayISO = () => new Date().toISOString().slice(0, 10);

  let TOKEN = localStorage.getItem('kabithuu_token');
  let SESSION = JSON.parse(localStorage.getItem('kabithuu_user') || 'null');

  // ---------- fixed-length session timeout ----------
  // Session always ends 15 minutes after login, regardless of activity.
  // The expiry timestamp is written once (right after login redirects here)
  // and left untouched until logout/expiry, so it does not reset on clicks,
  // API calls, or page reloads within that window.
  const SESSION_DURATION_MS = 15 * 60 * 1000;
  const SESSION_EXPIRY_KEY = 'kabithuu_session_expires';
  const SESSION_WARNED_KEY = 'kabithuu_session_warned';

  function clearSession() {
    localStorage.removeItem('kabithuu_token');
    localStorage.removeItem('kabithuu_user');
    localStorage.removeItem(SESSION_EXPIRY_KEY);
    localStorage.removeItem(SESSION_WARNED_KEY);
  }
  function endSession(message) {
    clearSession();
    window.location.href = '/'; + (message ? ('?msg=' + encodeURIComponent(message)) : '');
  }

  if (TOKEN && SESSION) {
    let expiresAt = Number(localStorage.getItem(SESSION_EXPIRY_KEY) || 0);
    if (!expiresAt) {
      expiresAt = Date.now() + SESSION_DURATION_MS;
      localStorage.setItem(SESSION_EXPIRY_KEY, String(expiresAt));
    }
    if (Date.now() >= expiresAt) {
      endSession('Your session expired. Please sign in again.');
    } else {
      setInterval(() => {
        const remaining = expiresAt - Date.now();
        if (remaining <= 0) {
          endSession('Your session expired. Please sign in again.');
          return;
        }
        if (remaining <= 60000 && !localStorage.getItem(SESSION_WARNED_KEY)) {
          localStorage.setItem(SESSION_WARNED_KEY, '1');
          showToast('Your session will expire in 1 minute.', true);
        }
      }, 5000);
    }
  }

  let VIEW = 'dashboard';
  let SIDEBAR_OPEN = false;
  let SELECTED_TICKET = null;
  let SELECTED_CUSTOMER = null;
  let TOAST = null;
  let TOAST_ERR = false;
  let TAMIL_MODE = localStorage.getItem('kabithuu_tamil') === '1';

  // ---------- Tamil translation ----------
  // Toggle appends the Tamil word next to the English label, e.g. "Loan / கடன்",
  // rather than replacing it, so staff who know either language can follow along.
  const TA = {
    'Dashboard': 'முகப்பு', 'Customers': 'வாடிக்கையாளர்கள்', 'Customer': 'வாடிக்கையாளர்',
    'Pawn tickets': 'அடகு சீட்டுகள்', 'Pawn ticket': 'அடகு சீட்டு', 'Ticket': 'சீட்டு',
    'Inventory': 'இருப்பு', 'Payments': 'பணம் செலுத்துதல்கள்', 'Payment': 'பணம் செலுத்துதல்',
    'Reports': 'அறிக்கைகள்', 'Staff': 'பணியாளர்கள்', 'Audit log': 'தணிக்கை பதிவு',
    'Settings': 'அமைப்புகள்', 'Sign out': 'வெளியேறு',
    'New pawns': 'புதிய அடகுகள்', 'Redemptions': 'மீட்புகள்', 'Overdue': 'தவணை தாண்டியது',
    'Due soon': 'விரைவில் நிலுவை', 'Total active value': 'மொத்த செயலில் மதிப்பு',
    'Active tickets': 'செயலில் உள்ள சீட்டுகள்', 'Total amount pawned': 'அடகு வைத்த மொத்தத் தொகை',
    'Outstanding balances': 'நிலுவைத் தொகைகள்', "Today's new pawns": 'இன்றைய புதிய அடகுகள்',
    "Today's repayments": 'இன்றைய திருப்பிச் செலுத்துதல்கள்', "Today's redemptions": 'இன்றைய மீட்புகள்',
    'Monthly revenue (interest+fees)': 'மாத வருமானம் (வட்டி+கட்டணம்)', 'Customers ': 'வாடிக்கையாளர்கள்',
    "Today's business": 'இன்றைய வணிகம்', 'Overview': 'மேலோட்டம்', 'Recent transactions': 'சமீபத்திய பரிவர்த்தனைகள்',
    'Date': 'தேதி', 'Amount': 'தொகை', 'Status': 'நிலை', 'ID': 'அடையாள எண்', 'Name': 'பெயர்',
    'Phone': 'தொலைபேசி', 'Type': 'வகை', 'Registered': 'பதிவு செய்யப்பட்டது',
    '+ New customer': '+ புதிய வாடிக்கையாளர்', 'Add New customer': 'புதிய வாடிக்கையாளர் சேர்',
    'Edit customer': 'வாடிக்கையாளரைத் திருத்து', 'Customer ID': 'வாடிக்கையாளர் எண்',
    'Full name': 'முழு பெயர்', 'Customer type': 'வாடிக்கையாளர் வகை', 'Email': 'மின்னஞ்சல்',
    'Address': 'முகவரி', 'Save customer': 'வாடிக்கையாளரைச் சேமி', 'Cancel': 'ரத்து செய்',
    'Individual': 'தனிநபர்', 'Business': 'வணிகம்', 'Active': 'செயலில்',
    'Watchlist': 'கண்காணிப்பு பட்டியல்', 'Blocked': 'தடுக்கப்பட்டது', 'Details': 'விவரங்கள்',
    'Pawn ticket history': 'அடகு சீட்டு வரலாறு', 'Item': 'பொருள்', 'Balance': 'மீதி',
    '+ New pawn ticket': '+ புதிய அடகு சீட்டு', 'New pawn ticket': 'புதிய அடகு சீட்டு',
    'Category': 'வகை', 'Item description': 'பொருள் விவரம்', 'Quantity': 'எண்ணிக்கை',
    'Weight (g)': 'எடை (கிராம்)', 'Purity': 'தூய்மை', 'Estimated market value': 'மதிப்பிடப்பட்ட சந்தை மதிப்பு',
    'Appraised value': 'மதிப்பீட்டு மதிப்பு', 'Pawn / loan amount': 'அடகு / கடன் தொகை',
    'Interest rate (% per period)': 'வட்டி விகிதம் (% ஒரு காலத்திற்கு)', 'Service / admin charge': 'சேவை / நிர்வாகக் கட்டணம்',
    'Expected redemption date': 'எதிர்பார்க்கப்படும் மீட்பு தேதி', 'Condition / remarks': 'நிலை / குறிப்புகள்',
    'Create ticket': 'சீட்டை உருவாக்கு', 'Financials': 'நிதி விவரங்கள்', 'Payment history': 'பணம் செலுத்திய வரலாறு',
    'Ticket QR code': 'சீட்டு QR குறியீடு', 'Description': 'விவரம்', 'Qty': 'எண்ணிக்கை',
    'Weight': 'எடை', 'Market value': 'சந்தை மதிப்பு', 'Pawn amount': 'அடகு தொகை',
    'Interest rate': 'வட்டி விகிதம்', 'Interest amount': 'வட்டித் தொகை', 'Service charge': 'சேவைக் கட்டணம்',
    'Total payable': 'மொத்தம் செலுத்த வேண்டியது', 'Balance remaining': 'மீதமுள்ள தொகை',
    'Date pawned': 'அடகு வைத்த தேதி', 'Redemption due': 'மீட்பு தேதி', 'Processed by': 'செயல்படுத்தியவர்',
    'Record payment': 'பணம் பதிவு செய்', 'Print ticket': 'சீட்டை அச்சிடு',
    'Mark forfeited (authorised)': 'பறிமுதல் என குறி (அங்கீகரிக்கப்பட்டது)', 'Time': 'நேரம்',
    'User': 'பயனர்', 'Action': 'செயல்', 'Record': 'பதிவு', 'Business settings': 'வணிக அமைப்புகள்',
    'Shop name': 'கடை பெயர்', 'Default interest rate (%)': 'இயல்புநிலை வட்டி விகிதம் (%)',
    'Default service charge': 'இயல்புநிலை சேவைக் கட்டணம்', 'Default loan period (days)': 'இயல்புநிலை கடன் காலம் (நாட்கள்)',
    'Pawn ticket number prefix': 'அடகு சீட்டு எண் முன்னொட்டு', 'Save settings': 'அமைப்புகளைச் சேமி',
    'Method': 'முறை', 'Payment date': 'பணம் செலுத்திய தேதி', 'Amount to pay': 'செலுத்த வேண்டிய தொகை',
    'Cash': 'பணம்', 'Bank transfer': 'வங்கி பரிமாற்றம்', 'PayNow': 'PayNow', 'Card': 'அட்டை', 'Other': 'மற்றவை',
    'Pawned item inventory': 'அடகு பொருள் இருப்பு', 'Export tickets (CSV)': 'சீட்டுகளை ஏற்றுமதி செய் (CSV)',
    'Export payments (CSV)': 'பணம் செலுத்துதலை ஏற்றுமதி செய் (CSV)', 'Overdue tickets': 'தவணை தாண்டிய சீட்டுகள்',
    'Total customers': 'மொத்த வாடிக்கையாளர்கள்', 'Total interest+fees collected': 'வசூலிக்கப்பட்ட மொத்த வட்டி+கட்டணம்',
    'Due date': 'நிலுவைத் தேதி', 'Role': 'பணி பொறுப்பு', 'Save': 'சேமி',
    'Due Soon': 'விரைவில் நிலுவை', 'Redeemed': 'மீட்கப்பட்டது', 'Forfeited': 'பறிமுதல் செய்யப்பட்டது', 'Sold': 'விற்கப்பட்டது',
    'Edit': 'திருத்து', 'Pawn tickets': 'அடகு சீட்டுகள்', 'Outstanding balance': 'நிலுவைத் தொகை', 'Customer since': 'வாடிக்கையாளர் ஆனது',
    'Due': 'நிலுவை', 'Pawn amt': 'அடகு தொகை', 'Gold': 'தங்கம்', 'Silver': 'வெள்ளி',
  };
  function tr(label) {
    if (!TAMIL_MODE) return label;
    const ta = TA[label];
    return ta ? `${label} / ${ta}` : label;
  }

  if (!TOKEN || !SESSION) {
    window.location.href = '/';
    return;
  }

  // ---------- API helper ----------
  async function api(path, options = {}) {
    const res = await fetch(path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + TOKEN,
        ...(options.headers || {}),
      },
    });
    if (res.status === 401) {
      endSession();
      throw new Error('Session expired');
    }
    let data = null;
    try { data = await res.json(); } catch (e) { /* no body */ }
    if (!res.ok) {
      let msg = 'Something went wrong.';
      if (data && data.detail) {
        if (typeof data.detail === 'string') {
          msg = data.detail;
        } else if (Array.isArray(data.detail)) {
          msg = data.detail
            .map((d) => `${(d.loc || []).slice(1).join('.')}: ${d.msg}`)
            .join('; ');
        }
      }
      throw new Error(msg);
    }
    return data;
  }

  function showToast(msg, isError) {
    TOAST = msg; TOAST_ERR = !!isError;
    renderShellAndView();
    setTimeout(() => { TOAST = null; renderShellAndView(); }, 3500);
  }

  const ROLE_PERMISSIONS = {
    Manager: ['view', 'edit', 'create', 'delete', 'approve'],
    Staff: ['view', 'edit', 'create'],
  };
  function can(perm) {
    return (ROLE_PERMISSIONS[SESSION.role] || []).includes(perm);
  }

  const NAV = [
    ['dashboard', 'Dashboard'],
    ['customers', 'Customers'],
    ['tickets', 'Pawn tickets'],
    ['inventory', 'Inventory'],
    ['payments', 'Payments'],
    ['reports', 'Reports'],
  ];
  // NAV labels are translated at render time via tr(n[1]) below.

  function statusBadge(status) {
    const map = { Open: 'b-blue', Active: 'b-blue', 'Due Soon': 'b-amber', Overdue: 'b-red', Closed: 'b-green', Redeemed: 'b-green', Forfeited: 'b-gray', Sold: 'b-gray' };
    return `<span class="badge ${map[status] || 'b-gray'}">${tr(status)}</span>`;
  }
  function kvRow(label, value) {
    return `<div class="kv-row"><span class="kv-label">${tr(label)}</span><span class="kv-value">${value}</span></div>`;
  }
  function modalWrap(id, inner) {
    return `<div class="modal-bg" id="${id}" style="position:fixed;inset:0;background:rgba(34,29,20,0.45);display:none;align-items:flex-start;justify-content:center;padding:40px 14px;z-index:50;overflow-y:auto">
      <div class="card" style="width:100%;max-width:640px;max-height:85vh;overflow-y:auto">${inner}</div></div>`;
  }
  function openModal(id) { const el = document.getElementById(id); if (el) el.style.display = 'flex'; }
  function closeModals() { document.querySelectorAll('.modal-bg').forEach((el) => (el.style.display = 'none')); }
  function fieldErr(id, msg) { const e = document.getElementById(id); if (e) e.textContent = msg; }
  function setFieldError(inputId, msg) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const wrap = input.closest('.field');
    const errEl = document.getElementById('err_' + inputId);
    if (wrap) wrap.classList.toggle('invalid', !!msg);
    if (errEl) errEl.textContent = msg || '';
  }
  function clearFieldErrors(ids) { ids.forEach((id) => setFieldError(id, '')); }

  // ---------- shell ----------
  function renderShell(inner) {
    return `
    <div class="app-shell">
      <div id="topbar">
        <div class="topbar-brand">
          <button class="btn btn-sm" id="hamburger" aria-label="Menu">&#9776;</button>
          <svg class="badge-mark" viewBox="0 0 44 44" aria-hidden="true">
            <circle cx="22" cy="22" r="20" fill="none" stroke="#c89b3c" stroke-width="1.3"/>
            <text x="22" y="29" text-anchor="middle" font-family="'Fraunces', serif" font-size="18" font-weight="600" fill="#c89b3c">&#2965;</text>
          </svg>
          <strong>Kabithu Gold Finance</strong>
        </div>
        <div class="topbar-right">
          <span class="who">${SESSION.fullName} &middot; ${SESSION.role}</span>
          <button class="btn btn-sm" id="tamilToggle" aria-pressed="${TAMIL_MODE}" title="Toggle Tamil labels">${TAMIL_MODE ? 'English' : 'தமிழ்'}</button>
          <button class="btn btn-sm" id="logoutBtn">${tr('Sign out')}</button>
        </div>
      </div>
      <div id="layout">
        <div id="sidebar" class="${SIDEBAR_OPEN ? 'open' : ''}">
          ${NAV.map((n) => `<button data-view="${n[0]}" class="${VIEW === n[0] ? 'active' : ''}">${tr(n[1])}</button>`)
            .join('')}
        </div>
        <div id="main">
          ${TOAST ? `<div class="toast ${TOAST_ERR ? 'error' : ''}">${TOAST}</div>` : ''}
          ${inner}
        </div>
      </div>
    </div>`;
  }

  function attachShellEvents() {
    document.getElementById('logoutBtn').onclick = () => endSession();
    const hb = document.getElementById('hamburger');
    if (hb) hb.onclick = () => { SIDEBAR_OPEN = !SIDEBAR_OPEN; renderShellAndView(); };
    const tt = document.getElementById('tamilToggle');
    if (tt) tt.onclick = () => { TAMIL_MODE = !TAMIL_MODE; localStorage.setItem('kabithuu_tamil', TAMIL_MODE ? '1' : '0'); renderShellAndView(); };
    document.querySelectorAll('#sidebar button[data-view]').forEach((b) => {
      b.onclick = () => { VIEW = b.dataset.view; SIDEBAR_OPEN = false; renderShellAndView(); };
    });
  }

  async function doGlobalSearch(q) {
    q = q.trim().toLowerCase();
    if (!q) return;
    try {
      const [customers, tickets] = await Promise.all([api('/api/customers'), api('/api/tickets')]);
      const tick = tickets.find((t) => t.id.toLowerCase() === q || (t.serial || '').toLowerCase() === q || t.description.toLowerCase().includes(q));
      if (tick) { SELECTED_TICKET = tick.id; VIEW = 'ticketDetail'; renderShellAndView(); return; }
      const cust = customers.find((c) => c.name.toLowerCase().includes(q) || (c.phone || '').includes(q) || c.id.toLowerCase() === q);
      if (cust) { SELECTED_CUSTOMER = cust.id; VIEW = 'customerDetail'; renderShellAndView(); return; }
      showToast(`No match found for "${q}".`, true);
    } catch (err) { showToast(err.message, true); }
  }

  // ---------- main render loop ----------
  async function renderShellAndView() {
    const app = document.getElementById('app');
    app.innerHTML = renderShell('<div class="loading-row">Loading…</div>');
    attachShellEvents();
    let viewHtml = '';
    try {
      viewHtml = await renderView();
    } catch (err) {
      viewHtml = `<div class="card"><p class="muted">Could not load this view: ${err.message}</p></div>`;
    }
    document.getElementById('main').innerHTML = `${TOAST ? `<div class="toast ${TOAST_ERR ? 'error' : ''}">${TOAST}</div>` : ''}${viewHtml}`;
    attachViewEvents();
  }

  async function renderView() {
    switch (VIEW) {
      case 'dashboard': return renderDashboard();
      case 'customers': return renderCustomers();
      case 'customerDetail': return renderCustomerDetail();
      case 'tickets': return renderTickets();
      case 'ticketDetail': return renderTicketDetail();
      case 'inventory': return renderInventory();
      case 'payments': return renderPayments();
      case 'reports': return renderReports();
      default: return '';
    }
  }

  // ---------- DASHBOARD ----------
  async function renderDashboard() {
    const s = await api('/api/dashboard/summary');
    const topCards = [
      ['New pawns', s.todaysBusiness.newPawns],
      ['Redemptions', s.todaysBusiness.redemptions],
      ['Payments', s.todaysBusiness.payments],
      ['Overdue', s.todaysBusiness.overdue],
      ['Due soon', s.todaysBusiness.dueSoon],
      ['Total active value', CURRENCY(s.todaysBusiness.totalActiveValue)],
    ];
    const overviewCards = [
      ['Active tickets', s.overview.activeTickets],
      ['Total amount pawned', CURRENCY(s.overview.totalAmountPawned)],
      ['Outstanding balances', CURRENCY(s.overview.outstandingBalances)],
      ['Due soon', s.overview.dueSoon],
      ['Overdue', s.overview.overdue],
      ["Today's new pawns", s.overview.todaysNewPawns],
      ["Today's repayments", s.overview.todaysRepayments],
      ["Today's redemptions", s.overview.todaysRedemptions],
      ['Monthly revenue (interest+fees)', CURRENCY(s.overview.monthlyRevenue)],
      ['Customers', s.overview.customers],
    ];
    return `
    <div class="dashboard-hero">
      <img src="shop-counter.jpg" alt="Kabithuu shop counter">
      <div class="dashboard-hero-overlay"><span>Kabithu Gold Finance</span></div>
    </div>
    <div class="toprow"><h2>${tr("Today's business")}</h2><span class="muted">${new Date(s.date).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span></div>
    <div class="grid grid-4" style="margin-bottom:20px">
      ${topCards.map((c) => `<div class="metric"><div class="label">${tr(c[0])}</div><div class="value">${c[1]}</div></div>`).join('')}
    </div>
    <h3>${tr('Overview')}</h3>
    <div class="grid grid-4" style="margin-bottom:24px">
      ${overviewCards.map((c) => `<div class="metric"><div class="label">${tr(c[0])}</div><div class="value">${c[1]}</div></div>`).join('')}
    </div>
    <h3>${tr('Recent transactions')}</h3>
    <div class="card">
      <table><thead><tr><th>${tr('Ticket')}</th><th>${tr('Customer')}</th><th>${tr('Date')}</th><th>${tr('Amount')}</th><th>${tr('Status')}</th><th></th></tr></thead>
      <tbody>
      ${s.recentTransactions.length ? s.recentTransactions.map((tx) => `<tr><td>${tx.ticketId}</td><td>${tx.customerName}</td><td>${fmtDate(tx.date)}</td><td>${CURRENCY(tx.amount)}</td><td>${statusBadge(tx.status)}</td><td><button class="btn btn-sm" data-open-ticket="${tx.ticketId}">View</button></td></tr>`).join('')
        : '<tr><td colspan="6" class="muted">No transactions yet — create your first pawn ticket.</td></tr>'}
      </tbody></table>
    </div>`;
  }

  // ---------- CUSTOMERS ----------
  async function renderCustomers() {
    const list = await api('/api/customers');
    return `
    <div class="toprow"><h2>${tr('Customers')}</h2>${can('create') ? `<button class="btn btn-primary" id="newCustomerBtn">${tr('+ New customer')}</button>` : ''}</div>
    <div class="card">
      <table><thead><tr><th>${tr('ID')}</th><th>${tr('Name')}</th><th>${tr('Phone')}</th><th>${tr('Type')}</th><th>${tr('Status')}</th><th>${tr('Registered')}</th><th></th></tr></thead>
      <tbody>${list.length ? list.map((c) => `<tr><td>${c.id}</td><td>${c.name}</td><td>${c.phone || '-'}</td><td>${c.type || '-'}</td><td>${statusBadge(c.status || 'Active')}</td><td>${fmtDate(c.dateRegistered)}</td><td><button class="btn btn-sm" data-open-customer="${c.id}">View</button></td></tr>`).join('')
        : '<tr><td colspan="7" class="muted">No customers yet.</td></tr>'}</tbody></table>
    </div>
    ${can('create') ? modalWrap('newCustomerModal', await customerForm()) : ''}`;
  }

  async function customerForm(existing) {
    const c = existing || {};
    // For a brand-new customer, show a preview of the ID they'll be assigned
    // (not reserved yet, see peek_next_sequential_id docstring server-side).
    // For an existing customer we already know their real, permanent ID.
    let idPreview = c.id || '';
    if (!existing) {
      try {
        const res = await api('/api/customers/meta/next-id');
        idPreview = res.nextId;
      } catch (err) {
        idPreview = 'Assigned automatically on save';
      }
    }
    return `
    <h3>${existing ? tr('Edit customer') : tr('Add New customer')}</h3>
    <div class="form-grid">
      <div class="field field-full">
        <label>${tr('Customer ID')}</label>
        <input id="f_custid" value="${idPreview}" disabled>
        <span class="field-hint">${existing ? 'Assigned when this customer was created — cannot be changed.' : 'Auto-generated.'}</span>
      </div>
      <div class="field"><label>${tr('Full name')} *</label><input id="f_name" value="${c.name || ''}"><span class="field-err" id="err_f_name"></span></div>
      <div class="field"><label>${tr('Customer type')}</label><select id="f_type"><option value="Individual" ${c.type === 'Individual' ? 'selected' : ''}>${tr('Individual')}</option><option value="Business" ${c.type === 'Business' ? 'selected' : ''}>${tr('Business')}</option></select></div>
      <div class="field"><label>${tr('Phone')} *</label><input id="f_phone" type="tel" inputmode="numeric" maxlength="10" placeholder="10-digit phone number" value="${c.phone || ''}"><span class="field-err" id="err_f_phone"></span></div>
      <div class="field"><label>${tr('Email')}</label><input id="f_email" type="email" value="${c.email || ''}"><span class="field-err" id="err_f_email"></span></div>
      <div class="field field-full"><label>${tr('Address')}</label><textarea id="f_address" rows="2">${c.address || ''}</textarea></div>
    </div>
    <div id="custFormErr" class="err" style="color:var(--error);font-size:12px;margin-top:8px"></div>
    <div style="margin-top:16px;display:flex;gap:8px">
      <button class="btn btn-primary" id="saveCustomerBtn" data-id="${c.id || ''}" data-status="${c.status || 'Active'}">${tr('Save customer')}</button>
      <button class="btn" data-close-modal>${tr('Cancel')}</button>
    </div>`;
  }

  async function saveCustomer(existingId, existingStatus) {
    const nameEl = document.getElementById('f_name');
    const phoneEl = document.getElementById('f_phone');
    const emailEl = document.getElementById('f_email');
    const name = nameEl.value.trim();
    const phone = phoneEl.value.trim();
    const email = emailEl.value.trim();

    clearFieldErrors(['f_name', 'f_phone', 'f_email']);
    fieldErr('custFormErr', '');

    let hasError = false;
    if (!name) { setFieldError('f_name', 'Full name is required.'); hasError = true; }
    if (!/^\d{10}$/.test(phone)) { setFieldError('f_phone', 'Enter a valid 10-digit phone number.'); hasError = true; }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setFieldError('f_email', 'Enter a valid email address.'); hasError = true; }
    if (hasError) { fieldErr('custFormErr', 'Please fix the highlighted fields.'); return; }

    const payload = {
      name, phone, email,
      type: document.getElementById('f_type').value,
      status: existingStatus || 'Active',
      address: document.getElementById('f_address').value.trim(),
    };
    try {
      if (existingId) {
        await api(`/api/customers/${existingId}`, { method: 'PUT', body: JSON.stringify(payload) });
        VIEW = 'customerDetail'; SELECTED_CUSTOMER = existingId;
      } else {
        const created = await api('/api/customers', { method: 'POST', body: JSON.stringify(payload) });
        VIEW = 'customerDetail'; SELECTED_CUSTOMER = created.id;
      }
      showToast('Customer saved.');
    } catch (err) { fieldErr('custFormErr', err.message); }
  }

  function initials(name) {
    const parts = (name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  }

  async function renderCustomerDetail() {
    const c = await api(`/api/customers/${SELECTED_CUSTOMER}`);
    const tickets = await api('/api/tickets');
    const myTickets = tickets.filter((t) => t.customerId === c.id);
    const activeCount = myTickets.filter((t) => ['Active', 'Due Soon', 'Overdue'].includes(t.computedStatus)).length;
    const outstanding = myTickets.reduce((s, t) => s + Number(t.balance || 0), 0);
    return `
    <button class="btn btn-sm" id="backToCustomers" style="margin-bottom:16px">&larr; Back to customers</button>
    <div class="card detail-header">
      <div class="detail-header-main">
        <div class="detail-avatar">${initials(c.name)}</div>
        <div>
          <h2 style="margin-bottom:4px">${c.name}</h2>
          <div class="detail-sub">${tr(c.type || 'Individual')} &middot; ${c.id}</div>
        </div>
      </div>
      <div class="detail-header-actions">
        ${statusBadge(c.status || 'Active')}
        ${can('edit') ? `<button class="btn btn-sm" id="editCustomerBtn">${tr('Edit')}</button>` : ''}
      </div>
    </div>
    <div class="grid grid-4" style="margin:18px 0">
      <div class="metric"><div class="label">${tr('Pawn tickets')}</div><div class="value">${myTickets.length}</div></div>
      <div class="metric"><div class="label">${tr('Active tickets')}</div><div class="value">${activeCount}</div></div>
      <div class="metric"><div class="label">${tr('Outstanding balance')}</div><div class="value">${CURRENCY(outstanding)}</div></div>
      <div class="metric"><div class="label">${tr('Customer since')}</div><div class="value" style="font-size:16px">${fmtDate(c.dateRegistered)}</div></div>
    </div>
    <div class="kv-card" style="margin-bottom:18px">
      <h3>${tr('Details')}</h3>
      <div class="kv-list">
        ${kvRow('Phone', c.phone || '-')}
        ${kvRow('Email', c.email || '-')}
        ${kvRow('Address', c.address || '-')}
      </div>
    </div>
    <h3>${tr('Pawn ticket history')}</h3>
    <div class="card">
      <table><thead><tr><th>${tr('Ticket')}</th><th>${tr('Date')}</th><th>${tr('Item')}</th><th>${tr('Amount')}</th><th>${tr('Balance')}</th><th>${tr('Status')}</th><th></th></tr></thead>
      <tbody>${myTickets.length ? myTickets.map((t) => `<tr><td>${t.id}</td><td>${fmtDate(t.date)}</td><td>${t.description}</td><td>${CURRENCY(t.pawnAmount)}</td><td>${CURRENCY(t.balance)}</td><td>${statusBadge(t.computedStatus)}</td><td><button class="btn btn-sm" data-open-ticket="${t.id}">View</button></td></tr>`).join('')
        : '<tr><td colspan="7" class="muted">No pawn tickets for this customer.</td></tr>'}</tbody></table>
    </div>
    ${can('edit') ? modalWrap('editCustomerModal', await customerForm(c)) : ''}`;
  }

  // ---------- TICKETS ----------
  async function renderTickets() {
    const list = await api('/api/tickets');
    return `
    <div class="toprow"><h2>${tr('Pawn tickets')}</h2>${can('create') ? `<button class="btn btn-primary" id="newTicketBtn">${tr('+ New pawn ticket')}</button>` : ''}</div>
    <div class="card">
      <table><thead><tr><th>${tr('Ticket')}</th><th>${tr('Customer')}</th><th>${tr('Item')}</th><th>${tr('Date')}</th><th>${tr('Due')}</th><th>${tr('Pawn amt')}</th><th>${tr('Balance')}</th><th>${tr('Status')}</th><th></th></tr></thead>
      <tbody>${list.length ? list.map((t) => `<tr><td>${t.id}</td><td>${t.customerName || '-'}</td><td>${t.description}</td><td>${fmtDate(t.date)}</td><td>${fmtDate(t.dueDate)}</td><td>${CURRENCY(t.pawnAmount)}</td><td>${CURRENCY(t.balance)}</td><td>${statusBadge(t.computedStatus)}</td><td><button class="btn btn-sm" data-open-ticket="${t.id}">View</button></td></tr>`).join('')
        : '<tr><td colspan="9" class="muted">No pawn tickets yet.</td></tr>'}</tbody></table>
    </div>
    ${can('create') ? modalWrap('newTicketModal', await ticketForm()) : ''}`;
  }

  async function ticketForm() {
    const customers = await api('/api/customers');
    const settings = await api('/api/settings');
    if (!customers.length) return `<h3>New pawn ticket</h3><p class="muted">Add a customer first before creating a pawn ticket.</p><button class="btn" data-close-modal>Close</button>`;
    const defaultDue = new Date(Date.now() + settings.dueDays * 86400000).toISOString().slice(0, 10);
    return `
    <h3>${tr('New pawn ticket')}</h3>
    <div class="form-grid">
      <div class="field"><label>${tr('Customer')} *</label><select id="t_customer">${customers.map((c) => `<option value="${c.id}">${c.name} (${c.id})</option>`).join('')}</select></div>
      <div class="field"><label>${tr('Category')}</label><select id="t_category"><option value="Gold">${tr('Gold')}</option><option value="Silver">${tr('Silver')}</option></select></div>
      <div class="field"><label>${tr('Item description')} *</label><input id="t_desc" placeholder="e.g. 22k gold necklace"></div>
      <div class="field"><label>${tr('Quantity')}</label><input id="t_qty" type="number" value="1" min="1"></div>
      <div class="field"><label>${tr('Weight (g)')}</label><input id="t_weight" type="number" step="0.01"></div>
      <div class="field"><label>${tr('Purity')}</label><select id="t_purity"><option value="22">22K</option><option value="24">24K</option></select></div>
      <div class="field"><label>${tr('Estimated market value')}</label><input id="t_market" type="number" step="0.01"></div>
      <div class="field"><label>${tr('Appraised value')}</label><input id="t_appraised" type="number" step="0.01"></div>
      <div class="field"><label>${tr('Pawn / loan amount')} *</label><input id="t_amount" type="number" step="0.01"></div>
      <div class="field"><label>${tr('Interest rate (% per period)')}</label><input id="t_rate" type="number" step="0.1" value="${settings.defaultInterestRate}"></div>
      <div class="field"><label>${tr('Service / admin charge')}</label><input id="t_service" type="number" step="0.01" value="${settings.defaultServiceCharge}"></div>
      <div class="field"><label>${tr('Expected redemption date')} *</label><input id="t_due" type="date" value="${defaultDue}"></div>
      <div class="field field-full"><label>${tr('Condition / remarks')}</label><textarea id="t_remarks" rows="2"></textarea></div>
    </div>
    <label class="checkbox-row"><input type="checkbox" id="t_ack"> Customer acknowledges the item details, redemption date and charges, and understands the consequences of non-redemption.</label>
    <div id="ticketFormErr" class="err" style="color:var(--error);font-size:12px;margin-top:8px"></div>
    <div style="margin-top:16px;display:flex;gap:8px">
      <button class="btn btn-primary" id="saveTicketBtn">${tr('Create ticket')}</button>
      <button class="btn" data-close-modal>${tr('Cancel')}</button>
    </div>`;
  }

  async function saveTicket() {
    const amount = Number(document.getElementById('t_amount').value);
    const description = document.getElementById('t_desc').value.trim();
    const due = document.getElementById('t_due').value;
    const ack = document.getElementById('t_ack').checked;
    if (!description || !amount || amount <= 0 || !due) { fieldErr('ticketFormErr', 'Item description, pawn amount and redemption date are required.'); return; }
    if (!ack) { fieldErr('ticketFormErr', 'Customer acknowledgement must be confirmed before creating the ticket.'); return; }
    const payload = {
      customerId: document.getElementById('t_customer').value,
      category: document.getElementById('t_category').value,
      description,
      qty: Number(document.getElementById('t_qty').value) || 1,
      weight: Number(document.getElementById('t_weight').value) || 0,
      purity: Number(document.getElementById('t_purity').value) || 0,
      marketValue: Number(document.getElementById('t_market').value) || 0,
      appraisedValue: Number(document.getElementById('t_appraised').value) || 0,
      pawnAmount: amount,
      interestRate: Number(document.getElementById('t_rate').value) || 0,
      serviceCharge: Number(document.getElementById('t_service').value) || 0,
      dueDate: due,
      remarks: document.getElementById('t_remarks').value.trim(),
      acknowledged: ack,
    };
    try {
      const created = await api('/api/tickets', { method: 'POST', body: JSON.stringify(payload) });
      SELECTED_TICKET = created.id; VIEW = 'ticketDetail';
      showToast('Pawn ticket created.');
    } catch (err) { fieldErr('ticketFormErr', err.message); }
  }

  async function renderTicketDetail() {
    const t = await api(`/api/tickets/${SELECTED_TICKET}`);
    const payments = (await api('/api/payments')).filter((p) => p.ticketId === t.id);
    const interestAmt = (t.pawnAmount * t.interestRate) / 100;
    const total = t.pawnAmount + interestAmt + t.serviceCharge;
    const kv = kvRow;
    return `
    <button class="btn btn-sm" id="backToTickets" style="margin-bottom:16px">&larr; Back to tickets</button>
    <div class="ticket-head">
      <div class="ticket-head-id">
        <h2>${t.id}</h2>
      </div>
      <div class="ticket-actions">
        ${(can('edit') && t.balance > 0) ? `<button class="btn btn-sm" id="recordPaymentBtn">${tr('Record payment')}</button>` : ''}
        <button class="btn btn-sm" id="printTicketBtn">${tr('Print ticket')}</button>
        <span class="status-select-wrap">
          <span class="status-select-label">${tr('Status')}</span>
          <select id="statusSelect" data-ticket="${t.id}" class="btn btn-sm status-select" ${can('edit') ? '' : 'disabled'}>
            ${['Open', 'Closed', 'Overdue', 'Due Soon', 'Redeemed', 'Forfeited']
              .map((s) => `<option value="${s}" ${s === t.status ? 'selected' : ''}>${tr(s)}</option>`)
              .join('')}
          </select>
        </span>
      </div>
    </div>

    <div class="ticket-summary-strip">
      <div class="ticket-summary-card${t.balance > 0 ? ' is-warn' : ''}">
        <div class="label">${tr('Balance remaining')}</div>
        <div class="value">${CURRENCY(t.balance)}</div>
      </div>
      <div class="ticket-summary-card">
        <div class="label">${tr('Total payable')}</div>
        <div class="value">${CURRENCY(total)}</div>
      </div>
      <div class="ticket-summary-card">
        <div class="label">${tr('Redemption due')}</div>
        <div class="value">${fmtDate(t.dueDate)}</div>
      </div>
    </div>

    <div class="grid grid-2" style="margin-bottom:16px">
      <div class="kv-card">
        <h3>${tr('Item')}</h3>
        <div class="kv-list">
          ${kv('Customer', `<a href="#" data-open-customer="${t.customerId}">${t.customerName || '-'}</a>`)}
          ${kv('Category', tr(t.category))}
          ${kv('Description', t.description)}
          ${kv('Qty', t.qty)}
          ${kv('Weight', t.weight ? t.weight + ' g' : '-')}
          ${kv('Purity', t.purity ? t.purity + 'K' : '-')}
          ${kv('Market value', CURRENCY(t.marketValue))}
          ${kv('Appraised value', CURRENCY(t.appraisedValue))}
        </div>
      </div>
      <div class="kv-card">
        <h3>${tr('Financials')}</h3>
        <div class="kv-list">
          ${kv('Pawn amount', CURRENCY(t.pawnAmount))}
          ${kv('Interest rate', t.interestRate + '%')}
          ${kv('Interest amount', CURRENCY(interestAmt))}
          ${kv('Service charge', CURRENCY(t.serviceCharge))}
          ${kv('Date pawned', fmtDate(t.date))}
          ${kv('Processed by', t.staff || '-')}
          <div class="kv-row kv-total"><span class="kv-label">${tr('Total payable')}</span><span class="kv-value">${CURRENCY(total)}</span></div>
          <div class="kv-row kv-total kv-balance"><span class="kv-label">${tr('Balance remaining')}</span><span class="kv-value">${CURRENCY(t.balance)}</span></div>
        </div>
      </div>
    </div>
    <div class="card" style="margin-bottom:16px">
      <h3 style="margin:0;padding:16px 16px 0">${tr('Payment history')}</h3>
      <table style="margin-top:8px"><thead><tr><th>${tr('Date')}</th><th>${tr('Type')}</th><th>${tr('Amount')}</th><th>${tr('Staff')}</th></tr></thead>
      <tbody>${payments.length ? payments.map((p) => `<tr><td>${fmtDate(p.date)}</td><td>${p.method}</td><td>${CURRENCY(p.total)}</td><td>${p.staff || '-'}</td></tr>`).join('') : '<tr><td colspan="4" class="muted">No payments recorded.</td></tr>'}</tbody></table>
    </div>
    ${(can('edit') && t.balance > 0) ? modalWrap('paymentModal', paymentForm(t)) : ''}`;
  }

  function paymentForm(t) {
    return `<h3>${tr('Record payment')} — ${t.id}</h3>
    <p class="muted">${tr('Balance remaining')}: ${CURRENCY(t.balance)}</p>
    <div class="form-grid">
      <div class="field"><label>${tr('Payment date')}</label><input id="p_date" type="date" value="${todayISO()}"></div>
      <div class="field"><label>${tr('Method')}</label><select id="p_method"><option value="Cash">${tr('Cash')}</option><option value="GPay">${tr('GPay')}</option></select></div>
      <div class="field field-full"><label>${tr('Amount to pay')} *</label><input id="p_amount" type="number" step="0.01" value="${t.balance.toFixed(2)}" max="${t.balance}"></div>
    </div>
    <div id="paymentFormErr" class="err" style="color:var(--error);font-size:12px;margin-top:8px"></div>
    <div style="margin-top:16px;display:flex;gap:8px">
      <button class="btn btn-primary" id="savePaymentBtn" data-ticket="${t.id}">${tr('Record payment')}</button>
      <button class="btn" data-close-modal>${tr('Cancel')}</button>
    </div>`;
  }

  async function savePayment(ticketId) {
    const amount = Number(document.getElementById('p_amount').value);
    if (!amount || amount <= 0) { fieldErr('paymentFormErr', 'Enter a valid payment amount.'); return; }
    const payload = { ticketId, amount, method: document.getElementById('p_method').value, date: document.getElementById('p_date').value || todayISO() };
    try {
      await api('/api/payments', { method: 'POST', body: JSON.stringify(payload) });
      showToast('Payment recorded.');
    } catch (err) { fieldErr('paymentFormErr', err.message); }
  }

  async function updateTicketStatus(ticketId, status) {
    try {
      await api(`/api/tickets/${ticketId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
      showToast('Status updated.');
    } catch (err) { showToast(err.message, true); }
  }

  // ---------- INVENTORY ----------
  async function renderInventory() {
    const list = (await api('/api/tickets')).filter((t) => t.computedStatus !== 'Redeemed');
    return `
    <div class="toprow"><h2>${tr('Pawned item inventory')}</h2></div>
    <div class="card">
      <table><thead><tr><th>${tr('Ticket')}</th><th>${tr('Category')}</th><th>${tr('Description')}</th><th>${tr('Customer')}</th><th>${tr('Status')}</th><th></th></tr></thead>
      <tbody>${list.length ? list.map((t) => `<tr><td>${t.id}</td><td>${t.category}</td><td>${t.description}</td><td>${t.customerName || '-'}</td><td>${statusBadge(t.computedStatus)}</td><td><button class="btn btn-sm" data-open-ticket="${t.id}">View</button></td></tr>`).join('')
        : '<tr><td colspan="6" class="muted">No items in inventory.</td></tr>'}</tbody></table>
    </div>`;
  }

  // ---------- PAYMENTS ----------
  async function renderPayments() {
    const list = await api('/api/payments');
    return `
    <div class="toprow"><h2>${tr('Payments')}</h2></div>
    <div class="card">
      <table><thead><tr><th>${tr('Date')}</th><th>${tr('Ticket')}</th><th>${tr('Method')}</th><th>${tr('Amount')}</th><th>${tr('Staff')}</th></tr></thead>
      <tbody>${list.length ? list.map((p) => `<tr><td>${fmtDate(p.date)}</td><td><a href="#" data-open-ticket="${p.ticketId}">${p.ticketId}</a></td><td>${p.method}</td><td>${CURRENCY(p.total)}</td><td>${p.staff || '-'}</td></tr>`).join('')
        : '<tr><td colspan="5" class="muted">No payments recorded yet.</td></tr>'}</tbody></table>
    </div>`;
  }

  // ---------- REPORTS ----------
  async function renderReports() {
    const tickets = await api('/api/tickets');
    const customers = await api('/api/customers');
    const payments = await api('/api/payments');
    const overdue = tickets.filter((t) => t.computedStatus === 'Overdue');
    const active = tickets.filter((t) => ['Active', 'Due Soon', 'Overdue'].includes(t.computedStatus));
    const revenue = payments.reduce((s, p) => s + Number(p.interest || 0) + Number(p.service || 0), 0);
    return `
    <div class="toprow"><h2>${tr('Reports')}</h2>
      <div style="display:flex;gap:8px">
        <button class="btn btn-sm" id="exportTicketsCsv">${tr('Export tickets (CSV)')}</button>
        <button class="btn btn-sm" id="exportPaymentsCsv">${tr('Export payments (CSV)')}</button>
      </div>
    </div>
    <div class="grid grid-4" style="margin-bottom:20px">
      <div class="metric"><div class="label">${tr('Active tickets')}</div><div class="value">${active.length}</div></div>
      <div class="metric"><div class="label">${tr('Overdue tickets')}</div><div class="value">${overdue.length}</div></div>
      <div class="metric"><div class="label">${tr('Total customers')}</div><div class="value">${customers.length}</div></div>
      <div class="metric"><div class="label">${tr('Total interest+fees collected')}</div><div class="value">${CURRENCY(revenue)}</div></div>
    </div>
    <h3>${tr('Overdue tickets')}</h3>
    <div class="card">
      <table><thead><tr><th>${tr('Ticket')}</th><th>${tr('Customer')}</th><th>${tr('Due date')}</th><th>${tr('Balance')}</th></tr></thead>
      <tbody>${overdue.length ? overdue.map((t) => `<tr><td>${t.id}</td><td>${t.customerName || '-'}</td><td>${fmtDate(t.dueDate)}</td><td>${CURRENCY(t.balance)}</td></tr>`).join('') : '<tr><td colspan="4" class="muted">No overdue tickets.</td></tr>'}</tbody></table>
    </div>`;
  }

  function exportCsv(rows, filename) {
    if (!rows.length) { showToast('Nothing to export.', true); return; }
    const cols = Object.keys(rows[0]);
    const csv = [cols.join(',')].concat(rows.map((r) => cols.map((c) => JSON.stringify(r[c] ?? '')).join(','))).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename; a.click();
  }

  // ---------- view-level events (re-attached after every render) ----------
  function attachViewEvents() {
    document.querySelectorAll('[data-open-ticket]').forEach((el) => {
      el.onclick = (e) => { e.preventDefault(); SELECTED_TICKET = el.dataset.openTicket; VIEW = 'ticketDetail'; renderShellAndView(); };
    });
    document.querySelectorAll('[data-open-customer]').forEach((el) => {
      el.onclick = (e) => { e.preventDefault(); SELECTED_CUSTOMER = el.dataset.openCustomer; VIEW = 'customerDetail'; renderShellAndView(); };
    });
    const backC = document.getElementById('backToCustomers'); if (backC) backC.onclick = () => { VIEW = 'customers'; renderShellAndView(); };
    const backT = document.getElementById('backToTickets'); if (backT) backT.onclick = () => { VIEW = 'tickets'; renderShellAndView(); };

    document.querySelectorAll('[data-close-modal]').forEach((el) => { el.onclick = () => closeModals(); });

    const newCustBtn = document.getElementById('newCustomerBtn');
    if (newCustBtn) newCustBtn.onclick = () => openModal('newCustomerModal');
    const editCustBtn = document.getElementById('editCustomerBtn');
    if (editCustBtn) editCustBtn.onclick = () => openModal('editCustomerModal');
    const saveCustBtn = document.getElementById('saveCustomerBtn');
    if (saveCustBtn) saveCustBtn.onclick = () => saveCustomer(saveCustBtn.dataset.id || null, saveCustBtn.dataset.status || 'Active');
    const custPhoneInput = document.getElementById('f_phone');
    if (custPhoneInput) {
      custPhoneInput.addEventListener('input', () => {
        custPhoneInput.value = custPhoneInput.value.replace(/\D/g, '').slice(0, 10);
      });
    }

    const newTicketBtn = document.getElementById('newTicketBtn');
    if (newTicketBtn) newTicketBtn.onclick = () => openModal('newTicketModal');
    const saveTicketBtn = document.getElementById('saveTicketBtn');
    if (saveTicketBtn) saveTicketBtn.onclick = saveTicket;

    const recordPayBtn = document.getElementById('recordPaymentBtn');
    if (recordPayBtn) recordPayBtn.onclick = () => openModal('paymentModal');
    const savePayBtn = document.getElementById('savePaymentBtn');
    if (savePayBtn) savePayBtn.onclick = () => savePayment(savePayBtn.dataset.ticket);

    const statusSelect = document.getElementById('statusSelect');
    if (statusSelect) {
      statusSelect.onchange = () => updateTicketStatus(statusSelect.dataset.ticket, statusSelect.value);
    }

    const printTicketBtn = document.getElementById('printTicketBtn');
    if (printTicketBtn) printTicketBtn.onclick = () => window.print();

    const exportT = document.getElementById('exportTicketsCsv');
    if (exportT) exportT.onclick = async () => exportCsv(await api('/api/tickets'), 'pawn_tickets.csv');
    const exportP = document.getElementById('exportPaymentsCsv');
    if (exportP) exportP.onclick = async () => exportCsv(await api('/api/payments'), 'payments.csv');
  }

  renderShellAndView();
})();