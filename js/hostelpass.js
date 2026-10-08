/* ==========================================================================
   SmartCampus Portal · js/hostelpass.js
   Hostel get pass (out-pass) for hostellers.
   Student: apply -> warden approves -> digital pass with code + barcode.
   Admin / warden / security: approve, gate desk (check out / check in by
   pass code), overdue tracking, late-return flags, CSV export.
   Loaded after app.js + auth.js on student.html and admin.html.
   ========================================================================== */
(function () {
  'use strict';
  const SC = window.SC, { util: U, ui: UI, data: Dt, store: S, pages: P, notify: Notify, shell: Shell } = SC;
  const html = U.html, me = () => SC.auth.user(), A_ = SC.registerAction, V = {};
  const COLL = 'hostelPasses', CURFEW = '21:00';
  const BLOCKS = ['Block A', 'Block B', 'Block C', 'Girls Hostel'];
  const PURPOSES = ['Medical', 'Shopping', 'Personal work', 'Family visit', 'Academic', 'Other'];
  const TONES = { Pending: 'warning', Approved: 'success', Out: 'info', Returned: 'success', Rejected: 'danger', Cancelled: 'neutral', Overdue: 'danger' };
  const today = U.iso();

  /* ---------- Derived state ---------- */
  const dueAt = r => new Date(`${r.date}T${r.returnTime}`);
  const overdue = r => r.status === 'Out' && new Date() > dueAt(r);
  const lateBack = r => r.status === 'Returned' && r.inAt && new Date(r.inAt) > dueAt(r);
  const shownStatus = r => overdue(r) ? 'Overdue' : r.status;
  const code = r => 'HP-' + (U.hash(r.id) % 1679616).toString(36).toUpperCase().padStart(4, '0');
  const clock = iso => iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : '-';
  const statusBadge = r => html`${UI.badge(shownStatus(r), TONES[shownStatus(r)])}${lateBack(r) ? UI.badge('Returned late', 'danger') : ''}${r.afterCurfew && r.status === 'Pending' ? UI.badge('After curfew', 'warning') : ''}`;
  const notifyStudent = (sid, text, type) => { const u = Dt.userOf(sid); Notify.push({ to: 'student', uid: u && u.id, text, type, link: 'hostelpass' }); };

  function barcode(seed) {
    const h = U.hash(seed); let x = 0, bars = '';
    for (let i = 0; i < 36; i++) { const w = 1 + ((h >> (i % 24)) + i) % 3; if (i % 2 === 0) bars += `<rect x="${x}" y="0" width="${w}" height="36" fill="currentColor"/>`; x += w + 1; }
    return U.raw(`<svg viewBox="0 0 ${x} 36" height="36" role="img" aria-label="Pass barcode">${bars}</svg>`);
  }

  /* ---------- Sample data (once per fresh / reset database) ---------- */
  (function seed() {
    if (S.all(COLL).length) return;
    const ids = S.all('students').slice(0, 6).map(s => s.id);
    ids.forEach((id, i) => S.update('students', id, { hostel: { block: BLOCKS[i % 3], room: String(101 + i * 13) } }));
    const iso = (d, t) => new Date(`${U.dayOffset(d)}T${t}`).toISOString();
    const add = (i, purpose, dest, d, out, back, status, extra) => {
      const st = Dt.student(ids[i]);
      S.add(COLL, Object.assign({ id: S.nextId('HP'), sid: ids[i], purpose, destination: dest, date: U.dayOffset(d), outTime: out, returnTime: back, block: st.hostel.block, room: st.hostel.room,
        guardianInformed: true, status, created: U.dayOffset(d - 1), remarks: [{ by: 'System', text: 'Get pass requested.', date: U.dayOffset(d - 1) }] }, extra || {}));
    };
    add(0, 'Shopping', 'City Centre Mall', 0, '16:00', '19:00', 'Pending');
    add(1, 'Medical', 'District Hospital', 0, '17:00', '20:30', 'Approved');
    add(2, 'Family visit', 'Relative\'s home', 1, '15:00', '21:30', 'Pending', { afterCurfew: true });
    add(3, 'Personal work', 'Bank and post office', -1, '10:00', '13:00', 'Returned', { outAt: iso(-1, '10:05'), inAt: iso(-1, '12:40') });
    add(4, 'Shopping', 'Local market', -1, '17:00', '19:00', 'Out', { outAt: iso(-1, '17:10') });
    add(5, 'Academic', 'Stationery shop', -2, '11:00', '12:30', 'Returned', { outAt: iso(-2, '11:05'), inAt: iso(-2, '13:15') });
    add(2, 'Personal work', 'Salon', -3, '16:00', '18:00', 'Rejected');
  })();

  /* ---------- Detail view ---------- */
  function detail(id) {
    const r = S.find(COLL, id); if (!r) return;
    const admin = me().role === 'admin';
    const acts = admin
      ? (r.status === 'Pending' ? [['Approved', 'Approve'], ['Rejected', 'Reject', 'danger']] : r.status === 'Approved' ? [['Out', 'Mark out at gate']] : r.status === 'Out' ? [['Returned', 'Mark returned']] : [])
      : (['Pending', 'Approved'].includes(r.status) ? [['Cancelled', 'Cancel pass', 'danger']] : []);
    UI.modal({
      title: `${r.id}, hostel get pass`, size: 'lg',
      body: html`<div class="ann-head mb">${statusBadge(r)}</div>
        ${['Approved', 'Out'].includes(r.status) ? html`<div class="note mb" style="display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap">
          <div><strong>Digital get pass</strong><br><span style="font-family:monospace;font-size:1.3rem;letter-spacing:2px">${code(r)}</span><br><small>Show this code to security at the hostel gate. Valid only on ${U.fmtDate(r.date)}.</small></div>
          <div>${barcode(r.id)}</div></div>` : ''}
        ${overdue(r) ? html`<div class="note mb"><strong>Overdue.</strong> This student was due back at ${U.fmtTime(r.returnTime)} and has not been checked in.</div>` : ''}
        <dl class="details mb"><dt>Student</dt><dd>${Dt.studentName(r.sid)} (${r.sid})</dd><dt>Hostel</dt><dd>${r.block}, Room ${r.room}</dd>
          <dt>Purpose</dt><dd>${r.purpose}</dd><dt>Destination</dt><dd>${r.destination}</dd><dt>Date</dt><dd>${U.fmtDate(r.date)}</dd>
          <dt>Out / return by</dt><dd>${U.fmtTime(r.outTime)} to ${U.fmtTime(r.returnTime)}</dd>
          <dt>Guardian informed</dt><dd>${r.guardianInformed ? 'Yes' : 'No'}</dd><dt>Gate log</dt><dd>Out ${clock(r.outAt)}, in ${clock(r.inAt)}</dd></dl>
        <h4 class="mb-sm">Activity</h4><ul class="timeline">${r.remarks.map(x => html`<li><strong>${x.by}</strong><span>${x.text}</span><time>${U.fmtDate(x.date)}</time></li>`)}</ul>`,
      footer: html`<button class="btn btn-ghost" data-act="close-modal">Close</button>${acts.map(([to, label, kind]) => html`<button class="btn ${kind === 'danger' ? 'btn-danger' : 'btn-primary'}" data-act="hp-set" data-id="${r.id}" data-to="${to}">${label}</button>`)}`
    });
  }
  A_('hp-open', el => detail(el.dataset.id));

  /* ---------- Status changes ---------- */
  function setStatus(id, to, note) {
    const r = S.find(COLL, id), user = me(), admin = user.role === 'admin';
    if (to === 'Out' && r.date !== today) { UI.toast(`This pass is valid only on ${U.fmtDate(r.date)}.`, 'error'); return; }
    const text = note || ({ Approved: 'Approved by warden.', Out: 'Checked out at the hostel gate.', Returned: 'Checked back in at the hostel gate.', Cancelled: 'Cancelled by student.' }[to] || `Status changed to ${to}.`);
    r.status = to; r.remarks.push({ by: admin ? user.name : 'Student', text, date: U.iso() });
    if (to === 'Out') r.outAt = new Date().toISOString();
    if (to === 'Returned') { r.inAt = new Date().toISOString(); if (lateBack(r)) r.remarks.push({ by: 'System', text: 'Returned after the expected time.', date: U.iso() }); }
    S.save();
    if (admin) notifyStudent(r.sid, `Hostel get pass ${r.id} is ${to === 'Out' ? 'checked out' : to.toLowerCase()}.`, to === 'Rejected' ? 'danger' : 'success');
    else Notify.push({ to: 'admin', text: `${Dt.studentName(r.sid)} cancelled get pass ${r.id}.`, type: 'info', link: 'hostelpass' });
    UI.toast(`Get pass ${r.id}: ${to}.`); UI.closeModal(); Shell.refresh();
  }
  A_('hp-set', el => {
    const { id, to } = el.dataset;
    if (to === 'Rejected') return UI.form({ title: 'Reject get pass', submitLabel: 'Reject', fields: [{ name: 'note', label: 'Reason for rejection', type: 'textarea', required: true, span: 2 }], onSubmit: v => { setStatus(id, 'Rejected', 'Rejected: ' + v.note); } });
    if (to === 'Cancelled') return UI.confirm({ title: 'Cancel this get pass?', text: 'The pass will no longer be valid at the gate.', confirmLabel: 'Cancel pass', danger: true, onConfirm: () => setStatus(id, to) });
    setStatus(id, to);
  });

  /* ---------- Apply ---------- */
  A_('hp-new', () => {
    const st = Dt.student(me().refId), h = st.hostel || {};
    UI.form({
      title: 'Apply for a hostel get pass', size: 'lg', submitLabel: 'Submit request',
      note: `Hostel curfew is ${U.fmtTime(CURFEW)}. Passes with a return time after curfew need the warden's special approval.`,
      fields: [
        { name: 'purpose', label: 'Purpose', type: 'select', options: PURPOSES, value: 'Personal work' },
        { name: 'destination', label: 'Destination', required: true, placeholder: 'Where are you going?' },
        { name: 'date', label: 'Date', type: 'date', required: true, value: today, min: today },
        { name: 'outTime', label: 'Out time', type: 'time', required: true, value: '16:00' },
        { name: 'returnTime', label: 'Return by', type: 'time', required: true, value: '19:00' },
        { name: 'block', label: 'Hostel block', type: 'select', options: BLOCKS, value: h.block || 'Block A' },
        { name: 'room', label: 'Room number', required: true, maxlength: 6, value: h.room || '' },
        { name: 'guardianInformed', label: '', type: 'checkbox', checkLabel: 'My parent or guardian knows I am going out', required: true, span: 2 }
      ],
      validate(v) {
        const e = {};
        if (v.returnTime <= v.outTime) e.returnTime = 'Return time must be after the out time.';
        if (S.all(COLL).some(r => r.sid === st.id && r.date === v.date && ['Pending', 'Approved', 'Out'].includes(r.status))) e.date = 'You already have an active get pass for this date.';
        return e;
      },
      onSubmit(v) {
        const late = v.returnTime > CURFEW;
        S.update('students', st.id, { hostel: { block: v.block, room: v.room } });
        const r = S.add(COLL, { id: S.nextId('HP'), sid: st.id, purpose: v.purpose, destination: v.destination, date: v.date, outTime: v.outTime, returnTime: v.returnTime, block: v.block, room: v.room,
          guardianInformed: v.guardianInformed, afterCurfew: late, status: 'Pending', created: U.iso(),
          remarks: [{ by: 'System', text: late ? 'Get pass requested with a return time after curfew.' : 'Get pass requested.', date: U.iso() }] });
        Notify.push({ to: 'admin', text: `New hostel get pass request from ${st.name}${late ? ' (after curfew)' : ''}`, type: 'warning', link: 'hostelpass' });
        S.log(`${st.name} requested a hostel get pass`, 'door-open');
        UI.toast(`Get pass ${r.id} submitted. You will be notified when the warden decides.`); Shell.refresh();
      }
    });
  });

  /* ---------- Admin: gate desk + export ---------- */
  A_('hp-lookup', () => {
    const input = document.getElementById('hpCode'), q = (input.value || '').trim().toUpperCase();
    if (!q) { UI.toast('Enter a pass code, for example HP-1A2B.', 'error'); return; }
    const r = S.all(COLL).find(x => code(x) === q || x.id.toUpperCase() === q);
    if (!r) { UI.toast(`No get pass found for ${q}.`, 'error'); return; }
    input.value = ''; detail(r.id);
  });
  A_('hp-export', () => {
    const rows = S.all(COLL).map(r => [r.id, r.sid, Dt.studentName(r.sid), r.block, r.room, r.purpose, r.destination, r.date, r.outTime, r.returnTime, shownStatus(r), clock(r.outAt), clock(r.inAt), lateBack(r) ? 'Yes' : 'No']);
    U.download('hostel-get-pass-log.csv', U.toCSV(['Pass', 'Roll no', 'Student', 'Block', 'Room', 'Purpose', 'Destination', 'Date', 'Out time', 'Return by', 'Status', 'Gate out', 'Gate in', 'Returned late'], rows));
    UI.toast('Get pass log downloaded.');
  });

  /* ---------- Page ---------- */
  P.hostelpass = {
    title: 'Hostel get pass',
    render() {
      const admin = me().role === 'admin', sid = me().refId;
      const mine = () => S.all(COLL).filter(r => admin || r.sid === sid);
      const key = 'hp' + admin;
      V[key] = V[key] || UI.dataView({
        id: key, initial: { status: 'all' },
        filters: [{ key: 'q', type: 'search', placeholder: admin ? 'Search by student, room or pass ID' : 'Search your passes' },
          { key: 'status', type: 'select', label: 'Status', options: [['all', 'All status']].concat(['Pending', 'Approved', 'Out', 'Overdue', 'Returned', 'Rejected', 'Cancelled'].map(s => [s, s])) }],
        getRows: st => mine().filter(r => (st.status === 'all' || shownStatus(r) === st.status) && U.matches(st.q, r.id, code(r), Dt.studentName(r.sid), r.room, r.destination, r.purpose)).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)),
        renderRows: list => UI.card('', UI.table(['Pass'].concat(admin ? ['Student'] : [], ['Purpose', 'Date', 'Out / return by', 'Status']), list.map(r => html`<tr class="row-click" data-act="hp-open" data-id="${r.id}">
          <td><strong>${r.id}</strong></td>${admin ? html`<td>${Dt.studentName(r.sid)}<small class="block">${r.block}, Room ${r.room}</small></td>` : ''}
          <td>${r.purpose}<small class="block">${r.destination}</small></td><td>${U.fmtDate(r.date)}</td><td>${U.fmtTime(r.outTime)} to ${U.fmtTime(r.returnTime)}</td><td>${statusBadge(r)}</td></tr>`)), { flush: true }),
        empty: { icon: 'door-open', title: 'No get passes found', text: admin ? 'Requests from hostellers will appear here.' : 'Use "Apply for get pass" to request one.' }
      });
      const all = mine(), n = s => all.filter(r => shownStatus(r) === s).length;
      const stats = admin
        ? html`<div class="grid stats">${UI.stat({ icon: 'hourglass-half', label: 'Awaiting approval', value: n('Pending'), tone: 'orange' })}${UI.stat({ icon: 'person-walking-arrow-right', label: 'Currently out', value: n('Out') + n('Overdue'), tone: 'blue' })}${UI.stat({ icon: 'triangle-exclamation', label: 'Overdue', value: n('Overdue'), sub: n('Overdue') ? 'Contact guardian' : 'All on time', tone: n('Overdue') ? 'red' : 'teal' })}${UI.stat({ icon: 'calendar-day', label: 'Passes today', value: all.filter(r => r.date === today && !['Rejected', 'Cancelled'].includes(r.status)).length, tone: 'purple' })}</div>`
        : html`<div class="grid stats">${UI.stat({ icon: 'hourglass-half', label: 'Pending', value: n('Pending'), tone: 'orange' })}${UI.stat({ icon: 'circle-check', label: 'Approved', value: n('Approved') + n('Out'), tone: 'green' })}${UI.stat({ icon: 'flag-checkered', label: 'Completed', value: n('Returned'), tone: 'blue' })}${UI.stat({ icon: 'clock', label: 'Late returns', value: all.filter(lateBack).length, tone: all.filter(lateBack).length ? 'red' : 'teal' })}</div>`;
      let top = '';
      if (!admin) {
        const live = all.filter(r => ['Approved', 'Out'].includes(r.status) && r.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0];
        if (live) top = UI.card('Your active get pass', html`<div style="display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap"><div><span style="font-family:monospace;font-size:1.5rem;letter-spacing:2px">${code(live)}</span> ${statusBadge(live)}<br><small>${live.destination}, ${U.fmtDate(live.date)}, back by ${U.fmtTime(live.returnTime)}</small></div><div>${barcode(live.id)}</div><button class="btn btn-primary" data-act="hp-open" data-id="${live.id}">View pass</button></div>`, { icon: 'qrcode' });
      }
      const out = admin ? all.filter(r => r.status === 'Out') : [];
      const desk = admin ? UI.card('Gate desk', html`<div class="toolbar"><label class="search-field"><i class="fa-solid fa-qrcode"></i><input class="input" id="hpCode" placeholder="Enter pass code, e.g. HP-1A2B" aria-label="Pass code" autocomplete="off"></label><button class="btn btn-primary" data-act="hp-lookup">Look up pass</button></div>
        <h4 class="mb-sm mt">Students currently out (${out.length})</h4>
        ${out.length ? html`<div class="list">${out.map(r => html`<div class="list-item row-click" data-act="hp-open" data-id="${r.id}"><span class="dot-ico ${overdue(r) ? 'red' : 'blue'}"><i class="fa-solid fa-person-walking-arrow-right"></i></span><div class="grow"><strong>${Dt.studentName(r.sid)}</strong><small>${r.block}, Room ${r.room}, out ${clock(r.outAt)}, due ${U.fmtTime(r.returnTime)}</small></div>${UI.badge(overdue(r) ? 'Overdue' : 'Out', overdue(r) ? 'danger' : 'info')}</div>`)}</div>` : UI.empty({ icon: 'house-circle-check', title: 'Everyone is inside', text: 'Students who check out at the gate will be listed here.' })}`, { icon: 'shield-halved' }) : '';
      const tabs = admin ? html`${UI.tabs('hp', [{ id: 'req', label: 'Requests', icon: 'list', count: all.length }, { id: 'gate', label: 'Gate desk', icon: 'shield-halved', count: out.length }])}${UI.panel('hp', 'req', V[key].html())}${UI.panel('hp', 'gate', desk)}` : V[key].html();
      return html`<div class="page">${UI.pageHead('Hostel get pass', admin ? 'Approve out-passes, check students out and in at the gate, and spot late returns.' : 'Request permission to go out of the hostel and show your digital pass at the gate.',
        admin ? html`<button class="btn btn-ghost" data-act="hp-export"><i class="fa-solid fa-download"></i> Export log</button>` : html`<button class="btn btn-primary" data-act="hp-new"><i class="fa-solid fa-plus"></i> Apply for get pass</button>`)}${stats}${top}${tabs}</div>`;
    },
    mount(root) {
      V['hp' + (me().role === 'admin')].mount(root);
      const c = root.querySelector('#hpCode');
      if (c) c.addEventListener('keydown', ev => { if (ev.key === 'Enter') SC.actions['hp-lookup'](); });
    }
  };
})();
