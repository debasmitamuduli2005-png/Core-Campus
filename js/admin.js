/* ==========================================================================
   SmartCampus Portal · js/admin.js
   Administration-only pieces: navigation config and the admin dashboard page.
   ========================================================================== */
(function () {
  'use strict';
  const SC = window.SC, { util: U, ui: UI, data: Dt, store: S, charts: Ch, pages: P } = SC;
  const html = U.html;
  const db = () => ({ students: S.all('students'), faculty: S.all('faculty'), complaints: S.all('complaints'), events: S.all('events'), books: S.all('books') });

  function dashboard() {
    const d = db();
    const open = d.complaints.filter(c => c.status === 'Open' || c.status === 'In Progress');
    const highPriority = open.filter(c => c.priority === 'High');
    const upcomingEvents = d.events.filter(e => U.daysUntil(e.date) >= 0).sort((a, b) => a.date.localeCompare(b.date));
    const avgAtt = Dt.avgAttendance();
    const avgCgpa = U.avg(d.students.map(s => s.cgpa));
    const activity = S.all('activity').slice(0, 6);

    const stats = html`<div class="grid stats">
      ${UI.stat({ icon: 'user-graduate', label: 'Total students', value: d.students.length, sub: `${d.students.filter(s => s.status === 'Active').length} active`, tone: 'blue' })}
      ${UI.stat({ icon: 'chalkboard-user', label: 'Total faculty', value: d.faculty.length, tone: 'purple' })}
      ${UI.stat({ icon: 'chart-pie', label: 'Average attendance', value: avgAtt + '%', tone: avgAtt >= 75 ? 'green' : 'orange' })}
      ${UI.stat({ icon: 'ticket', label: 'Open tickets', value: open.length, sub: highPriority.length ? `${highPriority.length} high priority` : 'None urgent', tone: highPriority.length ? 'red' : 'teal' })}
    </div>`;

    const deptStats = Object.keys(Dt.DEPTS).map((k, i) => ({ label: k, value: d.students.filter(s => s.dept === k).length, color: SC.PALETTE[i] }));
    const deptCard = UI.card('Students by department', Ch.donut(deptStats.map(x => ({ label: Dt.dept(x.label), value: x.value, color: x.color })), { center: d.students.length }), { icon: 'chart-pie', actions: html`<button class="link-btn" data-act="go" data-page="reports">Full report</button>` });

    const attByDept = Object.keys(Dt.DEPTS).map(k => ({ label: k, value: Dt.deptAttendance(k) }));
    const attCard = UI.card('Attendance by department', Ch.bar(attByDept, { unit: '%' }), { icon: 'chart-bar', actions: html`<button class="link-btn" data-act="go" data-page="attendance">Details</button>` });

    const ticketCard = UI.card('Recent tickets', open.length ? html`<div class="list">${open.slice(0, 5).map(c => html`
      <div class="list-item row-click" data-act="cmp-open" data-id="${c.id}"><span class="dot-ico ${c.priority === 'High' ? 'red' : c.priority === 'Medium' ? 'orange' : 'blue'}"><i class="fa-solid fa-ticket"></i></span>
        <div class="grow"><strong>${c.subject}</strong><small>${Dt.studentName(c.sid)}, ${c.category}</small></div>${UI.badge(c.status)}</div>`)}</div>`
      : UI.empty({ icon: 'thumbs-up', title: 'No open tickets' }), { icon: 'headset', actions: html`<button class="link-btn" data-act="go" data-page="complaints">View all</button>` });

    const eventCard = UI.card('Upcoming events', upcomingEvents.length ? html`<div class="list">${upcomingEvents.slice(0, 4).map(e => html`
      <div class="list-item"><div class="date-block sm"><strong>${U.parse(e.date).getDate()}</strong><span>${U.parse(e.date).toLocaleDateString('en-US', { month: 'short' })}</span></div>
        <div class="grow"><strong>${e.title}</strong><small>${e.venue}</small></div><small class="muted">${e.registered.length} / ${e.capacity}</small></div>`)}</div>`
      : UI.empty({ icon: 'calendar-xmark', title: 'No upcoming events' }), { icon: 'calendar-days', actions: html`<button class="link-btn" data-act="go" data-page="events">Manage events</button>` });

    const activityCard = UI.card('Recent activity', activity.length ? html`<ul class="feed">${activity.map(a => html`<li><span class="feed-ico"><i class="fa-solid fa-${a.icon}"></i></span><div><span>${a.text}</span><time>${U.timeAgo(a.time)}</time></div></li>`)}</ul>` : UI.empty({ icon: 'clock', title: 'No recent activity' }), { icon: 'timeline' });

    return html`<div class="page">
      ${UI.pageHead('Administration overview', `Institute-wide snapshot. Average CGPA is ${avgCgpa.toFixed(2)}.`)}
      ${stats}
      <div class="grid two">${deptCard}${attCard}</div>
      <div class="grid two">${ticketCard}${eventCard}</div>
      ${activityCard}
    </div>`;
  }

  P.dashboard = { title: 'Dashboard', render: dashboard };

  SC.shell.start({
    role: 'admin',
    nav: [
      { id: 'dashboard', label: 'Dashboard', icon: 'gauge-high' },
      { heading: 'People' },
      { id: 'students', label: 'Students', icon: 'user-graduate' },
      { id: 'faculty', label: 'Faculty', icon: 'chalkboard-user' },
      { heading: 'Academics' },
      { id: 'timetable', label: 'Timetable', icon: 'calendar-days' },
      { id: 'attendance', label: 'Attendance', icon: 'chart-pie' },
      { id: 'assignments', label: 'Assignments & Exams', icon: 'file-signature' },
      { heading: 'Campus services' },
      { id: 'events', label: 'Campus Events', icon: 'calendar-star' },
      { id: 'library', label: 'Library', icon: 'book', badge: () => SC.store.all('issues').filter(i => ['Issue Requested', 'Return Requested'].includes(i.status)).length },
      { id: 'announcements', label: 'Announcements', icon: 'bullhorn' },
      { id: 'gatepass', label: 'Gate Pass', icon: 'id-card-clip', badge: () => SC.store.all('gatePasses').filter(r => r.status === 'Pending').length },
      { id: 'hostelpass', label: 'Hostel Get Pass', icon: 'door-open', badge: () => SC.store.all('hostelPasses').filter(r => r.status === 'Pending').length },
      { id: 'hostelleave', label: 'Hostel Leave', icon: 'bed', badge: () => SC.store.all('hostelLeaves').filter(r => r.status === 'Pending').length },
      { id: 'canteen', label: 'Canteen', icon: 'utensils' },
      { id: 'complaints', label: 'Complaints & Requests', icon: 'headset', badge: () => Dt.openTickets().length },
      { heading: 'Insights' },
      { id: 'reports', label: 'Reports', icon: 'chart-column' },
      { heading: 'Account' },
      { id: 'profile', label: 'Profile & Settings', icon: 'user-gear' }
    ],
    pages: P
  });
})();
