/* ==========================================================================
   SmartCampus Portal · js/faculty.js
   Faculty-only pieces: navigation config and the faculty dashboard page.
   ========================================================================== */
(function () {
  'use strict';
  const SC = window.SC, { util: U, ui: UI, data: Dt, store: S, charts: Ch, pages: P } = SC;
  const html = U.html;

  function dashboard() {
    const user = SC.auth.user(), f = Dt.faculty(user.refId);
    const subs = Dt.subjectsTaughtBy(f.id);
    const dayName = U.dayName(U.classDate());
    const todays = SC.store.all('timetable').filter(t => subs.some(s => s.code === t.code) && t.day === dayName).sort((a, b) => a.slot - b.slot);
    const myAsg = SC.store.all('assignments').filter(a => subs.some(s => s.code === a.code));
    const toGrade = SC.store.all('submissions').filter(sub => myAsg.some(a => a.id === sub.aid) && sub.status !== 'Graded');
    const openQueries = SC.store.all('queries').filter(q => q.fid === f.id && q.status === 'Open');
    const pendingPasses = SC.store.all('gatePasses').filter(r => r.status === 'Pending');
    const pendingLeaves = SC.store.all('hostelLeaves').filter(r => r.status === 'Pending');
    const studentCount = U.unique(subs.map(s => s.dept)).reduce((n, d) => n + Dt.studentsOfDept(d).filter(s => s.status === 'Active').length, 0);
    const avgAtt = Math.round(U.avg(subs.map(s => Dt.deptAttendance(s.dept))) || 0);

    const stats = html`<div class="grid stats">
      ${UI.stat({ icon: 'chalkboard', label: 'Subjects assigned', value: subs.length, tone: 'blue' })}
      ${UI.stat({ icon: 'users', label: 'Students taught', value: studentCount, tone: 'purple' })}
      ${UI.stat({ icon: 'file-circle-check', label: 'Submissions to grade', value: toGrade.length, tone: toGrade.length ? 'orange' : 'teal' })}
      ${UI.stat({ icon: 'comments', label: 'Open student queries', value: openQueries.length, tone: openQueries.length ? 'blue' : 'teal' })}
      ${UI.stat({ icon: 'id-card-clip', label: 'Gate passes to review', value: pendingPasses.length, tone: pendingPasses.length ? 'orange' : 'teal' })}
      ${UI.stat({ icon: 'bed', label: 'Leave requests to review', value: pendingLeaves.length, tone: pendingLeaves.length ? 'orange' : 'teal' })}
    </div>`;

    const scheduleCard = UI.card(`Today's classes, ${U.fmtDay(U.classDate())}`, todays.length ? html`<div class="list">${todays.map(t => {
      const s = Dt.subject(t.code), cancelled = t.cancelledOn === U.classDate();
      return html`<div class="list-item"><div class="time-chip">${U.fmtTime(SC.SLOTS[t.slot][0])}</div><div class="grow"><strong>${s.name}</strong><small>${Dt.dept(t.dept)}, ${s.room}</small></div>${cancelled ? UI.badge('Cancelled', 'danger') : ''}</div>`;
    })}</div>` : UI.empty({ icon: 'mug-hot', title: 'No classes today' }), { icon: 'calendar-day', actions: html`<button class="link-btn" data-act="go" data-page="timetable">Full timetable</button>` });

    const gradeList = toGrade.slice(0, 5).map(sub => { const a = SC.store.find('assignments', sub.aid); return { sub, a }; }).filter(x => x.a);
    const gradeCard = UI.card('Recent submissions to grade', gradeList.length ? html`<div class="list">${gradeList.map(({ sub, a }) => html`
      <div class="list-item"><span class="dot-ico blue"><i class="fa-solid fa-file-arrow-up"></i></span><div class="grow"><strong>${Dt.studentName(sub.sid)}</strong><small>${a.title}</small></div><button class="btn btn-sm btn-soft" data-act="asg-grade-one" data-id="${sub.id}" data-max="${a.maxMarks}">Grade</button></div>`)}</div>`
      : UI.empty({ icon: 'circle-check', title: 'Nothing to grade', text: 'All caught up on submissions.' }), { icon: 'file-pen', actions: html`<button class="link-btn" data-act="go" data-page="assignments">View all</button>` });

    const attRows = subs.map(s => ({ label: s.code, value: Dt.deptAttendance(s.dept) }));
    const attCard = UI.card('Attendance overview', subs.length ? Ch.bar(attRows, { unit: '%' }) : UI.empty({ icon: 'chart-simple', title: 'No subjects assigned yet' }), { icon: 'chart-bar', actions: html`<button class="link-btn" data-act="go" data-page="attendance">Mark attendance</button>` });

    const queryCard = UI.card('Recent student queries', openQueries.length ? html`<div class="stack tight">${openQueries.slice(0, 3).map(q => html`
      <div class="mini-ann"><div class="ann-head"><strong>${q.subject}</strong>${UI.badge(q.code, 'neutral')}</div><p class="clamp-1">${Dt.studentName(q.sid)}: ${q.message}</p></div>`)}</div>`
      : UI.empty({ icon: 'comments', title: 'No open queries' }), { icon: 'comments', actions: html`<button class="link-btn" data-act="go" data-page="requests">View all</button>` });

    const annList = Dt.visibleAnnouncements('faculty').slice(0, 3);
    const annCard = UI.card('Latest announcements', annList.length ? html`<div class="stack tight">${annList.map(a => html`
      <div class="mini-ann"><div class="ann-head"><strong>${a.title}</strong>${a.pinned ? UI.badge('Pinned', 'purple') : ''}</div><p class="clamp-1">${a.body}</p><small class="muted">${U.fmtDate(a.date)}</small></div>`)}</div>`
      : UI.empty({ icon: 'bullhorn', title: 'No announcements yet' }), { icon: 'bullhorn', actions: html`<button class="link-btn" data-act="go" data-page="announcements">View all</button>` });

    return html`<div class="page">
      ${UI.pageHead(`Welcome back, ${f.name.split(' ').slice(-1)[0] === f.name ? f.name : f.name}`, `${f.designation}, ${Dt.dept(f.dept)}. Subjects: ${subs.map(s => s.code).join(', ') || 'None assigned'}.`)}
      ${stats}
      <div class="grid two">${scheduleCard}${gradeCard}</div>
      <div class="grid two">${attCard}${queryCard}</div>
      ${annCard}
    </div>`;
  }

  P.dashboard = { title: 'Dashboard', render: dashboard };

  SC.shell.start({
    role: 'faculty',
    nav: [
      { id: 'dashboard', label: 'Dashboard', icon: 'gauge-high' },
      { heading: 'Teaching' },
      { id: 'timetable', label: 'Timetable', icon: 'calendar-days' },
      { id: 'attendance', label: 'Attendance', icon: 'chart-pie' },
      { id: 'assignments', label: 'Assignments & Exams', icon: 'file-signature' },
      { heading: 'Student services' },
      { id: 'gatepass', label: 'Gate Pass', icon: 'id-card-clip', badge: () => SC.store.all('gatePasses').filter(r => r.status === 'Pending').length },
      { id: 'hostelleave', label: 'Hostel Leave', icon: 'bed', badge: () => SC.store.all('hostelLeaves').filter(r => r.status === 'Pending').length },
      { heading: 'Communication' },
      { id: 'announcements', label: 'Announcements', icon: 'bullhorn' },
      { id: 'requests', label: 'Student Queries', icon: 'comments', badge: () => SC.store.all('queries').filter(q => q.fid === SC.auth.user().refId && q.status === 'Open').length },
      { heading: 'Account' },
      { id: 'profile', label: 'Profile & Settings', icon: 'user-gear' }
    ],
    pages: P
  });
})();
