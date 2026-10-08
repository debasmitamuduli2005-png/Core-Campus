/* ==========================================================================
   SmartCampus Portal · js/services.js
   Gate pass, hostel leave and canteen records. Students apply/order,
   administrators approve and manage. Loaded after app.js + auth.js.
   ========================================================================== */
(function () {
  'use strict';
  const SC = window.SC, { util: U, ui: UI, data: Dt, store: S, charts: Ch, pages: P, notify: Notify, shell: Shell } = SC;
  const html = U.html, me = () => SC.auth.user(), A_ = SC.registerAction, V = {};
  /* Admin and faculty can review gate passes and hostel leave (approve / reject / cancel / verify). */
  const isStaff = () => ['admin', 'faculty'].includes(me().role);
  const passCode = r => 'GP-' + U.hash(r.id).toString(36).toUpperCase().slice(0, 6);
  const TONES = { Pending: 'warning', Approved: 'success', Rejected: 'danger', Cancelled: 'neutral', 'Checked Out': 'info', Returned: 'success',
    Preparing: 'warning', Ready: 'info', Collected: 'success' };
  const badge = s => UI.badge(s, TONES[s] || 'neutral');
  const rs = n => '\u20B9' + n;
  const stamp = () => new Date().toISOString();

  /* ---------------- Seed (runs once per fresh/reset database) ---------------- */
  (function seed() {
    if (S.all('canteenMenu').length) return;
    [['Masala Dosa', 'Breakfast', 50], ['Veg Thali', 'Lunch', 90], ['Chicken Biryani', 'Lunch', 130], ['Samosa (2 pcs)', 'Snacks', 25],
      ['Veg Sandwich', 'Snacks', 40], ['Filter Coffee', 'Beverages', 20], ['Fresh Lime Soda', 'Beverages', 30], ['Paneer Roll', 'Snacks', 70]]
      .forEach(([name, category, price]) => S.add('canteenMenu', { id: S.nextId('MN'), name, category, price, available: name !== 'Paneer Roll' }));
    const ids = S.all('students').slice(0, 5).map(s => s.id), menu = S.all('canteenMenu'), by = 'System';
    const pass = (i, purpose, dest, off, status) => S.add('gatePasses', { id: S.nextId('GP'), sid: ids[i], purpose, destination: dest, date: U.dayOffset(off), outTime: '16:00', returnTime: '19:00', status, created: U.dayOffset(off - 1), remarks: [{ by, text: 'Request submitted.', date: U.dayOffset(off - 1) }] });
    pass(0, 'Medical', 'City Hospital', 0, 'Pending'); pass(1, 'Personal', 'Railway station', -1, 'Returned'); pass(2, 'Academic', 'Bookstore', 1, 'Approved'); pass(3, 'Family', 'Relative\'s home', -2, 'Rejected');
    const leave = (i, type, from, to, reason, status) => S.add('hostelLeaves', { id: S.nextId('HL'), sid: ids[i], type, block: 'Block B', room: String(200 + i * 7), from: U.dayOffset(from), to: U.dayOffset(to), reason, contact: '9876500000', status, created: U.dayOffset(from - 2), remarks: [{ by, text: 'Leave application submitted.', date: U.dayOffset(from - 2) }] });
    leave(0, 'Home visit', 3, 6, 'Sister\'s wedding ceremony.', 'Pending'); leave(1, 'Medical', -4, -1, 'Dental treatment.', 'Returned'); leave(4, 'Home visit', 1, 3, 'Festival with family.', 'Approved');
    [[0, 0, 1, 'Collected', 0], [1, 3, 2, 'Collected', 1], [2, 1, 1, 'Collected', 1], [0, 5, 2, 'Ready', 0], [3, 2, 1, 'Preparing', 0]].forEach(([si, mi, qty, status, off]) => {
      const m = menu[mi]; S.add('canteenOrders', { id: S.nextId('CO'), sid: ids[si], item: m.name, itemId: m.id, qty, total: m.price * qty, pay: 'UPI', status, token: 100 + S.all('canteenOrders').length + 1, date: U.dayOffset(-off), time: stamp() });
    });
  })();

  const notifyStudent = (sid, text, type, link) => { const u = Dt.userOf(sid); Notify.push({ to: 'student', uid: u && u.id, text, type, link }); };

  /* ---------------- Generic request module (gate pass + hostel leave) ---------------- */
  function barcode(seedText) {
    const h = U.hash(seedText); let x = 0, bars = '';
    for (let i = 0; i < 34; i++) { const w = 1 + ((h >> (i % 24)) + i) % 3; if (i % 2 === 0) bars += `<rect x="${x}" y="0" width="${w}" height="34" fill="currentColor"/>`; x += w + 1; }
    return U.raw(`<svg viewBox="0 0 ${x} 34" height="34" role="img" aria-label="Pass barcode">${bars}</svg>`);
  }

  function makeRequest(c) {
    const rows = id => S.find(c.coll, id);
    const detail = id => {
      const r = rows(id); if (!r) return;
      const admin = isStaff(), btns = admin ? (c.flow[r.status] || []) : (r.status === 'Pending' ? [['Cancelled', 'Cancel request', 'danger']] : []);
      const canVerify = admin && !r.verified && ['Pending', 'Approved'].includes(r.status);
      UI.modal({
        title: `${r.id}, ${c.label}`, size: 'lg',
        body: html`<div class="ann-head mb">${badge(r.status)}</div>
          ${c.pass && ['Approved', 'Checked Out'].includes(r.status) ? html`<div class="note mb" style="display:flex;justify-content:space-between;align-items:center;gap:16px"><div><strong>Digital gate pass</strong><br><span style="font-family:monospace;font-size:1.2rem;letter-spacing:2px">${passCode(r)}</span><br><small>Show this at the gate. Valid on ${U.fmtDate(r.date)}.</small></div><div style="color:var(--text, #1c2340)">${barcode(r.id)}</div></div>` : ''}
          <dl class="details mb"><dt>Student</dt><dd>${Dt.studentName(r.sid)} (${r.sid})</dd><dt>Verification</dt><dd>${r.verified ? html`${UI.badge('Verified', 'success')} by ${r.verified.by} on ${new Date(r.verified.at).toLocaleString('en-IN')}` : UI.badge('Not verified yet', 'warning')}</dd>${c.rows(r).map(([k, v]) => html`<dt>${k}</dt><dd>${v}</dd>`)}</dl>
          <h4 class="mb-sm">Activity</h4><ul class="timeline">${r.remarks.map(x => html`<li><strong>${x.by}</strong><span>${x.text}</span><time>${U.fmtDate(x.date)}</time></li>`)}</ul>`,
        footer: html`<button class="btn btn-ghost" data-act="close-modal">Close</button>${canVerify ? html`<button class="btn btn-soft" data-act="svc-verify" data-coll="${c.coll}" data-id="${r.id}"><i class="fa-solid fa-user-check"></i> Verify student</button>` : ''}${btns.map(([to, label, kind]) => html`<button class="btn ${kind === 'danger' ? 'btn-danger' : 'btn-primary'}" data-act="svc-set" data-coll="${c.coll}" data-id="${r.id}" data-to="${to}">${label}</button>`)}`
      });
    };
    A_(c.pfx + '-open', el => detail(el.dataset.id));
    A_(c.pfx + '-new', () => UI.form({
      title: c.newTitle, size: 'lg', submitLabel: 'Submit request', fields: c.fields, validate: c.validate,
      onSubmit(v) {
        const r = S.add(c.coll, Object.assign({ id: S.nextId(c.prefix), sid: me().refId, status: 'Pending', created: U.iso(), remarks: [{ by: 'System', text: 'Request submitted.', date: U.iso() }] }, v));
        Notify.push({ to: 'admin', text: `New ${c.label.toLowerCase()} request from ${Dt.studentName(r.sid)}`, type: 'warning', link: c.page });
        S.log(`${Dt.studentName(r.sid)} requested a ${c.label.toLowerCase()}`, c.icon); UI.toast(`${c.label} request ${r.id} submitted.`); Shell.refresh();
      }
    }));
    P[c.page] = {
      title: c.title,
      render() {
        const admin = isStaff(), sid = me().refId, all = () => S.all(c.coll).filter(r => admin || r.sid === sid);
        const key = c.page + admin;
        V[key] = V[key] || UI.dataView({
          id: key, initial: { status: 'all', ver: 'all' },
          filters: [{ key: 'q', type: 'search', placeholder: admin ? 'Search by student or ID' : 'Search your requests' }, { key: 'status', type: 'select', label: 'Status', options: [['all', 'All status']].concat(c.statuses.map(s => [s, s])) }].concat(admin ? [{ key: 'ver', type: 'select', label: 'Verification', options: [['all', 'All'], ['yes', 'Verified'], ['no', 'Not verified']] }] : []),
          getRows: st => all().filter(r => (st.status === 'all' || r.status === st.status) && (st.ver === 'all' || (st.ver === 'yes') === !!r.verified) && U.matches(st.q, r.id, Dt.studentName(r.sid), r.sid, c.search(r))).sort((a, b) => b.created.localeCompare(a.created) || b.id.localeCompare(a.id)),
          renderRows: list => UI.card('', UI.table(['ID'].concat(admin ? ['Student'] : [], c.cols.map(x => x[0]), ['Status']), list.map(r => html`<tr class="row-click" data-act="${c.pfx}-open" data-id="${r.id}"><td><strong>${r.id}</strong></td>${admin ? html`<td>${Dt.studentName(r.sid)}</td>` : ''}${c.cols.map(x => html`<td>${x[1](r)}</td>`)}<td>${badge(r.status)}${admin && r.verified ? html` ${UI.badge('Verified', 'success')}` : ''}</td></tr>`)), { flush: true }),
          empty: { icon: c.icon, title: `No ${c.label.toLowerCase()} requests`, text: admin ? 'Requests from students will appear here.' : 'Use the button above to apply.' }
        });
        const a = all(), n = s => a.filter(r => r.status === s).length;
        const stats = html`<div class="grid stats">${UI.stat({ icon: 'hourglass-half', label: 'Pending', value: n('Pending'), tone: 'orange' })}${UI.stat({ icon: 'circle-check', label: 'Approved', value: n('Approved') + n('Checked Out'), tone: 'green' })}${UI.stat({ icon: 'circle-xmark', label: 'Rejected', value: n('Rejected'), tone: 'red' })}${UI.stat({ icon: c.icon, label: admin ? 'Total requests' : 'My requests', value: a.length, tone: 'blue' })}</div>`;
        const desk = admin && c.pass ? UI.card('Gate pass verification', html`<div class="toolbar"><label class="search-field"><i class="fa-solid fa-qrcode"></i><input class="input" id="gpCode" placeholder="Enter student's pass code, e.g. GP-1A2B3C" aria-label="Pass code" autocomplete="off"></label><button class="btn btn-primary" data-act="gp-lookup">Verify pass code</button></div><small class="muted">Look up a student's digital gate pass to check it is approved and valid for today.</small>`, { icon: 'shield-halved' }) : '';
        return html`<div class="page">${UI.pageHead(c.title, admin ? c.adminSub : c.studentSub, admin ? '' : html`<button class="btn btn-primary" data-act="${c.pfx}-new"><i class="fa-solid fa-plus"></i> ${c.newLabel}</button>`)}${stats}${desk}${V[key].html()}</div>`;
      },
      mount(root) {
        V[c.page + isStaff()].mount(root);
        const g = root.querySelector('#gpCode');
        if (g) g.addEventListener('keydown', ev => { if (ev.key === 'Enter') SC.actions['gp-lookup'](); });
      }
    };
  }

  /* Status changes (approve / reject / check out / return / cancel) shared by both modules */
  function applyStatus(coll, id, to, note) {
    const r = S.find(coll, id), user = me(), admin = isStaff();
    r.status = to; r.remarks.push({ by: admin ? `${user.name} (${user.role === 'faculty' ? 'Faculty' : 'Admin'})` : 'Student', text: note || `Status changed to ${to}.`, date: U.iso() });
    if (to === 'Checked Out') r.outAt = stamp(); if (to === 'Returned') r.inAt = stamp(); S.save();
    const page = coll === 'gatePasses' ? 'gatepass' : 'hostelleave', what = coll === 'gatePasses' ? 'Gate pass' : 'Hostel leave';
    if (admin) notifyStudent(r.sid, `${what} ${r.id} is now ${to}.`, to === 'Rejected' ? 'danger' : 'success', page);
    UI.toast(`${what} ${r.id}: ${to}.`); UI.closeModal(); Shell.refresh();
  }
  A_('svc-set', el => {
    const { coll, id, to } = el.dataset;
    const needsReason = to === 'Rejected' || (to === 'Cancelled' && isStaff());
    if (!needsReason) return applyStatus(coll, id, to, '');
    const verb = to === 'Rejected' ? 'Reject' : 'Cancel';
    UI.form({ title: `${verb} request`, submitLabel: verb, fields: [{ name: 'note', label: `Reason for ${verb.toLowerCase() === 'reject' ? 'rejection' : 'cancellation'}`, type: 'textarea', required: true, span: 2 }], onSubmit: v => { applyStatus(coll, id, to, v.note); } });
  });
  /* Faculty / admin verify that the student and the request are genuine */
  A_('svc-verify', el => {
    const { coll, id } = el.dataset, r = S.find(coll, id), user = me();
    if (!r || !isStaff()) return;
    r.verified = { by: user.name, role: user.role, at: stamp() };
    r.remarks.push({ by: `${user.name} (${user.role === 'faculty' ? 'Faculty' : 'Admin'})`, text: 'Student and request details verified.', date: U.iso() });
    S.save();
    const what = coll === 'gatePasses' ? 'Gate pass' : 'Hostel leave';
    notifyStudent(r.sid, `${what} ${r.id} was verified by ${user.name}.`, 'success', coll === 'gatePasses' ? 'gatepass' : 'hostelleave');
    S.log(`${user.name} verified ${what.toLowerCase()} ${r.id}`, 'user-check');
    UI.toast(`${what} ${r.id} verified.`); UI.closeModal(); Shell.refresh();
  });
  /* Look a student's gate pass up by its code and check whether it is valid right now */
  A_('gp-lookup', () => {
    const input = document.getElementById('gpCode'), q = (input && input.value || '').trim().toUpperCase();
    if (!q) { UI.toast('Enter a pass code, for example GP-1A2B3C.', 'error'); return; }
    const r = S.all('gatePasses').find(x => passCode(x) === q || x.id.toUpperCase() === q);
    if (!r) { UI.toast(`No gate pass found for ${q}.`, 'error'); return; }
    input.value = '';
    const live = ['Approved', 'Checked Out'].includes(r.status);
    if (!live) UI.toast(`Not valid: this gate pass is ${r.status}.`, 'error');
    else if (r.date !== U.iso()) UI.toast(`Approved, but dated ${U.fmtDate(r.date)}, not today.`, 'error');
    else UI.toast('Valid gate pass for today.');
    SC.actions['gp-open'](({ dataset: { id: r.id } }));
  });

  const today = U.iso();
  makeRequest({
    coll: 'gatePasses', prefix: 'GP', pfx: 'gp', page: 'gatepass', icon: 'id-card-clip', label: 'Gate pass', title: 'College gate pass', newTitle: 'Apply for a gate pass', newLabel: 'New gate pass', pass: true,
    studentSub: 'Request permission to leave campus and show your digital pass at the gate.', adminSub: 'Approve gate passes and record check-out and return at the gate.',
    statuses: ['Pending', 'Approved', 'Checked Out', 'Returned', 'Rejected', 'Cancelled'],
    flow: { Pending: [['Approved', 'Approve'], ['Rejected', 'Reject', 'danger'], ['Cancelled', 'Cancel pass', 'danger']], Approved: [['Checked Out', 'Mark checked out'], ['Cancelled', 'Cancel pass', 'danger']], 'Checked Out': [['Returned', 'Mark returned']] },
    cols: [['Purpose', r => html`${r.purpose}<small class="block">${r.destination}</small>`], ['Date', r => U.fmtDate(r.date)], ['Out / return', r => `${U.fmtTime(r.outTime)} to ${U.fmtTime(r.returnTime)}`]],
    search: r => r.purpose + ' ' + r.destination,
    rows: r => [['Purpose', r.purpose], ['Destination', r.destination], ['Date', U.fmtDate(r.date)], ['Out time', U.fmtTime(r.outTime)], ['Expected return', U.fmtTime(r.returnTime)], ['Checked out at', r.outAt ? new Date(r.outAt).toLocaleTimeString('en-IN') : '-'], ['Returned at', r.inAt ? new Date(r.inAt).toLocaleTimeString('en-IN') : '-']],
    fields: [{ name: 'purpose', label: 'Purpose', type: 'select', options: ['Medical', 'Personal', 'Academic', 'Family', 'Other'], value: 'Personal' }, { name: 'destination', label: 'Destination', required: true, placeholder: 'Where are you going?' },
      { name: 'date', label: 'Date', type: 'date', required: true, value: today, min: today }, { name: 'outTime', label: 'Out time', type: 'time', required: true, value: '16:00' }, { name: 'returnTime', label: 'Expected return time', type: 'time', required: true, value: '19:00' }],
    validate: v => v.returnTime <= v.outTime ? { returnTime: 'Return time must be after the out time.' } : {}
  });

  makeRequest({
    coll: 'hostelLeaves', prefix: 'HL', pfx: 'hl', page: 'hostelleave', icon: 'bed', label: 'Hostel leave', title: 'Hostel leave', newTitle: 'Apply for hostel leave', newLabel: 'Apply for leave',
    studentSub: 'Apply for overnight leave from the hostel and track the warden\'s decision.', adminSub: 'Review leave applications from hostel residents.',
    statuses: ['Pending', 'Approved', 'Returned', 'Rejected', 'Cancelled'],
    flow: { Pending: [['Approved', 'Approve'], ['Rejected', 'Reject', 'danger'], ['Cancelled', 'Cancel leave', 'danger']], Approved: [['Returned', 'Mark returned to hostel'], ['Cancelled', 'Cancel leave', 'danger']] },
    cols: [['Type', r => html`${r.type}<small class="block">${r.block}, Room ${r.room}</small>`], ['From', r => U.fmtDate(r.from)], ['To', r => U.fmtDate(r.to)], ['Days', r => Math.round((U.parse(r.to) - U.parse(r.from)) / 864e5) + 1]],
    search: r => r.type + ' ' + r.room + ' ' + r.reason,
    rows: r => [['Leave type', r.type], ['Hostel', `${r.block}, Room ${r.room}`], ['From', U.fmtDate(r.from)], ['To', U.fmtDate(r.to)], ['Reason', r.reason], ['Guardian contact', r.contact]],
    fields: [{ name: 'type', label: 'Leave type', type: 'select', options: ['Home visit', 'Medical', 'Emergency', 'Local outing', 'Academic'], value: 'Home visit' },
      { name: 'block', label: 'Hostel block', type: 'select', options: ['Block A', 'Block B', 'Block C', 'Girls Hostel'], value: 'Block A' }, { name: 'room', label: 'Room number', required: true, maxlength: 6 },
      { name: 'contact', label: 'Guardian phone', type: 'tel', required: true }, { name: 'from', label: 'Leaving on', type: 'date', required: true, value: today, min: today }, { name: 'to', label: 'Returning on', type: 'date', required: true, value: today, min: today },
      { name: 'reason', label: 'Reason', type: 'textarea', required: true, span: 2 }],
    validate: v => v.to < v.from ? { to: 'Return date cannot be before the leaving date.' } : {}
  });

  /* ---------------- Canteen ---------------- */
  const CAT = ['Breakfast', 'Lunch', 'Snacks', 'Beverages'];
  A_('cn-order', el => {
    const m = S.find('canteenMenu', el.dataset.id);
    UI.form({
      title: `Order ${m.name}`, size: 'sm', submitLabel: 'Place order', note: `Price ${rs(m.price)} each.`,
      fields: [{ name: 'qty', label: 'Quantity', type: 'number', min: 1, max: 10, value: 1, required: true }, { name: 'pay', label: 'Payment (demo)', type: 'select', options: ['UPI', 'Card', 'Cash at counter'], value: 'UPI' }],
      onSubmit(v) {
        const o = S.add('canteenOrders', { id: S.nextId('CO'), sid: me().refId, item: m.name, itemId: m.id, qty: v.qty, total: m.price * v.qty, pay: v.pay, status: 'Preparing', token: 100 + S.all('canteenOrders').length + 1, date: today, time: stamp() });
        Notify.push({ to: 'admin', text: `Canteen order #${o.token}: ${o.qty} x ${o.item}`, type: 'info', link: 'canteen' });
        UI.toast(`Order placed. Your token is #${o.token}.`); SC.state.tabs.cn = 'orders'; Shell.refresh();
      }
    });
  });
  A_('cn-status', el => {
    const o = S.update('canteenOrders', el.dataset.id, { status: el.dataset.to });
    if (el.dataset.to !== 'Preparing') notifyStudent(o.sid, `Canteen order #${o.token} is ${el.dataset.to.toLowerCase()}.`, el.dataset.to === 'Ready' ? 'success' : 'info', 'canteen');
    UI.toast(`Order #${o.token} marked ${el.dataset.to}.`); Shell.refresh();
  });
  A_('cn-cancel', el => UI.confirm({ title: 'Cancel this order?', text: 'The canteen will be told to stop preparing it.', confirmLabel: 'Cancel order', danger: true, onConfirm: () => { S.update('canteenOrders', el.dataset.id, { status: 'Cancelled' }); UI.toast('Order cancelled.'); Shell.refresh(); } }));
  A_('cn-toggle', el => { const m = S.find('canteenMenu', el.dataset.id); S.update('canteenMenu', m.id, { available: !m.available }); Shell.refresh(); });
  A_('cn-add', () => UI.form({
    title: 'Add menu item', submitLabel: 'Add item',
    fields: [{ name: 'name', label: 'Item name', required: true, span: 2 }, { name: 'category', label: 'Category', type: 'select', options: CAT, value: 'Snacks' }, { name: 'price', label: 'Price (INR)', type: 'number', min: 1, max: 2000, required: true }],
    onSubmit(v) { S.add('canteenMenu', { id: S.nextId('MN'), name: v.name, category: v.category, price: v.price, available: true }); UI.toast('Menu item added.'); Shell.refresh(); }
  }));

  P.canteen = {
    title: 'Canteen',
    render() {
      const admin = me().role === 'admin', sid = me().refId, menu = S.all('canteenMenu');
      const orders = S.all('canteenOrders').filter(o => admin || o.sid === sid).sort((a, b) => b.time.localeCompare(a.time));
      const live = orders.filter(o => o.status !== 'Cancelled'), todays = live.filter(o => o.date === today);
      const orderRow = o => html`<tr><td><strong>#${o.token}</strong></td>${admin ? html`<td>${Dt.studentName(o.sid)}</td>` : ''}<td>${o.qty} x ${o.item}</td><td>${rs(o.total)}<small class="block">${o.pay}</small></td><td>${U.fmtDate(o.date)}</td><td>${badge(o.status)}</td>
        <td>${admin ? (o.status === 'Preparing' ? html`<button class="btn btn-ghost btn-sm" data-act="cn-status" data-id="${o.id}" data-to="Ready">Mark ready</button>` : o.status === 'Ready' ? html`<button class="btn btn-primary btn-sm" data-act="cn-status" data-id="${o.id}" data-to="Collected">Mark collected</button>` : '')
          : (o.status === 'Preparing' ? html`<button class="btn btn-ghost btn-sm" data-act="cn-cancel" data-id="${o.id}">Cancel</button>` : '')}</td></tr>`;
      const ordersTable = orders.length ? UI.card('', UI.table(['Token'].concat(admin ? ['Student'] : [], ['Order', 'Amount', 'Date', 'Status', '']), orders.map(orderRow)), { flush: true }) : UI.empty({ icon: 'utensils', title: 'No orders yet', text: admin ? 'Orders will appear here.' : 'Order something from the menu tab.' });
      const menuTable = UI.card('', UI.table(['Item', 'Category', 'Price', 'Status', ''], menu.map(m => html`<tr><td><strong>${m.name}</strong></td><td>${m.category}</td><td>${rs(m.price)}</td><td>${UI.badge(m.available ? 'Available' : 'Sold out', m.available ? 'success' : 'neutral')}</td>
        <td>${admin ? html`<button class="btn btn-ghost btn-sm" data-act="cn-toggle" data-id="${m.id}">${m.available ? 'Mark sold out' : 'Mark available'}</button>` : (m.available ? html`<button class="btn btn-primary btn-sm" data-act="cn-order" data-id="${m.id}">Order</button>` : '')}</td></tr>`)), { flush: true });
      const byItem = {}; live.forEach(o => { byItem[o.item] = (byItem[o.item] || 0) + o.total; });
      const salesData = Object.keys(byItem).sort((a, b) => byItem[b] - byItem[a]).slice(0, 6).map(k => ({ label: k, value: byItem[k], text: rs(byItem[k]), color: '#3557f2' }));
      const stats = admin ? html`<div class="grid stats">${UI.stat({ icon: 'receipt', label: 'Orders today', value: todays.length, tone: 'blue' })}${UI.stat({ icon: 'indian-rupee-sign', label: 'Sales today', value: rs(U.sum(todays.map(o => o.total))), tone: 'green' })}${UI.stat({ icon: 'fire-burner', label: 'In preparation', value: live.filter(o => o.status === 'Preparing').length, tone: 'orange' })}${UI.stat({ icon: 'utensils', label: 'Items on menu', value: menu.filter(m => m.available).length + ' / ' + menu.length, tone: 'purple' })}</div>`
        : html`<div class="grid stats">${UI.stat({ icon: 'receipt', label: 'My orders', value: live.length, tone: 'blue' })}${UI.stat({ icon: 'indian-rupee-sign', label: 'Total spent', value: rs(U.sum(live.map(o => o.total))), tone: 'green' })}${UI.stat({ icon: 'bell-concierge', label: 'Ready to collect', value: live.filter(o => o.status === 'Ready').length, tone: 'orange' })}</div>`;
      const tabs = [{ id: 'orders', label: admin ? 'Orders' : 'My orders', icon: 'receipt', count: orders.length }, { id: 'menu', label: 'Menu', icon: 'utensils' }].concat(admin ? [{ id: 'sales', label: 'Sales', icon: 'chart-column' }] : []);
      if (!admin && !SC.state.tabs.cn) SC.state.tabs.cn = 'menu';
      return html`<div class="page">${UI.pageHead('Canteen', admin ? 'Manage the menu, serve orders and track daily sales.' : 'Browse today\'s menu, order ahead and collect with your token.', admin ? html`<button class="btn btn-primary" data-act="cn-add"><i class="fa-solid fa-plus"></i> Add menu item</button>` : '')}${stats}${UI.tabs('cn', tabs)}
        ${UI.panel('cn', 'orders', ordersTable)}${UI.panel('cn', 'menu', menuTable)}${admin ? UI.panel('cn', 'sales', UI.card('Sales by item', salesData.length ? Ch.hbar(salesData) : UI.empty({ icon: 'chart-column', title: 'No sales yet' }), { icon: 'chart-bar' })) : ''}</div>`;
    }
  };
})();
