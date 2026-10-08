/* ==========================================================================
   SmartCampus Portal · js/auth.js
  Session handling shared by Login.html and the three dashboards.
   Sessions are demo-only: a signed-in user's id is kept in localStorage.
   ========================================================================== */
(function (global) {
  'use strict';
  const SC = global.SC;
  const { storage, KEYS, util: U } = SC;

  const DEMO_ACCOUNTS = {
    student: { email: 'student@campus.edu', password: 'student123', label: 'Student', file: 'student.html', name: 'Dinakrushna Mohanta' },
    faculty: { email: 'faculty@campus.edu', password: 'faculty123', label: 'Faculty', file: 'faculty.html', name: 'Prof. Rajeswari Chhualsingh' },
    admin: { email: 'admin@campus.edu', password: 'admin123', label: 'Administration', file: 'admin.html', name: 'Dr. Ramesh Chandra' }
  };
  SC.DEMO_ACCOUNTS = DEMO_ACCOUNTS;

  const Auth = SC.auth = {
    user() {
      const s = storage.get(KEYS.SESSION);
      if (!s) return null;
      return SC.store.find('users', s.userId) || null;
    },
    login(email, password) {
      const u = SC.store.all('users').find(x => U.norm(x.email) === U.norm(email));
      if (!u) return { ok: false, error: 'No account found with that email address.' };
      if (u.password !== password) return { ok: false, error: 'Incorrect password. Please try again.' };
      storage.set(KEYS.SESSION, { userId: u.id, role: u.role, since: new Date().toISOString() });
      return { ok: true, user: u };
    },
    register(name, email, password, dept) {
      const normalizedEmail = U.norm(email).trim();
      if (SC.store.all('users').some(user => U.norm(user.email) === normalizedEmail)) {
        return { ok: false, error: 'An account with this email already exists. Sign in instead.' };
      }
      const id = SC.store.nextId('STU');
      const student = {
        id, name: name.trim(), dept, year: 1, sem: 1, batch: '2026-2030', section: 'A',
        cgpa: 0, guardian: '', address: '', email: normalizedEmail, phone: '', status: 'Active', bio: ''
      };
      SC.store.add('students', student);
      const user = { id: 'U-' + id, role: 'student', name: student.name, email: normalizedEmail, password, refId: id };
      SC.store.add('users', user);
      SC.store.all('subjects').filter(subject => subject.dept === dept).forEach(subject => {
        SC.store.add('attendance', { sid: id, code: subject.code, attended: 0, total: 0 });
      });
      return { ok: true, user };
    },
    logout() { storage.del(KEYS.SESSION); location.href = 'index.html'; },
    /** Signs into a different role's demo account, for the "view as" quick switch. */
    switchTo(role) {
      const acc = DEMO_ACCOUNTS[role];
      const u = SC.store.all('users').find(x => U.norm(x.email) === U.norm(acc.email));
      storage.set(KEYS.SESSION, { userId: u.id, role: u.role, since: new Date().toISOString() });
      location.href = acc.file;
    },
    /** Guards a dashboard page: redirects to login if not signed in, or to the correct dashboard if the role does not match. */
    require(role) {
      const u = Auth.user();
      if (!u) { location.href = 'Login.html'; return null; }
      if (role && u.role !== role) { location.href = DEMO_ACCOUNTS[u.role].file; return null; }
      return u;
    }
  };
})(window);
