/* ==========================================================================
   SmartCampus Portal · js/student.js
   Student-only pieces: navigation config and the student dashboard page.
   Shared pages (timetable, attendance, assignments, events, library,
   announcements, help desk, profile) live in app.js.
   ========================================================================== */
(function () {
  'use strict';
  const SC = window.SC, { util: U, ui: UI, data: Dt, store: S, charts: Ch, pages: P } = SC;
  const html = U.html;

  function dashboard() {
    const user = SC.auth.user(), st = Dt.student(user.refId);
    const overall = Dt.overall(st.id);
    const today = SC.data && null; // placeholder not used
    const dayName = U.dayName(U.classDate());
    const todays = SC.store.all('timetable').filter(t => t.dept === st.dept && t.day === dayName).sort((a, b) => a.slot - b.slot);
    const pending = Dt.assignmentsFor(st.dept).filter(a => Dt.asgStatus(a, st.id) === 'Pending' || Dt.asgStatus(a, st.id) === 'Overdue').sort((a, b) => a.due.localeCompare(b.due));
    const upcomingEvents = SC.store.all('events').filter(e => U.daysUntil(e.date) >= 0).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3);
    const myTickets = SC.store.all('complaints').filter(c => c.sid === st.id);
    const openTickets = myTickets.filter(c => c.status === 'Open' || c.status === 'In Progress');
    const nextExam = Dt.examsFor(st.dept).find(e => U.daysUntil(e.date) >= 0);
    const perSub = Dt.perSubject(st.id).sort((a, b) => a.pct - b.pct);

    const stats = html`<div class="grid stats">
      ${UI.stat({ icon: 'chart-pie', label: 'Overall attendance', value: overall + '%', sub: overall < 75 ? 'Below the 75% requirement' : 'Meets requirement', tone: overall >= 75 ? 'green' : overall >= 60 ? 'orange' : 'red' })}
      ${UI.stat({ icon: 'file-pen', label: 'Pending assignments', value: pending.length, sub: pending.length ? `Next due ${U.fmtDate(pending[0].due)}` : 'All caught up', tone: pending.length ? 'orange' : 'teal' })}
      ${UI.stat({ icon: 'file-signature', label: 'Next examination', value: nextExam ? U.fmtDate(nextExam.date) : 'None scheduled', sub: nextExam ? Dt.subject(nextExam.code).name : '', tone: 'purple' })}
      ${UI.stat({ icon: 'ticket', label: 'Open help desk tickets', value: openTickets.length, sub: myTickets.length ? `${myTickets.length} total raised` : 'None raised', tone: openTickets.length ? 'blue' : 'teal' })}
    </div>`;

    const scheduleCard = UI.card(`Today's classes, ${U.fmtDay(U.classDate())}`, todays.length ? html`<div class="list">${todays.map(t => {
      const s = Dt.subject(t.code), cancelled = t.cancelledOn === U.classDate();
      return html`<div class="list-item"><div class="time-chip">${U.fmtTime(SC.SLOTS[t.slot][0])}</div><div class="grow"><strong>${s.name}</strong><small>${s.room}, ${Dt.facultyName(s.faculty)}</small></div>${cancelled ? UI.badge('Cancelled', 'danger') : UI.badge(s.type)}</div>`;
    })}</div>` : UI.empty({ icon: 'mug-hot', title: 'No classes today', text: 'Enjoy the free time or catch up on assignments.' }),
      { icon: 'calendar-day', actions: html`<button class="link-btn" data-act="go" data-page="timetable">Full timetable</button>` });

    const asgCard = UI.card('Assignments due soon', pending.length ? html`<div class="list">${pending.slice(0, 4).map(a => {
      const left = U.daysUntil(a.due);
      return html`<div class="list-item"><span class="dot-ico ${left < 0 ? 'red' : left <= 2 ? 'orange' : 'blue'}"><i class="fa-solid fa-file-pen"></i></span><div class="grow"><strong>${a.title}</strong><small>${a.code}</small></div>${UI.badge(left < 0 ? 'Overdue' : `Due in ${U.plural(left, 'day')}`, left < 0 ? 'danger' : left <= 2 ? 'warning' : 'info')}</div>`;
    })}</div>` : UI.empty({ icon: 'circle-check', title: 'No pending assignments', text: 'Great work staying on top of things!' }),
      { icon: 'file-lines', actions: html`<button class="link-btn" data-act="go" data-page="assignments">View all</button>` });

    const attCard = UI.card('Attendance by subject', Ch.hbar(perSub.slice(0, 5).map(r => ({ label: r.name, value: r.pct, text: r.pct + '%', color: r.pct >= 75 ? '#12a26a' : r.pct >= 60 ? '#e08a00' : '#e5484d' }))),
      { icon: 'chart-bar', actions: html`<button class="link-btn" data-act="go" data-page="attendance">Details</button>` });

    const eventsCard = UI.card('Upcoming events', upcomingEvents.length ? html`<div class="list">${upcomingEvents.map(e => html`
      <div class="list-item"><div class="date-block sm"><strong>${U.parse(e.date).getDate()}</strong><span>${U.parse(e.date).toLocaleDateString('en-US', { month: 'short' })}</span></div>
        <div class="grow"><strong>${e.title}</strong><small>${e.venue}</small></div>${e.registered.includes(st.id) ? UI.badge('Registered', 'success') : ''}</div>`)}</div>`
      : UI.empty({ icon: 'calendar-xmark', title: 'No upcoming events' }), { icon: 'calendar-days', actions: html`<button class="link-btn" data-act="go" data-page="events">Browse events</button>` });

    const annList = Dt.visibleAnnouncements('student').slice(0, 3);
    const annCard = UI.card('Latest announcements', annList.length ? html`<div class="stack tight">${annList.map(a => html`
      <div class="mini-ann"><div class="ann-head"><strong>${a.title}</strong>${a.pinned ? UI.badge('Pinned', 'purple') : ''}</div><p class="clamp-1">${a.body}</p><small class="muted">${U.fmtDate(a.date)}, ${a.author}</small></div>`)}</div>`
      : UI.empty({ icon: 'bullhorn', title: 'No announcements yet' }), { icon: 'bullhorn', actions: html`<button class="link-btn" data-act="go" data-page="announcements">View all</button>` });

    return html`<div class="page">
      ${UI.pageHead(`Welcome back, ${st.name.split(' ')[0]}`, `${Dt.dept(st.dept)}, Semester ${st.sem}, Section ${st.section}, Roll number ${st.id}`)}
      ${stats}
      <div class="grid two">${scheduleCard}${asgCard}</div>
      <div class="grid two">${attCard}${eventsCard}</div>
      ${annCard}
    </div>`;
  }

  P.dashboard = { title: 'Dashboard', render: dashboard };

  SC.shell.start({
    role: 'student',
    nav: [
      { id: 'dashboard', label: 'Dashboard', icon: 'gauge-high' },
      { heading: 'Academics' },
      { id: 'timetable', label: 'Timetable', icon: 'calendar-days' },
      { id: 'attendance', label: 'Attendance', icon: 'chart-pie' },
      { id: 'assignments', label: 'Assignments & Exams', icon: 'file-signature' },
      { heading: 'Campus life' },
      { id: 'events', label: 'Campus Events', icon: 'calendar-star' },
      { id: 'library', label: 'Library', icon: 'book' },
      { id: 'announcements', label: 'Announcements', icon: 'bullhorn' },
      { id: 'gatepass', label: 'Gate Pass', icon: 'id-card-clip' },
      { id: 'hostelpass', label: 'Hostel Get Pass', icon: 'door-open', badge: () => SC.store.all('hostelPasses').filter(r => r.sid === SC.auth.user().refId && r.status === 'Approved').length },
      { id: 'hostelleave', label: 'Hostel Leave', icon: 'bed' },
      { id: 'canteen', label: 'Canteen', icon: 'utensils' },
      { id: 'helpdesk', label: 'Help Desk', icon: 'headset', badge: () => SC.store.all('complaints').filter(c => c.sid === SC.auth.user().refId && (c.status === 'Open' || c.status === 'In Progress')).length },
      { heading: 'Account' },
      { id: 'profile', label: 'Profile & Settings', icon: 'user-gear' }
    ],
    pages: P
  });
})();
