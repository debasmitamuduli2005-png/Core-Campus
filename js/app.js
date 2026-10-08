/* ==========================================================================
   SmartCampus Portal · js/app.js
   --------------------------------------------------------------------------
   Core framework shared by every page. Sections:
     1. Utilities and safe HTML templating
     2. Storage, demo seed data and data store (localStorage)
     3. Domain helpers and notifications
     4. UI components (toast, modal, forms, tables, tabs, data views)
     5. CSS / SVG charts
     6. Application shell (sidebar, top bar, search, routing)
     7. Shared pages (timetable, announcements, events, library, profile)
   All data is DEMO data kept in the browser. There is no backend.
   ========================================================================== */
(function (global) {
  'use strict';

  const SC = global.SC = { state: { tabs: {}, tabDefault: {}, pendingQ: null }, actions: {}, pages: {} };

  /* ======================================================================
     1. UTILITIES AND SAFE HTML TEMPLATING
     ----------------------------------------------------------------------
     `html` is a tagged template that escapes every interpolated value, so
     user-entered text can never inject markup. Nested `html` results, and
     arrays of them, are inserted as-is.
     ====================================================================== */
  const U = SC.util = {};

  class SafeHtml { constructor(s) { this.s = s; } toString() { return this.s; } }
  U.raw = s => new SafeHtml(String(s));
  U.esc = s => String(s === null || s === undefined ? '' : s)
    .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function part(v) {
    if (v === null || v === undefined || v === false || v === true) return '';
    if (v instanceof SafeHtml) return v.s;
    if (Array.isArray(v)) return v.map(part).join('');
    return U.esc(v);
  }
  U.html = (strings, ...vals) =>
    new SafeHtml(strings.reduce((out, s, i) => out + s + (i < vals.length ? part(vals[i]) : ''), ''));
  const html = U.html;

  /* ---- Dates and times (all dates are local, stored as YYYY-MM-DD) ---- */
  U.DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  SC.SLOTS = [['09:00', '10:00'], ['10:00', '11:00'], ['11:15', '12:15'], ['12:15', '13:15'], ['14:00', '15:00']];

  U.pad = n => String(n).padStart(2, '0');
  U.iso = (d = new Date()) => `${d.getFullYear()}-${U.pad(d.getMonth() + 1)}-${U.pad(d.getDate())}`;
  U.addDays = (n, from = new Date()) => { const d = new Date(from); d.setDate(d.getDate() + n); return d; };
  U.dayOffset = n => U.iso(U.addDays(n));
  U.parse = iso => new Date(iso + 'T00:00:00');
  U.fmtDate = iso => iso ? U.parse(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';
  U.fmtDay = iso => U.parse(iso).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  U.dayName = iso => U.parse(iso).toLocaleDateString('en-US', { weekday: 'long' });
  U.fmtTime = t => { const [h, m] = t.split(':').map(Number); return `${((h + 11) % 12) + 1}:${U.pad(m)} ${h >= 12 ? 'PM' : 'AM'}`; };
  U.daysUntil = iso => Math.round((U.parse(iso) - U.parse(U.iso())) / 864e5);
  U.timeAgo = isoDateTime => {
    const m = Math.floor((Date.now() - new Date(isoDateTime).getTime()) / 60000);
    if (m < 1) return 'Just now';
    if (m < 60) return `${m} min ago`;
    if (m < 1440) return `${Math.floor(m / 60)} h ago`;
    const d = Math.floor(m / 1440);
    return d === 1 ? 'Yesterday' : `${d} days ago`;
  };
  /** The next date classes are held: today on weekdays, otherwise the coming Monday. */
  U.classDate = () => {
    const d = new Date(); const wd = d.getDay();
    if (wd === 6) d.setDate(d.getDate() + 2);
    if (wd === 0) d.setDate(d.getDate() + 1);
    return U.iso(d);
  };
  U.isToday = iso => iso === U.iso();

  /* ---- Misc helpers ---- */
  U.sum = a => a.reduce((x, y) => x + y, 0);
  U.avg = a => a.length ? U.sum(a) / a.length : 0;
  U.pctOf = (a, b) => b ? Math.round(a / b * 100) : 0;
  U.unique = a => Array.from(new Set(a));
  U.plural = (n, w, pl) => `${n} ${n === 1 ? w : (pl || w + 's')}`;
  U.initials = name => String(name || '?').replace(/^(Dr|Prof|Mr|Mrs|Ms)\.?\s+/i, '').split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  U.hash = s => Array.from(String(s)).reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  U.norm = s => String(s || '').toLowerCase();
  U.matches = (q, ...fields) => !q || fields.some(f => U.norm(f).includes(U.norm(q).trim()));
  U.toCSV = (headers, rows) => '\ufeff' + [headers].concat(rows)
    .map(r => r.map(c => `"${String(c === null || c === undefined ? '' : c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  U.download = (name, text, type = 'text/csv;charset=utf-8') => {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  };

  /* ======================================================================
     2. STORAGE, SEED DATA AND DATA STORE
     ====================================================================== */
  const KEY = 'scp.db.v1', SESSION_KEY = 'scp.session.v1', PREFS_KEY = 'scp.prefs.v1';
  const SEED_VERSION = 1;
  const mem = {}; // in-memory fallback if localStorage is blocked

  SC.storage = {
    get(key) {
      try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; }
      catch (e) { return mem[key] ? JSON.parse(mem[key]) : null; }
    },
    set(key, val) {
      const s = JSON.stringify(val);
      try { localStorage.setItem(key, s); } catch (e) { mem[key] = s; }
    },
    del(key) { try { localStorage.removeItem(key); } catch (e) { /* ignore */ } delete mem[key]; }
  };
  SC.KEYS = { DB: KEY, SESSION: SESSION_KEY, PREFS: PREFS_KEY };

  const DEPTS = {
    CSE: 'Computer Science & Engineering',
    ECE: 'Electronics & Communication',
    ME: 'Mechanical Engineering',
    CE: 'Civil Engineering'
  };

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  /** Builds the complete demo data set. Dates are relative to "today" so the demo always looks fresh. */
  function buildSeed() {
    const rnd = mulberry32(20260919);
    const counters = {};
    const gen = (p, start) => { counters[p] = start - 1; return () => `${p}-${++counters[p]}`; };
    const nAS = gen('AS', 101), nEV = gen('EV', 301), nBK = gen('BK', 401), nAN = gen('AN', 501),
      nEX = gen('EX', 601), nSB = gen('SB', 701), nIS = gen('IS', 801), nNT = gen('NT', 901),
      nCM = gen('CMP', 1001), nQ = gen('QRY', 2001), nAC = gen('ACT', 1);
    const ago = h => new Date(Date.now() - h * 36e5).toISOString();
    const D = n => U.dayOffset(n);

    /* ---- Subjects ---- */
    const sub = (code, name, dept, credits, faculty, room, type) => ({ code, name, dept, credits, faculty, room, type: type || 'Theory' });
    const subjects = [
      sub('CS301', 'Data Structures & Algorithms', 'CSE', 4, 'F102', 'LH-101'),
      sub('CS302', 'Database Management Systems', 'CSE', 4, 'F101', 'LH-102'),
      sub('CS303', 'Operating Systems', 'CSE', 4, 'F103', 'LH-101'),
      sub('CS304', 'Computer Networks', 'CSE', 3, 'F102', 'LH-103'),
      sub('CS305', 'Software Engineering', 'CSE', 3, 'F103', 'LH-102'),
      sub('CS306', 'Web Technologies Lab', 'CSE', 2, 'F101', 'Lab-2', 'Lab'),
      sub('EC301', 'Digital Signal Processing', 'ECE', 4, 'F104', 'LH-201'),
      sub('EC302', 'Analog Communication', 'ECE', 3, 'F105', 'LH-202'),
      sub('EC303', 'Microprocessors & Microcontrollers', 'ECE', 4, 'F104', 'LH-201'),
      sub('EC304', 'Electromagnetic Theory', 'ECE', 3, 'F105', 'LH-203'),
      sub('EC305', 'VLSI Design Lab', 'ECE', 2, 'F104', 'Lab-4', 'Lab'),
      sub('ME301', 'Engineering Thermodynamics', 'ME', 4, 'F106', 'LH-301'),
      sub('ME302', 'Fluid Mechanics', 'ME', 4, 'F107', 'LH-302'),
      sub('ME303', 'Machine Design', 'ME', 4, 'F106', 'LH-301'),
      sub('ME304', 'Manufacturing Processes', 'ME', 3, 'F107', 'LH-303'),
      sub('ME305', 'Heat Transfer', 'ME', 3, 'F106', 'LH-302'),
      sub('CE301', 'Structural Analysis', 'CE', 4, 'F108', 'LH-401'),
      sub('CE302', 'Geotechnical Engineering', 'CE', 4, 'F109', 'LH-402'),
      sub('CE303', 'Environmental Engineering', 'CE', 3, 'F108', 'LH-401'),
      sub('CE304', 'Transportation Engineering', 'CE', 3, 'F109', 'LH-403'),
      sub('CE305', 'Surveying & Geomatics', 'CE', 3, 'F108', 'LH-402')
    ];

    /* ---- Faculty ---- */
    const fac = (id, name, dept, designation, email, phone, qualification, experience, office) =>
      ({ id, name, dept, designation, email, phone, qualification, experience, office, status: 'Active', bio: '' });
    const faculty = [
      fac('F101', 'Prof. Rajeswari Chhualsingh', 'CSE', 'Associate Professor', 'faculty@campus.edu', '9810011101', 'Ph.D. (Computer Science)', 12, 'CS Block, Room 204'),
      fac('F102', 'Prof. Rajesh Kulkarni', 'CSE', 'Assistant Professor', 'rajesh.kulkarni@campus.edu', '9810011102', 'M.Tech (Computer Networks)', 8, 'CS Block, Room 207'),
      fac('F103', 'Dr. Sunita Rao', 'CSE', 'Professor', 'sunita.rao@campus.edu', '9810011103', 'Ph.D. (Software Engineering)', 18, 'CS Block, Room 301'),
      fac('F104', 'Prof. Amit Banerjee', 'ECE', 'Assistant Professor', 'amit.banerjee@campus.edu', '9810011104', 'M.Tech (VLSI)', 7, 'EC Block, Room 110'),
      fac('F105', 'Dr. Kavita Deshmukh', 'ECE', 'Associate Professor', 'kavita.deshmukh@campus.edu', '9810011105', 'Ph.D. (Communication Systems)', 14, 'EC Block, Room 114'),
      fac('F106', 'Prof. Suresh Nair', 'ME', 'Assistant Professor', 'suresh.nair@campus.edu', '9810011106', 'M.Tech (Thermal Engineering)', 9, 'ME Block, Room 102'),
      fac('F107', 'Dr. Anil Kapoor', 'ME', 'Professor', 'anil.kapoor@campus.edu', '9810011107', 'Ph.D. (Fluid Dynamics)', 20, 'ME Block, Room 105'),
      fac('F108', 'Prof. Lakshmi Menon', 'CE', 'Associate Professor', 'lakshmi.menon@campus.edu', '9810011108', 'M.Tech (Structural Engineering)', 11, 'CE Block, Room 203'),
      fac('F109', 'Dr. Prakash Joshi', 'CE', 'Assistant Professor', 'prakash.joshi@campus.edu', '9810011109', 'Ph.D. (Geotechnical Engineering)', 6, 'CE Block, Room 209')
    ];

    /* ---- Students (all in Year 3, Semester 5, batch 2024-2028) ---- */
    const stuRaw = [
      ['Dinakrushna Mohanta', 'CSE', 8.42, 'Mr. Rakesh Sharma', 'B-42, Green Park Extension, New Delhi'],
      ['Ananya Iyer', 'CSE', 9.05, 'Mr. Venkat Iyer', '12, Adyar Main Road, Chennai'],
      ['Rohan Das', 'CSE', 7.68, 'Mrs. Mitali Das', '45, Salt Lake Sector II, Kolkata'],
      ['Priya Nair', 'CSE', 8.76, 'Mr. Gopan Nair', 'Panampilly Nagar, Kochi'],
      ['Kabir Singh', 'CSE', 7.12, 'Mr. Harjit Singh', 'Model Town, Ludhiana'],
      ['Sneha Patel', 'CSE', 8.21, 'Mr. Jayesh Patel', 'Satellite Road, Ahmedabad'],
      ['Aditya Verma', 'CSE', 6.94, 'Mrs. Rekha Verma', 'Gomti Nagar, Lucknow'],
      ['Ishita Banerjee', 'CSE', 8.88, 'Mr. Subir Banerjee', 'Behala, Kolkata'],
      ['Vikram Reddy', 'ECE', 7.85, 'Mr. Narasimha Reddy', 'Banjara Hills, Hyderabad'],
      ['Neha Kulkarni', 'ECE', 8.35, 'Mr. Sanjay Kulkarni', 'Kothrud, Pune'],
      ['Arjun Mishra', 'ECE', 7.4, 'Mr. Dinesh Mishra', 'Arera Colony, Bhopal'],
      ['Diya Chatterjee', 'ECE', 8.62, 'Mrs. Rupa Chatterjee', 'Dum Dum, Kolkata'],
      ['Rahul Mohanty', 'ME', 7.22, 'Mr. Bibhuti Mohanty', 'Sahid Nagar, Cuttack'],
      ['Sanya Gupta', 'ME', 8.05, 'Mr. Anil Gupta', 'Malviya Nagar, Jaipur'],
      ['Harsh Choudhury', 'ME', 6.78, 'Mr. Prem Choudhury', 'Boring Road, Patna'],
      ['Pooja Menon', 'CE', 8.47, 'Mr. Ravi Menon', 'Kowdiar, Thiruvananthapuram'],
      ['Faizan Ahmed', 'CE', 7.59, 'Mr. Imran Ahmed', 'Indiranagar, Bengaluru'],
      ['Tanvi Deshpande', 'CE', 8.19, 'Mrs. Smita Deshpande', 'Dharampeth, Nagpur']
    ];
    const deptCount = {};
    const students = stuRaw.map(([name, dept, cgpa, guardian, address], i) => {
      deptCount[dept] = (deptCount[dept] || 0) + 1;
      const id = `24${dept}${String(deptCount[dept]).padStart(3, '0')}`;
      return {
        id, name, dept, year: 3, sem: 5, batch: '2024-2028', section: 'A', cgpa, guardian, address,
        email: i === 0 ? 'student@campus.edu' : name.toLowerCase().replace(/\s+/g, '.') + '@campus.edu',
        phone: '98765' + String(40100 + i * 37).slice(0, 5), status: name === 'Harsh Choudhury' ? 'Inactive' : 'Active', bio: ''
      };
    });

    /* ---- Users (login accounts) ---- */
    const users = [
      { id: 'U-ADM', role: 'admin', name: 'Dr. Ramesh Chandra', email: 'admin@campus.edu', password: 'admin123', designation: 'Registrar', phone: '9810012345', office: 'Administrative Block, Room 101', bio: 'Oversees academic operations, examinations and student services.' }
    ];
    faculty.forEach(f => users.push({ id: 'U-' + f.id, role: 'faculty', name: f.name, email: f.email, password: 'faculty123', refId: f.id }));
    students.forEach(s => users.push({ id: 'U-' + s.id, role: 'student', name: s.name, email: s.email, password: 'student123', refId: s.id }));

    /* ---- Timetable (weekly pattern per department) ---- */
    const timetable = [];
    Object.keys(DEPTS).forEach(dept => {
      const subs = subjects.filter(s => s.dept === dept);
      const step = subs.length === 6 ? 5 : 2;
      U.DAYS.forEach((day, d) => SC.SLOTS.forEach((_, s) => {
        timetable.push({ id: `TT-${dept}-${d}${s}`, dept, day, slot: s, code: subs[(d * step + s) % subs.length].code, cancelledOn: null });
      }));
    });

    /* ---- Attendance (attended / total per student per subject) ---- */
    const attendance = [];
    students.forEach(st => {
      const base = 0.7 + rnd() * 0.25;
      subjects.filter(s => s.dept === st.dept).forEach(sb => {
        const total = 34 + Math.floor(rnd() * 8);
        const p = Math.min(0.99, Math.max(0.5, base + (rnd() - 0.5) * 0.14));
        attendance.push({ sid: st.id, code: sb.code, attended: Math.round(total * p), total });
      });
    });
    // Hand-tuned numbers for the demo student so alerts and charts look interesting.
    [['CS301', 34, 38], ['CS302', 36, 40], ['CS303', 30, 39], ['CS304', 26, 39], ['CS305', 35, 38], ['CS306', 18, 20]]
      .forEach(([code, a, t]) => { const r = attendance.find(x => x.sid === '24CSE001' && x.code === code); r.attended = a; r.total = t; });

    /* ---- Assignments and submissions ---- */
    const asg = (title, code, due, maxMarks, description, createdBy) =>
      ({ id: nAS(), title, code, due: D(due), maxMarks, description, createdBy, createdOn: D(-14) });
    const assignments = [
      asg('Binary Trees and BST Implementation', 'CS301', -3, 20, 'Implement insertion, deletion and in-order traversal for a binary search tree in C++ or Java. Submit source code with a short complexity note.', 'F102'),
      asg('ER Diagram and Normalization', 'CS302', 2, 15, 'Design an ER diagram for a college library system and normalize the schema up to BCNF. Submit a PDF with the diagram and steps.', 'F101'),
      asg('CPU Scheduling Simulator', 'CS303', 5, 20, 'Build a simulator for FCFS, SJF and Round Robin scheduling and compare average waiting times for a sample workload.', 'F103'),
      asg('Socket Programming Lab Report', 'CS304', 9, 10, 'Write a TCP client-server chat program and document the experiment with screenshots and observations.', 'F102'),
      asg('SRS Document for a Campus App', 'CS305', 12, 25, 'Prepare a Software Requirements Specification following IEEE 830 for a campus mobile application.', 'F103'),
      asg('Responsive Portfolio Website', 'CS306', -7, 10, 'Create a responsive personal portfolio using HTML, CSS and JavaScript. Host it locally and submit a zip file.', 'F101'),
      asg('FFT Analysis using MATLAB', 'EC301', 4, 15, 'Compute and plot the FFT of a noisy signal and discuss the effect of windowing.', 'F104'),
      asg('8051 Interfacing Lab Record', 'EC303', 8, 10, 'Complete the lab record for LED, LCD and keypad interfacing experiments with the 8051 microcontroller.', 'F104'),
      asg('Thermodynamic Cycle Analysis', 'ME301', 6, 20, 'Analyse an Otto cycle and a Diesel cycle for given inputs and compare their efficiencies.', 'F106'),
      asg('Design of a Flange Coupling', 'ME303', 10, 20, 'Design a rigid flange coupling for a 15 kW, 720 rpm shaft and submit calculations with a sketch.', 'F106'),
      asg('Beam Deflection Problems', 'CE301', 3, 15, 'Solve the ten given problems on deflection of beams using the double integration method.', 'F108'),
      asg('Soil Classification Report', 'CE302', 11, 15, 'Classify the provided soil samples as per IS classification and write a laboratory report.', 'F109')
    ];
    const submissions = [];
    const sb = (aidx, sid, daysAgo, marks, feedback) => submissions.push({
      id: nSB(), aid: assignments[aidx].id, sid, date: D(-daysAgo), file: `${sid}_${assignments[aidx].code}.pdf`,
      status: marks === null ? 'Submitted' : 'Graded', marks, feedback: feedback || '', late: false
    });
    sb(5, '24CSE001', 8, 9, 'Clean layout and good use of media queries. Add keyboard focus styles next time.');
    sb(5, '24CSE002', 8, 10, 'Excellent work.'); sb(5, '24CSE003', 7, null); sb(5, '24CSE004', 9, 9, 'Well structured.');
    sb(5, '24CSE005', 7, null); sb(5, '24CSE006', 8, 8, 'Good, but improve accessibility.');
    sb(1, '24CSE002', 1, null); sb(1, '24CSE003', 1, null); sb(1, '24CSE004', 0, null); sb(1, '24CSE006', 1, null);
    sb(0, '24CSE002', 4, 18, 'Great balancing logic.'); sb(0, '24CSE003', 4, 15, 'Deletion of nodes with two children has a bug.');
    sb(0, '24CSE004', 5, 17, ''); sb(0, '24CSE006', 4, 16, ''); sb(0, '24CSE008', 3, null);
    sb(2, '24CSE002', 0, null); sb(6, '24ECE001', 1, null); sb(10, '24CE001', 1, null);

    /* ---- Exams: one mid-semester paper per subject, on weekdays ---- */
    const exams = [];
    Object.keys(DEPTS).forEach(dept => {
      const cursor = U.addDays(12);
      subjects.filter(s => s.dept === dept).forEach(s => {
        while (cursor.getDay() === 0 || cursor.getDay() === 6) cursor.setDate(cursor.getDate() + 1);
        exams.push({
          id: nEX(), dept, code: s.code, type: s.type === 'Lab' ? 'Practical / Viva' : 'Mid-Semester',
          date: U.iso(cursor), start: s.type === 'Lab' ? '14:00' : '10:00', end: s.type === 'Lab' ? '16:00' : '13:00',
          room: s.type === 'Lab' ? s.room : (dept === 'CSE' ? 'Exam Hall A' : 'Exam Hall B')
        });
        cursor.setDate(cursor.getDate() + 1);
      });
    });

    /* ---- Announcements ---- */
    const ann = (title, category, audience, authorId, author, daysAgo, body, pinned) =>
      ({ id: nAN(), title, category, audience, authorId, author, date: D(-daysAgo), body, pinned: !!pinned });
    const announcements = [
      ann('Mid-semester examination schedule released', 'Exam', 'All', 'U-ADM', 'Dr. Ramesh Chandra', 1, 'The mid-semester timetable for all departments is now available under Assignments and Exams. Hall tickets can be downloaded from the student portal. Please report 15 minutes before the exam begins.', true),
      ann('Guest lecture: Machine learning in healthcare', 'Academic', 'Students', 'U-F101', 'Prof. Rajeswari Chhualsingh', 2, 'An industry expert will speak on practical machine learning use cases in hospitals. Open to all CSE and ECE students. Seats are limited to the seminar hall capacity.'),
      ann('Hostel room allotment for the odd semester', 'General', 'Students', 'U-ADM', 'Dr. Ramesh Chandra', 3, 'Room allotment lists are on the hostel notice board and in the warden office. Students with concerns should raise a service request in the help desk before Friday.'),
      ann('Campus placement drive: TechNova Solutions', 'Placement', 'Students', 'U-ADM', 'Dr. Ramesh Chandra', 4, 'Pre-final and final year students with CGPA above 7.0 can apply. Bring an updated resume to the training and placement cell.'),
      ann('Faculty meeting: curriculum review', 'Academic', 'Faculty', 'U-ADM', 'Dr. Ramesh Chandra', 2, 'A review of the Semester 5 curriculum will be held in the conference room. Please bring feedback from your classes.'),
      ann('Library timings extended during exams', 'General', 'All', 'U-ADM', 'Dr. Ramesh Chandra', 5, 'The central library will stay open until 9:00 PM on weekdays from next week until the end of the examinations.'),
      ann('Holiday notice: Gandhi Jayanti', 'Holiday', 'All', 'U-ADM', 'Dr. Ramesh Chandra', 6, 'The campus will remain closed on 2 October for Gandhi Jayanti. Classes resume on the next working day.'),
      ann('Wi-Fi maintenance on Sunday night', 'General', 'All', 'U-ADM', 'Dr. Ramesh Chandra', 7, 'Network services will be unavailable between 11:00 PM and 2:00 AM while the IT team upgrades the access points.')
    ];

    /* ---- Events ---- */
    const evt = (title, category, days, time, venue, organizer, capacity, description, registered) =>
      ({ id: nEV(), title, category, date: D(days), time, venue, organizer, capacity, description, registered });
    const events = [
      evt('CodeSprint Hackathon 2026', 'Technical', 10, '09:00', 'Innovation Lab', 'Coding Club', 120, 'A 24-hour team hackathon. Build a working prototype that solves a real campus problem. Teams of up to four.', ['24CSE002', '24CSE003', '24CSE004', '24CSE008', '24ECE001', '24ECE002']),
      evt('Cloud Computing Workshop', 'Workshop', 4, '14:00', 'Seminar Hall 1', 'CSE Department', 60, 'A hands-on session on deploying a small web application to the cloud. Bring your laptop.', ['24CSE001', '24CSE002', '24CSE005', '24CSE006']),
      evt('Inter-department Cricket Tournament', 'Sports', 7, '08:30', 'Main Ground', 'Sports Committee', 96, 'Knockout tournament between the four departments. Team lists close two days before the first match.', ['24ME001', '24ME002', '24CE001']),
      evt('Rang Utsav: Cultural Night', 'Cultural', 18, '18:00', 'Open Air Theatre', 'Cultural Society', 300, 'An evening of music, dance and theatre performed by students from every department.', ['24CSE004', '24ECE003', '24CE002', '24CE003']),
      evt('Placement Preparation Bootcamp', 'Placement', 14, '10:00', 'Auditorium', 'Training & Placement Cell', 150, 'Aptitude, resume review and mock interviews with alumni volunteers.', ['24CSE001', '24CSE003', '24CSE007', '24ECE004']),
      evt('Blood Donation Camp', 'Social', 21, '09:30', 'Health Centre', 'NSS Unit', 80, 'Organised with a local blood bank. Donors receive a certificate and a light snack.', ['24CSE006']),
      evt("Freshers' Welcome 2026", 'Cultural', -5, '17:00', 'Auditorium', 'Student Council', 250, 'A welcome event for the new batch with performances and a campus tour.', ['24CSE002', '24CSE005', '24ECE001'])
    ];

    /* ---- Library ---- */
    const bk = (title, author, category, copies, shelf, year) => ({ id: nBK(), title, author, category, copies, shelf, year });
    const books = [
      bk('Introduction to Algorithms', 'Thomas H. Cormen et al.', 'Computer Science', 4, 'CS-A12', 2022),
      bk('Database System Concepts', 'Abraham Silberschatz et al.', 'Computer Science', 3, 'CS-A14', 2019),
      bk('Operating System Concepts', 'Silberschatz, Galvin, Gagne', 'Computer Science', 3, 'CS-B03', 2018),
      bk('Computer Networks', 'Andrew S. Tanenbaum', 'Computer Science', 2, 'CS-B07', 2021),
      bk('Let Us C', 'Yashavant Kanetkar', 'Computer Science', 6, 'CS-C01', 2020),
      bk('Digital Signal Processing', 'John G. Proakis', 'Electronics', 2, 'EC-A05', 2020),
      bk('Microprocessor Architecture and Applications', 'Ramesh Gaonkar', 'Electronics', 3, 'EC-B02', 2017),
      bk('Engineering Thermodynamics', 'P. K. Nag', 'Mechanical', 3, 'ME-A01', 2019),
      bk('A Textbook of Fluid Mechanics', 'R. K. Bansal', 'Mechanical', 2, 'ME-A09', 2018),
      bk('Strength of Materials', 'R. K. Rajput', 'Civil', 2, 'CE-A04', 2016),
      bk('Soil Mechanics and Foundations', 'B. C. Punmia', 'Civil', 1, 'CE-B02', 2015),
      bk('Higher Engineering Mathematics', 'B. S. Grewal', 'Mathematics', 5, 'MA-A01', 2021),
      bk('Wings of Fire', 'A. P. J. Abdul Kalam', 'General', 4, 'GN-A10', 2014),
      bk('The Discovery of India', 'Jawaharlal Nehru', 'General', 1, 'GN-B04', 2004)
    ];
    const iss = (bidx, sid, daysAgo, dueIn, returned) => ({
      id: nIS(), bookId: books[bidx].id, sid, issueDate: D(-daysAgo), dueDate: D(dueIn), returnDate: returned ? D(-returned) : null
    });
    const issues = [
      iss(1, '24CSE001', 9, 5), iss(0, '24CSE001', 16, -2), iss(4, '24CSE001', 40, -26, 27),
      iss(0, '24CSE002', 6, 8), iss(0, '24CSE003', 12, 2), iss(0, '24CSE005', 3, 11),
      iss(2, '24CSE004', 5, 9), iss(3, '24CSE006', 10, 4), iss(3, '24CSE007', 20, -6),
      iss(10, '24CE001', 8, 6), iss(13, '24CSE008', 4, 10), iss(6, '24ECE001', 7, 7)
    ];

    /* ---- Complaints and service requests ---- */
    const cmp = (sid, kind, category, priority, status, subject, description, daysAgo, assignee, remarks) =>
      ({ id: nCM(), sid, kind, category, priority, status, subject, description, date: D(-daysAgo), updatedOn: D(-Math.max(0, daysAgo - 1)), assignee, remarks: remarks || [] });
    const complaints = [
      cmp('24CSE001', 'Complaint', 'IT and Wi-Fi', 'High', 'In Progress', 'Wi-Fi not working in Hostel Block B', 'The network drops every evening after 8 PM on the second floor. This affects online classes and submissions.', 3, 'IT Services',
        [{ by: 'System', text: 'Ticket created.', date: D(-3) }, { by: 'Dr. Ramesh Chandra', text: 'Forwarded to the IT team. A technician will inspect the access point tomorrow.', date: D(-2) }]),
      cmp('24CSE001', 'Service Request', 'Documents', 'Medium', 'Resolved', 'Bonafide certificate for bank loan', 'I need a bonafide certificate with the current semester and fee details for an education loan application.', 12, 'Academic Section',
        [{ by: 'System', text: 'Ticket created.', date: D(-12) }, { by: 'Dr. Ramesh Chandra', text: 'Certificate issued. Collect it from the academic section office.', date: D(-9) }]),
      cmp('24CSE003', 'Complaint', 'Mess and Canteen', 'Medium', 'Open', 'Quality of lunch in the mess', 'The dal and vegetables were undercooked twice this week. Please review hygiene checks.', 1, 'Unassigned', [{ by: 'System', text: 'Ticket created.', date: D(-1) }]),
      cmp('24ECE002', 'Complaint', 'Infrastructure', 'High', 'Open', 'Projector not working in LH-201', 'The projector in LH-201 flickers and turns off after ten minutes. Classes are being disrupted.', 2, 'Unassigned', [{ by: 'System', text: 'Ticket created.', date: D(-2) }]),
      cmp('24ME001', 'Service Request', 'Transport', 'Low', 'In Progress', 'Bus pass renewal', 'Please renew my campus bus pass for the current semester for the Route 4 service.', 5, 'Transport Office',
        [{ by: 'System', text: 'Ticket created.', date: D(-5) }, { by: 'Dr. Ramesh Chandra', text: 'Payment verified. Pass is being printed.', date: D(-3) }]),
      cmp('24CE002', 'Service Request', 'Documents', 'Medium', 'Open', 'Duplicate ID card', 'I lost my ID card last week and need a duplicate issued.', 2, 'Unassigned', [{ by: 'System', text: 'Ticket created.', date: D(-2) }]),
      cmp('24CSE005', 'Complaint', 'Hostel', 'High', 'Resolved', 'Water leakage in Room 214', 'There is a leakage from the ceiling near the window that damages books and bedding.', 10, 'Maintenance Cell',
        [{ by: 'System', text: 'Ticket created.', date: D(-10) }, { by: 'Dr. Ramesh Chandra', text: 'Plumbing repaired and ceiling repainted.', date: D(-6) }]),
      cmp('24ECE004', 'Service Request', 'Accounts and Fees', 'Medium', 'Rejected', 'Fee receipt correction', 'The receipt shows the wrong semester. Please correct it.', 8, 'Accounts Office',
        [{ by: 'System', text: 'Ticket created.', date: D(-8) }, { by: 'Dr. Ramesh Chandra', text: 'Receipt is correct as per the ledger. Visit the accounts office with the original for review.', date: D(-6) }])
    ];

    /* ---- Student queries to faculty ---- */
    const queries = [
      { id: nQ(), sid: '24CSE001', fid: 'F101', code: 'CS302', subject: 'Difference between 3NF and BCNF', message: 'Could you share an example where a relation is in 3NF but not in BCNF?', date: D(-4), status: 'Answered', reply: 'Consider R(A, B, C) with A,B -> C and C -> B. It is in 3NF but not in BCNF because C is not a superkey. I will cover this in Thursday\'s class too.', repliedOn: D(-3) },
      { id: nQ(), sid: '24CSE002', fid: 'F101', code: 'CS302', subject: 'Deadline extension for ER diagram', message: 'Our team has an inter-college event on Monday. May we get one extra day for the ER diagram assignment?', date: D(-1), status: 'Open', reply: '', repliedOn: null },
      { id: nQ(), sid: '24CSE003', fid: 'F101', code: 'CS306', subject: 'Portfolio website hosting', message: 'Should the portfolio be hosted online, or is a local zip file enough for the submission?', date: D(0), status: 'Open', reply: '', repliedOn: null },
      { id: nQ(), sid: '24CSE004', fid: 'F102', code: 'CS304', subject: 'Reference for socket programming', message: 'Can you recommend a good reference for TCP socket programming in Java?', date: D(-2), status: 'Open', reply: '', repliedOn: null }
    ];

    /* ---- Notifications, activity ---- */
    const ntf = (to, uid, text, type, link, h) => ({ id: nNT(), to, uid, text, type, link, time: ago(h), readBy: [] });
    const notifications = [
      ntf('student', null, 'Mid-semester exam schedule has been published.', 'info', 'assignments', 20),
      ntf('student', 'U-24CSE001', 'ER Diagram and Normalization is due in 2 days.', 'warning', 'assignments', 5),
      ntf('student', 'U-24CSE001', 'Your attendance in Computer Networks is below 75%.', 'danger', 'attendance', 8),
      ntf('student', 'U-24CSE001', 'Ticket CMP-1001 is now In Progress.', 'success', 'helpdesk', 30),
      ntf('faculty', null, 'Curriculum review meeting has been added to announcements.', 'info', 'announcements', 22),
      ntf('faculty', 'U-F101', 'Three new submissions are waiting for grading.', 'warning', 'assignments', 3),
      ntf('faculty', 'U-F101', 'Rohan Das asked a question about CS306.', 'info', 'requests', 2),
      ntf('admin', null, '2 new complaints were raised in the last 24 hours.', 'warning', 'complaints', 4),
      ntf('admin', null, 'CodeSprint Hackathon has 6 registrations so far.', 'success', 'events', 12)
    ];
    const activity = [
      { id: nAC(), text: 'Ananya Iyer submitted "ER Diagram and Normalization"', icon: 'file-arrow-up', time: ago(1) },
      { id: nAC(), text: 'Ticket CMP-1004 raised: Projector not working in LH-201', icon: 'triangle-exclamation', time: ago(4) },
      { id: nAC(), text: 'Dr. Sunita Rao posted attendance for Operating Systems', icon: 'clipboard-check', time: ago(6) },
      { id: nAC(), text: 'Priya Nair registered for Rang Utsav', icon: 'calendar-check', time: ago(9) },
      { id: nAC(), text: 'Mid-semester exam schedule published', icon: 'bullhorn', time: ago(20) }
    ];

    return {
      version: SEED_VERSION, counters, users, students, faculty, subjects, timetable, attendance,
      assignments, submissions, exams, announcements, events, books, issues, complaints, queries, notifications, activity
    };
  }

  /* ---- The store: thin wrapper over the in-memory copy of the demo database ---- */
  let db = null;
  /** Adds collections introduced after v1 (gate pass, hostel leave, canteen) without wiping existing demo data. */
  function ensureExtras() {
    ['gatePasses', 'hostelLeaves', 'canteenMenu', 'canteenOrders', 'hostelPasses'].forEach(k => { if (!Array.isArray(db[k])) db[k] = []; });
  }
  function load() {
    db = SC.storage.get(KEY);
    if (!db || db.version !== SEED_VERSION) { db = buildSeed(); SC.storage.set(KEY, db); }
    ensureExtras();
  }
  load();

  const S = SC.store = {
    all: name => db[name],
    find: (name, id) => db[name].find(x => x.id === id),
    add(name, item) { db[name].push(item); S.save(); return item; },
    update(name, id, patch) { const it = S.find(name, id); if (it) { Object.assign(it, patch); S.save(); } return it; },
    remove(name, id) { db[name] = db[name].filter(x => x.id !== id); S.save(); },
    save() { SC.storage.set(KEY, db); },
    nextId(prefix) { db.counters[prefix] = (db.counters[prefix] || 0) + 1; S.save(); return `${prefix}-${db.counters[prefix]}`; },
    log(text, icon = 'circle-info') {
      db.activity.unshift({ id: S.nextId('ACT'), text, icon, time: new Date().toISOString() });
      db.activity = db.activity.slice(0, 40); S.save();
    },
    /** Restores the original demo data (used by the "Reset demo data" option). */
    reset() { SC.storage.del(KEY); db = buildSeed(); ensureExtras(); S.save(); }
  };

  /* ======================================================================
     3. DOMAIN HELPERS AND NOTIFICATIONS
     ====================================================================== */
  const Dt = SC.data = {
    DEPTS,
    dept: k => DEPTS[k] || k,
    student: id => db.students.find(s => s.id === id),
    faculty: id => db.faculty.find(f => f.id === id),
    subject: code => db.subjects.find(s => s.code === code),
    subjectsOf: dept => db.subjects.filter(s => s.dept === dept),
    subjectsTaughtBy: fid => db.subjects.filter(s => s.faculty === fid),
    studentsOfDept: dept => db.students.filter(s => s.dept === dept),
    facultyName: id => { const f = Dt.faculty(id); return f ? f.name : 'Unassigned'; },
    userOf: sid => db.users.find(u => u.role === 'student' && u.refId === sid),
    facultyUser: fid => db.users.find(u => u.role === 'faculty' && u.refId === fid),

    /** Returns { kind, rec } for the profile record behind a login account. */
    record(user) {
      if (user.role === 'student') return { kind: 'students', rec: Dt.student(user.refId) };
      if (user.role === 'faculty') return { kind: 'faculty', rec: Dt.faculty(user.refId) };
      return { kind: 'users', rec: user };
    },

    /* Attendance */
    attRows: sid => db.attendance.filter(a => a.sid === sid),
    overall(sid) {
      const rows = Dt.attRows(sid);
      return U.pctOf(U.sum(rows.map(r => r.attended)), U.sum(rows.map(r => r.total)));
    },
    perSubject(sid) {
      return Dt.attRows(sid).map(r => {
        const s = Dt.subject(r.code) || { name: r.code, faculty: null, type: 'Theory' };
        return { code: r.code, name: s.name, faculty: Dt.facultyName(s.faculty), type: s.type, attended: r.attended, total: r.total, pct: U.pctOf(r.attended, r.total) };
      });
    },
    /** Consecutive classes a student must attend to reach 75%. */
    need75: (att, tot) => Math.max(0, Math.ceil((0.75 * tot - att) / 0.25)),
    /** Classes a student can still miss and stay at or above 75%. */
    canMiss: (att, tot) => Math.max(0, Math.floor(att / 0.75 - tot)),
    attTone: pct => pct >= 75 ? 'success' : pct >= 60 ? 'warning' : 'danger',
    deptAttendance(dept) {
      const ids = Dt.studentsOfDept(dept).map(s => s.id);
      const rows = db.attendance.filter(a => ids.includes(a.sid));
      return U.pctOf(U.sum(rows.map(r => r.attended)), U.sum(rows.map(r => r.total)));
    },
    avgAttendance() {
      return Math.round(U.avg(db.students.map(s => Dt.overall(s.id))));
    },

    /* Assignments */
    assignmentDept: a => (Dt.subject(a.code) || {}).dept,
    assignmentsFor: dept => db.assignments.filter(a => Dt.assignmentDept(a) === dept),
    submission: (aid, sid) => db.submissions.find(s => s.aid === aid && s.sid === sid),
    /** Status of an assignment from one student's point of view. */
    asgStatus(a, sid) {
      const sub = Dt.submission(a.id, sid);
      if (sub) return sub.status;
      return U.daysUntil(a.due) < 0 ? 'Overdue' : 'Pending';
    },
    examsFor: dept => db.exams.filter(e => e.dept === dept).sort((a, b) => a.date.localeCompare(b.date)),

    /* Library */
    /* Loan status: Issue Requested -> Issued -> Return Requested -> Returned (or Rejected). Older records without a status are derived. */
    issueStatus: i => i.status || (i.returnDate ? 'Returned' : 'Issued'),
    holdsCopy: i => ['Issue Requested', 'Issued', 'Return Requested'].includes(Dt.issueStatus(i)),
    pendingIssues: () => db.issues.filter(i => ['Issue Requested', 'Return Requested'].includes(Dt.issueStatus(i))),
    activeIssues: bookId => db.issues.filter(i => i.bookId === bookId && Dt.holdsCopy(i)),
    available: b => Math.max(0, b.copies - Dt.activeIssues(b.id).length),
    myIssues: (sid, activeOnly) => db.issues.filter(i => i.sid === sid && (!activeOnly || Dt.holdsCopy(i))),
    /** Fine of Rs 2 per day for overdue books. */
    fine: issue => {
      if (!issue.dueDate) return 0;
      const end = issue.returnDate || U.iso();
      return Math.max(0, Math.round((U.parse(end) - U.parse(issue.dueDate)) / 864e5)) * 2;
    },

    /* Announcements visible to a role */
    visibleAnnouncements: role => db.announcements
      .filter(a => role === 'admin' || a.audience === 'All' || (a.audience === 'Students' && role === 'student') || (a.audience === 'Faculty' && role === 'faculty'))
      .slice().sort((a, b) => (b.pinned - a.pinned) || b.date.localeCompare(a.date) || b.id.localeCompare(a.id)),

    /** Ticket helpers */
    openTickets: () => db.complaints.filter(c => c.status === 'Open' || c.status === 'In Progress'),
    studentName: sid => { const s = Dt.student(sid); return s ? s.name : 'Former student'; }
  };

  const Notify = SC.notify = {
    push({ to = 'all', uid = null, text, type = 'info', link = null }) {
      db.notifications.unshift({ id: S.nextId('NT'), to, uid, text, type, link, time: new Date().toISOString(), readBy: [] });
      db.notifications = db.notifications.slice(0, 80); S.save();
    },
    forUser: user => db.notifications
      .filter(n => n.uid ? n.uid === user.id : (n.to === 'all' || n.to === user.role))
      .sort((a, b) => b.time.localeCompare(a.time)),
    unread: user => Notify.forUser(user).filter(n => !n.readBy.includes(user.id)).length,
    markRead(user, id) { const n = S.find('notifications', id); if (n && !n.readBy.includes(user.id)) { n.readBy.push(user.id); S.save(); } },
    markAll(user) { Notify.forUser(user).forEach(n => { if (!n.readBy.includes(user.id)) n.readBy.push(user.id); }); S.save(); }
  };

  /* Preferences: theme, sidebar state, notification toggles (per browser) */
  const Prefs = SC.prefs = {
    get: () => Object.assign({ theme: 'light', collapsed: false, email: true, sms: false, push: true }, SC.storage.get(PREFS_KEY) || {}),
    set(patch) { SC.storage.set(PREFS_KEY, Object.assign(Prefs.get(), patch)); },
    apply() { document.documentElement.setAttribute('data-theme', Prefs.get().theme); }
  };

  /* ======================================================================
     4. UI COMPONENTS
     ====================================================================== */
  const UI = SC.ui = {};

  function ensureRoot(id, cls) {
    let el = document.getElementById(id);
    if (!el) { el = document.createElement('div'); el.id = id; if (cls) el.className = cls; document.body.appendChild(el); }
    return el;
  }

  /* ---- Toasts ---- */
  const TOAST_ICON = { success: 'circle-check', error: 'circle-xmark', warning: 'triangle-exclamation', info: 'circle-info' };
  UI.toast = (message, type = 'success') => {
    const root = ensureRoot('toastRoot', 'toast-root');
    root.setAttribute('aria-live', 'polite');
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    el.innerHTML = html`<i class="fa-solid fa-${TOAST_ICON[type] || 'circle-info'}"></i><span>${message}</span><button class="toast-close" aria-label="Dismiss"><i class="fa-solid fa-xmark"></i></button>`;
    const remove = () => { el.classList.add('leaving'); setTimeout(() => el.remove(), 200); };
    el.querySelector('.toast-close').addEventListener('click', remove);
    root.appendChild(el);
    setTimeout(remove, type === 'error' ? 6000 : 4000);
  };

  /* ---- Small building blocks ---- */
  const TONE = {
    Open: 'warning', 'In Progress': 'info', Resolved: 'success', Rejected: 'danger', Active: 'success', Inactive: 'neutral',
    Pending: 'warning', Submitted: 'info', Graded: 'success', Overdue: 'danger', Answered: 'success', Cancelled: 'danger',
    High: 'danger', Medium: 'warning', Low: 'neutral', Complaint: 'purple', 'Service Request': 'info',
    Technical: 'info', Workshop: 'purple', Sports: 'success', Cultural: 'purple', Placement: 'warning', Social: 'success',
    Exam: 'danger', Academic: 'info', General: 'neutral', Holiday: 'success', Lab: 'purple', Theory: 'neutral'
  };
  UI.badge = (text, tone, icon) => html`<span class="badge badge-${tone || TONE[text] || 'neutral'}">${icon ? html`<i class="fa-solid fa-${icon}"></i>` : ''}${text}</span>`;
  UI.demoTag = () => '';
  UI.avatar = (name, size = 'md') => html`<span class="avatar avatar-${size} av-${U.hash(name) % 6}" aria-hidden="true">${U.initials(name)}</span>`;
  UI.progress = (pct, tone) => html`<div class="progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span class="progress-bar tone-${tone || 'blue'}" style="width:${Math.min(100, Math.max(0, pct))}%"></span></div>`;
  UI.icon = name => html`<i class="fa-solid fa-${name}"></i>`;

  UI.stat = ({ icon, label, value, sub, tone = 'blue' }) => html`
    <div class="card stat">
      <div class="stat-icon tone-${tone}"><i class="fa-solid fa-${icon}"></i></div>
      <div class="stat-body"><span class="stat-label">${label}</span><strong class="stat-value">${value}</strong>${sub ? html`<span class="stat-sub">${sub}</span>` : ''}</div>
    </div>`;

  UI.pageHead = (title, sub, actions) => html`
    <div class="page-head">
      <div><h1>${title}</h1>${sub ? html`<p>${sub}</p>` : ''}</div>
      ${actions ? html`<div class="page-actions">${actions}</div>` : ''}
    </div>`;

  UI.card = (title, body, opt = {}) => html`
    <section class="card ${opt.cls || ''}">
      ${title || opt.actions ? html`<header class="card-head"><h3>${opt.icon ? html`<i class="fa-solid fa-${opt.icon}"></i>` : ''}${title}</h3>${opt.actions ? html`<div class="card-actions">${opt.actions}</div>` : ''}</header>` : ''}
      <div class="card-body ${opt.flush ? 'flush' : ''}">${body}</div>
    </section>`;

  UI.empty = ({ icon = 'inbox', title = 'Nothing here yet', text = '', action = '' } = {}) => html`
    <div class="empty"><div class="empty-icon"><i class="fa-solid fa-${icon}"></i></div><h4>${title}</h4>${text ? html`<p>${text}</p>` : ''}${action}</div>`;

  UI.table = (headers, rows, cls = '') => html`
    <div class="table-wrap"><table class="table ${cls}"><thead><tr>${headers.map(h => html`<th scope="col">${h}</th>`)}</tr></thead><tbody>${rows}</tbody></table></div>`;

  UI.options = (list, selected) => list.map(o => {
    const [v, l] = Array.isArray(o) ? o : [o, o];
    return html`<option value="${v}" ${String(v) === String(selected) ? 'selected' : ''}>${l}</option>`;
  });

  /* ---- Tabs (state survives page re-renders) ---- */
  UI.tabs = (key, tabs) => {
    SC.state.tabDefault[key] = tabs[0].id;
    const active = SC.state.tabs[key] || tabs[0].id;
    return html`<div class="tabs" role="tablist" data-tabs="${key}">${tabs.map(t => html`
      <button class="tab ${t.id === active ? 'active' : ''}" role="tab" aria-selected="${String(t.id === active)}" data-act="tab" data-key="${key}" data-tab="${t.id}">
        ${t.icon ? html`<i class="fa-solid fa-${t.icon}"></i>` : ''}<span>${t.label}</span>${t.count !== undefined ? html`<em class="tab-count">${t.count}</em>` : ''}
      </button>`)}</div>`;
  };
  UI.panel = (key, id, content) => {
    const active = SC.state.tabs[key] || SC.state.tabDefault[key];
    return html`<div class="tab-panel" data-panel="${key}:${id}" ${id === active ? '' : 'hidden'}>${content}</div>`;
  };

  /* ---- Modal ---- */
  let lastFocus = null;
  UI.closeModal = () => {
    const root = document.getElementById('modalRoot');
    if (root) root.innerHTML = '';
    document.body.classList.remove('modal-open');
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
    lastFocus = null;
  };
  UI.modal = ({ title, body, footer, size = 'md' }) => {
    const root = ensureRoot('modalRoot');
    if (!root.innerHTML) lastFocus = document.activeElement;
    root.innerHTML = html`
      <div class="modal-overlay" data-act="overlay">
        <div class="modal modal-${size}" role="dialog" aria-modal="true" aria-label="${title}">
          <div class="modal-head"><h3>${title}</h3><button class="btn-icon" data-act="close-modal" aria-label="Close dialog"><i class="fa-solid fa-xmark"></i></button></div>
          <div class="modal-body">${body}</div>
          ${footer ? html`<div class="modal-foot">${footer}</div>` : ''}
        </div>
      </div>`;
    document.body.classList.add('modal-open');
    const first = root.querySelector('input:not([type=hidden]):not([readonly]), select, textarea');
    setTimeout(() => { if (first) first.focus(); else { const b = root.querySelector('.modal-foot .btn-primary, .modal-head .btn-icon'); if (b) b.focus(); } }, 30);
    return root.querySelector('.modal');
  };

  UI.confirm = ({ title = 'Are you sure?', text, confirmLabel = 'Confirm', danger = false, onConfirm }) => {
    UI.modal({
      title, size: 'sm',
      body: html`<div class="confirm"><div class="confirm-icon ${danger ? 'danger' : ''}"><i class="fa-solid fa-${danger ? 'triangle-exclamation' : 'circle-question'}"></i></div><p>${text}</p></div>`,
      footer: html`<button class="btn btn-ghost" data-act="close-modal">Cancel</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="confirmOk">${confirmLabel}</button>`
    });
    document.getElementById('confirmOk').addEventListener('click', () => { UI.closeModal(); if (onConfirm) onConfirm(); });
  };

  /**
   * Form modal. fields: [{ name, label, type, options, value, required, placeholder, hint, span, min, max, step, readonly }]
   * Types: text, email, tel, number, date, time, password, select, textarea, file, checkbox, segmented.
   * onSubmit(values) may return false to keep the dialog open.
   */
  function fieldHtml(f) {
    const id = 'f_' + f.name;
    const val = f.value === undefined || f.value === null ? '' : f.value;
    const attrs = html`${f.required ? 'required' : ''} ${f.readonly ? 'readonly' : ''}`;
    let control;
    switch (f.type) {
      case 'select':
        control = html`<select class="select" id="${id}" name="${f.name}" ${attrs}>${UI.options(f.options || [], val)}</select>`; break;
      case 'textarea':
        control = html`<textarea class="textarea" id="${id}" name="${f.name}" rows="${f.rows || 3}" placeholder="${f.placeholder || ''}" ${attrs}>${val}</textarea>`; break;
      case 'checkbox':
        control = html`<label class="check"><input type="checkbox" id="${id}" name="${f.name}" ${val ? 'checked' : ''}><span>${f.checkLabel || f.label}</span></label>`; break;
      case 'segmented':
        control = html`<div class="segmented" role="radiogroup">${(f.options || []).map(o => html`<label><input type="radio" name="${f.name}" value="${o}" ${o === val ? 'checked' : ''}><span>${o}</span></label>`)}</div>`; break;
      case 'file':
        control = html`<input class="input" type="file" id="${id}" name="${f.name}">`; break;
      default:
        control = html`<input class="input" type="${f.type || 'text'}" id="${id}" name="${f.name}" value="${val}" placeholder="${f.placeholder || ''}"
          ${f.min !== undefined ? html`min="${f.min}"` : ''} ${f.max !== undefined ? html`max="${f.max}"` : ''} ${f.step !== undefined ? html`step="${f.step}"` : ''}
          ${f.maxlength ? html`maxlength="${f.maxlength}"` : ''} autocomplete="${f.autocomplete || 'off'}" ${attrs}>`;
    }
    const showLabel = f.type !== 'checkbox';
    return html`<div class="field ${f.span === 2 ? 'span-2' : ''}" data-field="${f.name}">
      ${showLabel ? html`<label class="label" for="${id}">${f.label}${f.required ? html`<span class="req" aria-hidden="true"> *</span>` : ''}</label>` : ''}
      ${control}
      ${f.hint ? html`<small class="hint">${f.hint}</small>` : ''}
      <small class="field-error" role="alert"></small>
    </div>`;
  }

  UI.form = ({ title, fields, submitLabel = 'Save', size = 'md', note, validate, onSubmit }) => {
    UI.modal({
      title, size,
      body: html`<form id="modalForm" novalidate>${note ? html`<div class="note">${note}</div>` : ''}<div class="form-grid">${fields.map(fieldHtml)}</div></form>`,
      footer: html`<button type="button" class="btn btn-ghost" data-act="close-modal">Cancel</button><button type="submit" class="btn btn-primary" form="modalForm" id="modalSubmit">${submitLabel}</button>`
    });
    const form = document.getElementById('modalForm');
    const setError = (name, msg) => {
      const wrap = form.querySelector(`[data-field="${name}"]`);
      if (!wrap) return;
      wrap.classList.toggle('has-error', !!msg);
      wrap.querySelector('.field-error').textContent = msg || '';
    };
    const collect = () => {
      const values = {};
      fields.forEach(f => {
        if (f.type === 'segmented') { const c = form.querySelector(`[name="${f.name}"]:checked`); values[f.name] = c ? c.value : ''; }
        else if (f.type === 'checkbox') values[f.name] = form.elements[f.name].checked;
        else if (f.type === 'file') { const el = form.elements[f.name]; values[f.name] = el.files && el.files[0] ? el.files[0].name : ''; }
        else if (f.type === 'number') { const v = form.elements[f.name].value; values[f.name] = v === '' ? null : Number(v); }
        else values[f.name] = form.elements[f.name].value.trim();
      });
      return values;
    };
    form.addEventListener('submit', ev => {
      ev.preventDefault();
      const v = collect();
      let ok = true;
      fields.forEach(f => {
        let msg = '';
        const empty = v[f.name] === '' || v[f.name] === null || v[f.name] === false;
        if (f.required && empty) msg = f.type === 'checkbox' ? 'Please tick this box to continue.' : `${f.label} is required.`;
        else if (f.type === 'email' && v[f.name] && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v[f.name])) msg = 'Enter a valid email address, for example name@campus.edu.';
        else if (f.type === 'tel' && v[f.name] && !/^[0-9+\-\s]{7,15}$/.test(v[f.name])) msg = 'Enter a valid phone number (7 to 15 digits).';
        else if (f.type === 'number' && v[f.name] !== null && ((f.min !== undefined && v[f.name] < f.min) || (f.max !== undefined && v[f.name] > f.max))) msg = `Enter a value between ${f.min} and ${f.max}.`;
        setError(f.name, msg);
        if (msg) ok = false;
      });
      if (ok && validate) {
        const errs = validate(v) || {};
        Object.keys(errs).forEach(k => { setError(k, errs[k]); ok = false; });
      }
      if (!ok) { const bad = form.querySelector('.has-error input, .has-error select, .has-error textarea'); if (bad) bad.focus(); return; }
      try {
        const res = onSubmit(v);
        if (res !== false) UI.closeModal();
      } catch (e) { console.error(e); UI.toast('Something went wrong while saving. Please try again.', 'error'); }
    });
    return form;
  };

  /**
   * Data view: a search/filter toolbar with a live-updating result area.
   * Keeps its filter state between page re-renders. Filters: { key, type:'search'|'select', placeholder|label, options }.
   */
  UI.dataView = cfg => {
    const state = Object.assign({}, cfg.initial || {});
    const bodyId = 'dv-' + cfg.id;
    const view = {
      state,
      html() {
        if (SC.state.pendingQ !== null && cfg.filters.some(f => f.key === 'q')) state.q = SC.state.pendingQ;
        const tools = cfg.filters.map(f => f.type === 'search'
          ? html`<label class="search-field"><i class="fa-solid fa-magnifying-glass"></i><input type="search" class="input" data-dv="${cfg.id}:${f.key}" placeholder="${f.placeholder}" aria-label="${f.placeholder}" value="${state[f.key] || ''}"></label>`
          : html`<select class="select" data-dv="${cfg.id}:${f.key}" aria-label="${f.label}">${UI.options(f.options, state[f.key] === undefined ? f.options[0][0] : state[f.key])}</select>`);
        return html`<div class="toolbar">${tools}${cfg.toolbarExtra || ''}</div><div id="${bodyId}" class="dv-body"></div>`;
      },
      refresh() {
        const el = document.getElementById(bodyId);
        if (!el) return;
        cfg.filters.forEach(f => { if (state[f.key] === undefined && f.type === 'select') state[f.key] = f.options[0][0]; });
        const rows = cfg.getRows(state);
        el.innerHTML = rows.length ? cfg.renderRows(rows, state) : (typeof cfg.empty === 'function' ? cfg.empty(state) : UI.empty(cfg.empty || {}));
      },
      mount(root) {
        root.querySelectorAll(`[data-dv^="${cfg.id}:"]`).forEach(inp => {
          const key = inp.dataset.dv.split(':')[1];
          inp.addEventListener(inp.tagName === 'SELECT' ? 'change' : 'input', () => { state[key] = inp.value; view.refresh(); });
        });
        view.refresh();
      }
    };
    return view;
  };

  /* ======================================================================
     5. CSS / SVG CHARTS (no libraries)
     ====================================================================== */
  const PALETTE = ['#3557f2', '#8b6cf6', '#22b8cf', '#c3b3ff', '#f59f00', '#20c997', '#f06595'];
  SC.PALETTE = PALETTE;
  const Ch = SC.charts = {};

  Ch.bar = (items, opt = {}) => {
    if (!items.length) return UI.empty({ icon: 'chart-simple', title: 'No data to chart' });
    const max = opt.max || Math.max(1, ...items.map(i => i.value));
    return html`<div class="chart-bars" style="--cols:${items.length}" role="img" aria-label="${opt.label || 'Bar chart'}">${items.map((it, i) => html`
      <div class="bar-col" title="${it.label}: ${it.value}${opt.unit || ''}">
        <span class="bar-val">${it.value}${opt.unit || ''}</span>
        <div class="bar-track"><div class="bar-fill" style="height:${Math.max(3, it.value / max * 100)}%;background:${it.color || PALETTE[i % PALETTE.length]}"></div></div>
        <span class="bar-label">${it.label}</span>
      </div>`)}</div>`;
  };

  Ch.hbar = (items, opt = {}) => {
    if (!items.length) return UI.empty({ icon: 'chart-simple', title: 'No data to chart' });
    const max = opt.max || Math.max(1, ...items.map(i => i.value));
    return html`<div class="hbars">${items.map((it, i) => html`
      <div class="hbar-row">
        <div class="hbar-head"><span title="${it.label}">${it.label}</span><strong>${it.text !== undefined ? it.text : it.value + (opt.unit || '')}</strong></div>
        <div class="progress"><span class="progress-bar" style="width:${Math.min(100, it.value / max * 100)}%;background:${it.color || PALETTE[i % PALETTE.length]}"></span></div>
      </div>`)}</div>`;
  };

  Ch.donut = (items, opt = {}) => {
    const total = U.sum(items.map(i => i.value));
    if (!total) return UI.empty({ icon: 'chart-pie', title: 'No data to chart' });
    let acc = 0;
    const stops = items.map((it, i) => {
      const c = it.color || PALETTE[i % PALETTE.length];
      const from = acc / total * 100; acc += it.value; const to = acc / total * 100;
      return `${c} ${from}% ${to}%`;
    }).join(',');
    return html`<div class="donut-wrap">
      <div class="donut" style="background:conic-gradient(${stops})" role="img" aria-label="${opt.label || 'Donut chart'}">
        <div class="donut-hole"><strong>${opt.center !== undefined ? opt.center : total}</strong><span>${opt.centerLabel || 'Total'}</span></div>
      </div>
      <ul class="legend">${items.map((it, i) => html`<li><span class="dot" style="background:${it.color || PALETTE[i % PALETTE.length]}"></span>${it.label}<strong>${it.value}</strong></li>`)}</ul>
    </div>`;
  };

  Ch.ring = (pct, opt = {}) => {
    const r = 52, c = 2 * Math.PI * r, off = c * (1 - Math.min(100, pct) / 100);
    const col = opt.color || (pct >= 75 ? '#12a26a' : pct >= 60 ? '#e08a00' : '#e5484d');
    return html`<div class="ring" style="--size:${opt.size || 140}px">
      <svg viewBox="0 0 120 120" role="img" aria-label="${opt.label || 'Progress'} ${pct}%">
        <circle cx="60" cy="60" r="${r}" class="ring-bg"></circle>
        <circle cx="60" cy="60" r="${r}" class="ring-fg" style="stroke:${col};stroke-dasharray:${c.toFixed(1)};stroke-dashoffset:${off.toFixed(1)}" transform="rotate(-90 60 60)"></circle>
      </svg>
      <div class="ring-center"><strong>${pct}%</strong><span>${opt.label || ''}</span></div>
    </div>`;
  };

  Ch.line = (labels, values, opt = {}) => {
    const W = 560, H = 210, L = 34, R = 14, T = 16, B = 30;
    const min = opt.min !== undefined ? opt.min : Math.floor(Math.min(...values) / 10) * 10 - 10;
    const max = opt.max !== undefined ? opt.max : Math.ceil(Math.max(...values) / 10) * 10 + 5;
    const x = i => L + (values.length === 1 ? (W - L - R) / 2 : i * (W - L - R) / (values.length - 1));
    const y = v => T + (H - T - B) * (1 - (v - min) / ((max - min) || 1));
    const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
    const ticks = [0, 1, 2, 3].map(i => Math.round(min + (max - min) * i / 3));
    const area = `M${x(0).toFixed(1)},${H - B} L${pts.join(' L')} L${x(values.length - 1).toFixed(1)},${H - B} Z`;
    return html`<svg class="line-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${opt.label || 'Line chart'}">
      ${ticks.map(t => html`<g><line x1="${L}" x2="${W - R}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}" class="grid-line"></line><text x="${L - 6}" y="${(y(t) + 4).toFixed(1)}" text-anchor="end" class="axis-text">${t}${opt.unit || ''}</text></g>`)}
      <path d="${area}" class="line-area"></path>
      <polyline points="${pts.join(' ')}" class="line-path"></polyline>
      ${values.map((v, i) => html`<g><circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="4" class="line-dot"><title>${labels[i]}: ${v}${opt.unit || ''}</title></circle><text x="${x(i).toFixed(1)}" y="${H - 10}" text-anchor="middle" class="axis-text">${labels[i]}</text></g>`)}
    </svg>`;
  };

  /* ======================================================================
     6. APPLICATION SHELL
     Sidebar + top bar + hash routing (#/timetable). Each role file passes
     a config: { role, nav: [...], pages: { id: { title, render(), mount() } } }.
     ====================================================================== */
  const A = SC.actions;
  const A_ = (name, fn) => { A[name] = fn; };
  SC.registerAction = A_;
  const Shell = SC.shell = { cfg: null, pageId: null };
  const ROLE_LABEL = { student: 'Student', faculty: 'Faculty', admin: 'Administration' };
  const NOTIF_ICON = { info: 'circle-info', success: 'circle-check', warning: 'triangle-exclamation', danger: 'circle-exclamation' };

  const currentRoute = () => (location.hash.replace(/^#\/?/, '').split('?')[0] || 'dashboard');
  const isDesktop = () => window.innerWidth >= 992;

  Shell.go = (id, q) => {
    SC.state.pendingQ = q === undefined ? null : q;
    if (currentRoute() === id) Shell.render(); else location.hash = '#/' + id;
  };
  Shell.refresh = () => { const y = window.scrollY; Shell.render(true); window.scrollTo(0, y); };

  function navHtml() {
    return Shell.cfg.nav.map(n => {
      if (n.heading) return html`<div class="nav-heading">${n.heading}</div>`;
      const badge = n.badge ? n.badge() : 0;
      return html`<a class="nav-link ${Shell.pageId === n.id ? 'active' : ''}" href="#/${n.id}" title="${n.label}" ${Shell.pageId === n.id ? 'aria-current="page"' : ''}>
        <i class="fa-solid fa-${n.icon}"></i><span class="nav-label">${n.label}</span>${badge ? html`<em class="nav-badge">${badge}</em>` : ''}</a>`;
    });
  }

  function shellHtml(cfg, user) {
    return html`
    <div class="app ${Prefs.get().collapsed ? 'collapsed' : ''}" id="appShell">
      <aside class="sidebar" id="sidebar" aria-label="Main navigation">
        <div class="brand">
          <span class="brand-logo"><i class="fa-solid fa-graduation-cap"></i></span>
          <span class="brand-text"><strong>CoreCampus</strong><small>${ROLE_LABEL[cfg.role]} portal</small></span>
        </div>
        <nav class="nav" id="nav"></nav>
        <div class="sidebar-foot">
          <button class="collapse-btn" data-act="collapse" aria-label="Collapse sidebar"><i class="fa-solid fa-angles-left"></i><span>Collapse menu</span></button>
        </div>
      </aside>
      <div class="backdrop" data-act="close-sidebar"></div>
      <div class="main">
        <header class="topbar">
          <button class="btn-icon menu-btn" data-act="menu" aria-label="Toggle navigation menu"><i class="fa-solid fa-bars"></i></button>
          <div class="gsearch">
            <i class="fa-solid fa-magnifying-glass"></i>
            <input id="gsearch" type="search" placeholder="Search pages, events, books, records" autocomplete="off" aria-label="Search the portal">
            <div class="gsearch-results" id="gsearchResults" hidden></div>
          </div>
          <div class="topbar-actions">
            <button class="btn-icon" data-act="toggle-theme" id="themeBtn" aria-label="Toggle dark mode"><i class="fa-solid fa-moon"></i></button>
            <div class="dropdown">
              <button class="btn-icon notif-btn" id="notifBtn" data-act="toggle-dd" data-dd="notifMenu" aria-label="Notifications" aria-haspopup="true"><i class="fa-regular fa-bell"></i><span class="notif-dot" id="notifDot" hidden>0</span></button>
              <div class="dropdown-menu notif-menu" id="notifMenu" hidden></div>
            </div>
            <div class="dropdown">
              <button class="profile-btn" id="profileBtn" data-act="toggle-dd" data-dd="profileMenu" aria-haspopup="true"></button>
              <div class="dropdown-menu profile-menu" id="profileMenu" hidden></div>
            </div>
          </div>
        </header>
        <main id="view" class="content" tabindex="-1"></main>
        <footer class="app-foot">SmartCampus Institute of Technology. A frontend-only prototype: every record shown is sample data.</footer>
      </div>
    </div>`;
  }

  function profileHtml(user) {
    const others = ['student', 'faculty', 'admin'].filter(r => r !== user.role);
    return html`
      <div class="dd-profile">${UI.avatar(user.name, 'lg')}<div><strong>${user.name}</strong><small>${user.email}</small></div></div>
      <button class="dd-item" data-act="go" data-page="profile"><i class="fa-solid fa-user"></i>My profile</button>
      <button class="dd-item" data-act="go" data-page="profile" data-tab="settings"><i class="fa-solid fa-gear"></i>Settings</button>
      <div class="dd-sep">Quick switch (demo)</div>
      ${others.map(r => html`<button class="dd-item" data-act="switch-role" data-role="${r}"><i class="fa-solid fa-repeat"></i>View as ${ROLE_LABEL[r].toLowerCase()}</button>`)}
      <div class="dd-sep"></div>
      <button class="dd-item" data-act="reset-demo"><i class="fa-solid fa-rotate-left"></i>Reset demo data</button>
      <button class="dd-item danger" data-act="logout"><i class="fa-solid fa-right-from-bracket"></i>Log out</button>`;
  }

  function updateChrome() {
    const user = SC.auth.user();
    if (!user) return;
    document.getElementById('nav').innerHTML = html`${navHtml()}`;
    document.getElementById('profileBtn').innerHTML = html`${UI.avatar(user.name, 'sm')}<span class="profile-text"><strong>${user.name}</strong><small>${ROLE_LABEL[user.role]}</small></span><i class="fa-solid fa-chevron-down"></i>`;
    document.getElementById('profileMenu').innerHTML = profileHtml(user);
    const n = Notify.unread(user), dot = document.getElementById('notifDot');
    dot.textContent = n > 9 ? '9+' : n; dot.hidden = !n;
    const dark = Prefs.get().theme === 'dark';
    document.getElementById('themeBtn').innerHTML = `<i class="fa-solid fa-${dark ? 'sun' : 'moon'}"></i>`;
  }

  Shell.render = function (keep) {
    const cfg = Shell.cfg;
    let id = currentRoute();
    let page = cfg.pages[id];
    if (!page) { id = 'dashboard'; page = cfg.pages.dashboard; }
    Shell.pageId = id;
    document.title = `${page.title} | SmartCampus`;
    const view = document.getElementById('view');
    try {
      view.innerHTML = page.render();
      if (page.mount) page.mount(view);
    } catch (e) {
      console.error(e);
      view.innerHTML = UI.empty({ icon: 'bug', title: 'This page could not be displayed', text: 'Reload the page, or choose Reset demo data from the profile menu.' });
    }
    SC.state.pendingQ = null;
    updateChrome();
    if (!keep) { window.scrollTo(0, 0); document.getElementById('appShell').classList.remove('sidebar-open'); }
  };

  Shell.start = function (cfg) {
    const user = SC.auth.require(cfg.role);
    if (!user) return;
    Shell.cfg = cfg;
    Prefs.apply();
    document.getElementById('app').innerHTML = shellHtml(cfg, user);
    bindGlobalEvents();
    window.addEventListener('hashchange', () => Shell.render());
    Shell.render();
  };

  /* ---- Notifications dropdown ---- */
  function renderNotifMenu() {
    const user = SC.auth.user();
    const list = Notify.forUser(user).slice(0, 8);
    document.getElementById('notifMenu').innerHTML = html`
      <div class="dd-head"><strong>Notifications</strong><button class="link-btn" data-act="notif-all">Mark all as read</button></div>
      ${list.length ? html`<ul class="notif-list">${list.map(n => html`<li>
        <button class="notif-item ${n.readBy.includes(user.id) ? '' : 'unread'}" data-act="notif-open" data-id="${n.id}" data-link="${n.link || ''}">
          <span class="notif-ico tone-${n.type}"><i class="fa-solid fa-${NOTIF_ICON[n.type] || 'circle-info'}"></i></span>
          <span class="notif-body"><span class="notif-text">${n.text}</span><small>${U.timeAgo(n.time)}</small></span>
        </button></li>`)}</ul>`
        : UI.empty({ icon: 'bell-slash', title: 'You are all caught up', text: 'New alerts will appear here.' })}`;
  }

  /* ---- Global search ---- */
  function searchIndex() {
    const cfg = Shell.cfg, user = SC.auth.user(), role = cfg.role, items = [];
    const add = (icon, title, sub, go, q) => { if (cfg.pages[go]) items.push({ icon, title, sub, go, q }); };
    cfg.nav.filter(n => n.id).forEach(n => items.push({ icon: n.icon, title: n.label, sub: 'Open page', go: n.id, q: null }));
    Dt.visibleAnnouncements(role).forEach(a => add('bullhorn', a.title, 'Announcement, ' + a.category, 'announcements', a.title));
    db.events.forEach(e => add('calendar-days', e.title, 'Event on ' + U.fmtDate(e.date), 'events', e.title));
    db.books.forEach(b => add('book', b.title, 'Book by ' + b.author, 'library', b.title));
    if (role === 'admin') {
      db.students.forEach(s => add('user-graduate', s.name, `Student ${s.id}, ${s.dept}`, 'students', s.name));
      db.faculty.forEach(f => add('chalkboard-user', f.name, `Faculty, ${f.dept}`, 'faculty', f.name));
      db.complaints.forEach(c => add('ticket', c.subject, `Ticket ${c.id}`, 'complaints', c.id));
    } else if (role === 'faculty') {
      const depts = U.unique(Dt.subjectsTaughtBy(user.refId).map(s => s.dept));
      db.students.filter(s => depts.includes(s.dept)).forEach(s => add('user-graduate', s.name, `Student ${s.id}`, 'attendance', s.name));
      Dt.subjectsTaughtBy(user.refId).forEach(s => add('book-open', s.name, 'Your subject ' + s.code, 'assignments', s.name));
    } else {
      const st = Dt.student(user.refId);
      Dt.assignmentsFor(st.dept).forEach(a => add('file-pen', a.title, 'Assignment, ' + a.code, 'assignments', a.title));
      db.complaints.filter(c => c.sid === st.id).forEach(c => add('ticket', c.subject, `Ticket ${c.id}`, 'helpdesk', c.id));
    }
    return items;
  }
  function runSearch(q) {
    const box = document.getElementById('gsearchResults');
    q = q.trim();
    if (!q) { box.hidden = true; return; }
    const res = searchIndex().filter(i => U.matches(q, i.title, i.sub)).slice(0, 8);
    box.innerHTML = res.length
      ? html`<ul>${res.map(r => html`<li><button data-act="search-go" data-page="${r.go}" data-q="${r.q === null ? '' : r.q}" data-plain="${r.q === null ? '1' : ''}"><i class="fa-solid fa-${r.icon}"></i><span><strong>${r.title}</strong><small>${r.sub}</small></span></button></li>`)}</ul>`
      : html`<div class="gsearch-empty">No results for "${q}". Try a name, subject or event title.</div>`;
    box.hidden = false;
  }

  function closeDropdowns() {
    document.querySelectorAll('.dropdown-menu').forEach(m => { m.hidden = true; });
    const g = document.getElementById('gsearchResults'); if (g) g.hidden = true;
  }

  /* ---- Global click / change / keyboard handling ---- */
  let bound = false;
  function bindGlobalEvents() {
    if (bound) return; bound = true;
    document.addEventListener('click', ev => {
      if (!ev.target.closest('.dropdown')) document.querySelectorAll('.dropdown-menu').forEach(m => { m.hidden = true; });
      if (!ev.target.closest('.gsearch')) { const g = document.getElementById('gsearchResults'); if (g) g.hidden = true; }
      const el = ev.target.closest('[data-act]');
      if (!el) return;
      if (el.dataset.act === 'overlay' && ev.target !== el) return;
      const fn = A[el.dataset.act];
      if (fn) fn(el, ev);
    });
    document.addEventListener('change', ev => {
      const el = ev.target.closest('[data-change]');
      if (el && A[el.dataset.change]) A[el.dataset.change](el, ev);
    });
    document.addEventListener('keydown', ev => {
      if (ev.key === 'Escape') { UI.closeModal(); closeDropdowns(); }
      if (ev.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) {
        const s = document.getElementById('gsearch'); if (s) { ev.preventDefault(); s.focus(); }
      }
    });
    const gs = document.getElementById('gsearch');
    gs.addEventListener('input', () => runSearch(gs.value));
    gs.addEventListener('focus', () => runSearch(gs.value));
    gs.addEventListener('keydown', ev => { if (ev.key === 'Enter') { const first = document.querySelector('#gsearchResults button'); if (first) first.click(); } });
  }

  A['close-modal'] = () => UI.closeModal();
  A.overlay = () => UI.closeModal();
  A['close-sidebar'] = () => document.getElementById('appShell').classList.remove('sidebar-open');
  A.menu = () => {
    const app = document.getElementById('appShell');
    if (isDesktop()) A.collapse(); else app.classList.toggle('sidebar-open');
  };
  A.collapse = () => {
    const app = document.getElementById('appShell');
    app.classList.toggle('collapsed'); Prefs.set({ collapsed: app.classList.contains('collapsed') });
  };
  A['toggle-dd'] = el => {
    const menu = document.getElementById(el.dataset.dd);
    const wasHidden = menu.hidden;
    closeDropdowns();
    if (wasHidden) { if (el.dataset.dd === 'notifMenu') renderNotifMenu(); menu.hidden = false; }
  };
  A['toggle-theme'] = () => { Prefs.set({ theme: Prefs.get().theme === 'dark' ? 'light' : 'dark' }); Prefs.apply(); updateChrome(); if (Shell.pageId === 'profile') Shell.refresh(); };
  A['notif-all'] = () => { Notify.markAll(SC.auth.user()); renderNotifMenu(); updateChrome(); };
  A['notif-open'] = el => {
    Notify.markRead(SC.auth.user(), el.dataset.id); closeDropdowns(); updateChrome();
    if (el.dataset.link && Shell.cfg.pages[el.dataset.link]) Shell.go(el.dataset.link);
  };
  A.go = el => {
    closeDropdowns();
    if (el.dataset.tab) SC.state.tabs[el.dataset.page] = el.dataset.tab;
    Shell.go(el.dataset.page, el.dataset.q !== undefined ? el.dataset.q : undefined);
  };
  A.tab = el => {
    const key = el.dataset.key, tab = el.dataset.tab;
    SC.state.tabs[key] = tab;
    document.querySelectorAll(`[data-tabs="${key}"] .tab`).forEach(t => { const on = t.dataset.tab === tab; t.classList.toggle('active', on); t.setAttribute('aria-selected', String(on)); });
    document.querySelectorAll(`[data-panel^="${key}:"]`).forEach(p => { p.hidden = p.dataset.panel !== `${key}:${tab}`; });
  };
  A['search-go'] = el => {
    const input = document.getElementById('gsearch'); input.value = '';
    document.getElementById('gsearchResults').hidden = true;
    Shell.go(el.dataset.page, el.dataset.plain ? undefined : el.dataset.q);
  };
  A.logout = () => SC.auth.logout();
  A['switch-role'] = el => SC.auth.switchTo(el.dataset.role);
  A['reset-demo'] = () => {
    closeDropdowns();
    UI.confirm({
      title: 'Reset demo data?', danger: true, confirmLabel: 'Reset data',
      text: 'This restores all sample students, tickets, events, books and settings to their original state. Changes you made during the demo will be lost.',
      onConfirm: () => { S.reset(); SC.state.tabs = {}; UI.toast('Demo data has been reset.'); setTimeout(() => location.reload(), 600); }
    });
  };

  /* ======================================================================
     7. SHARED PAGES
     Used by more than one role. Each behaves according to the signed-in role:
     students see their own data, faculty see read-only or own-content views,
     administrators get full management controls.
     ====================================================================== */
  const P = SC.pages;
  const me = () => SC.auth.user();
  const V = {}; // persistent data views (keep filters between renders)
  const tone = t => t;

  /* -----------------------------------------------------------------------
     TIMETABLE
     ----------------------------------------------------------------------- */
  const TT = { view: null, day: null, dept: 'CSE' };

  function ttEntries(user) {
    if (user.role === 'student') { const st = Dt.student(user.refId); return db.timetable.filter(t => t.dept === st.dept); }
    if (user.role === 'faculty') { const mine = Dt.subjectsTaughtBy(user.refId).map(s => s.code); return db.timetable.filter(t => mine.includes(t.code)); }
    return db.timetable.filter(t => t.dept === TT.dept);
  }
  const isCancelled = e => e.cancelledOn && e.cancelledOn === U.classDate() && U.dayName(U.classDate()) === e.day;

  function ttCard(e, user) {
    const s = Dt.subject(e.code) || {};
    const cancelled = isCancelled(e);
    return html`<div class="tt-card ${s.type === 'Lab' ? 'lab' : ''} ${cancelled ? 'cancelled' : ''}">
      <strong>${s.name}</strong>
      <small>${e.code}, ${s.room}</small>
      <small>${user.role === 'faculty' ? Dt.dept(e.dept) : Dt.facultyName(s.faculty)}</small>
      ${cancelled ? UI.badge('Cancelled', 'danger', 'ban') : ''}
    </div>`;
  }

  function ttWeek(entries, user) {
    const dayLabel = U.dayName(U.classDate());
    const marker = U.isToday(U.classDate()) ? 'Today' : 'Next class day';
    return html`<div class="table-wrap"><table class="tt-grid"><thead><tr><th scope="col"><span class="sr-only">Time</span></th>
      ${U.DAYS.map(d => html`<th scope="col" class="${d === dayLabel ? 'today' : ''}">${d}${d === dayLabel ? html`<small>${marker}</small>` : ''}</th>`)}</tr></thead>
      <tbody>${SC.SLOTS.map((slot, si) => html`
        <tr><th scope="row" class="tt-time">${U.fmtTime(slot[0])}<small>${U.fmtTime(slot[1])}</small></th>
        ${U.DAYS.map(day => {
          const list = entries.filter(e => e.day === day && e.slot === si);
          return html`<td class="${day === dayLabel ? 'today' : ''}">${list.length ? list.map(e => ttCard(e, user)) : html`<span class="tt-free">Free period</span>`}</td>`;
        })}</tr>
        ${si === 3 ? html`<tr class="tt-break"><td colspan="6"><i class="fa-solid fa-utensils"></i> Lunch break, 1:15 PM to 2:00 PM</td></tr>` : ''}`)}
      </tbody></table></div>`;
  }

  function ttDay(entries, user) {
    const day = TT.day || U.dayName(U.classDate());
    const list = entries.filter(e => e.day === day).sort((a, b) => a.slot - b.slot);
    return html`
      <div class="chips" role="tablist">${U.DAYS.map(d => html`<button class="chip ${d === day ? 'active' : ''}" data-act="tt-day" data-day="${d}">${d.slice(0, 3)}</button>`)}</div>
      ${list.length ? html`<div class="stack tt-day">${list.map(e => html`
        <div class="tt-day-row"><div class="time-chip">${U.fmtTime(SC.SLOTS[e.slot][0])}<small>${U.fmtTime(SC.SLOTS[e.slot][1])}</small></div>${ttCard(e, user)}</div>`)}</div>`
        : UI.empty({ icon: 'mug-hot', title: `No classes on ${day}`, text: 'Enjoy the free day, or check another day from the list above.' })}`;
  }

  function ttFacultyPanel(entries) {
    const date = U.classDate();
    const list = entries.filter(e => e.day === U.dayName(date)).sort((a, b) => a.slot - b.slot);
    return UI.card(`Your classes on ${U.fmtDay(date)}`, list.length ? html`<div class="list">${list.map(e => {
      const s = Dt.subject(e.code), c = e.cancelledOn === date;
      return html`<div class="list-item">
        <div class="time-chip">${U.fmtTime(SC.SLOTS[e.slot][0])}</div>
        <div class="grow"><strong>${s.name}</strong><small>${Dt.dept(e.dept)}, ${s.room}</small></div>
        ${c ? UI.badge('Cancelled', 'danger') : ''}
        <button class="btn btn-sm ${c ? 'btn-soft' : 'btn-outline-danger'}" data-act="tt-cancel" data-id="${e.id}">${c ? 'Restore class' : 'Cancel class'}</button>
      </div>`;
    })}</div>` : UI.empty({ icon: 'mug-hot', title: 'No classes on this day' }),
    { icon: 'bell', cls: 'mb', actions: UI.demoTag('Students are notified inside the demo') });
  }

  P.timetable = {
    title: 'Timetable',
    render() {
      const user = me();
      if (!TT.view) TT.view = window.innerWidth < 768 ? 'day' : 'week';
      const entries = ttEntries(user);
      let sub = 'Your weekly teaching schedule.';
      if (user.role === 'student') { const st = Dt.student(user.refId); sub = `${Dt.dept(st.dept)}, Semester ${st.sem}, Section ${st.section}.`; }
      if (user.role === 'admin') sub = 'Weekly class schedule for each department.';
      const actions = html`
        ${user.role === 'admin' ? html`<select class="select" data-change="tt-dept" aria-label="Department">${UI.options(Object.keys(DEPTS).map(k => [k, DEPTS[k]]), TT.dept)}</select>` : ''}
        <div class="segmented" role="group" aria-label="View">
          <button class="seg-btn ${TT.view === 'week' ? 'active' : ''}" data-act="tt-view" data-view="week"><i class="fa-solid fa-table-cells"></i> Week</button>
          <button class="seg-btn ${TT.view === 'day' ? 'active' : ''}" data-act="tt-view" data-view="day"><i class="fa-solid fa-list"></i> Day</button>
        </div>
        <button class="btn btn-soft" data-act="tt-export"><i class="fa-solid fa-download"></i> Download CSV</button>`;
      return html`<div class="page">${UI.pageHead('Timetable', sub, actions)}
        ${user.role === 'faculty' ? ttFacultyPanel(entries) : ''}
        ${UI.card('', TT.view === 'week' ? ttWeek(entries, user) : ttDay(entries, user), { flush: TT.view === 'week' })}
        <p class="legend-line"><span class="swatch lab"></span> Lab session <span class="swatch cancel"></span> Cancelled class</p></div>`;
    }
  };
  A_('tt-view', el => { TT.view = el.dataset.view; Shell.refresh(); });
  A_('tt-day', el => { TT.day = el.dataset.day; Shell.refresh(); });
  A_('tt-dept', el => { TT.dept = el.value; Shell.refresh(); });
  A_('tt-export', () => {
    const rows = ttEntries(me()).sort((a, b) => U.DAYS.indexOf(a.day) - U.DAYS.indexOf(b.day) || a.slot - b.slot).map(e => {
      const s = Dt.subject(e.code);
      return [e.day, `${SC.SLOTS[e.slot][0]}-${SC.SLOTS[e.slot][1]}`, e.code, s.name, Dt.facultyName(s.faculty), s.room];
    });
    U.download('timetable.csv', U.toCSV(['Day', 'Time', 'Code', 'Subject', 'Faculty', 'Room'], rows));
    UI.toast('Timetable downloaded as a CSV file.');
  });
  A_('tt-cancel', el => {
    const e = S.find('timetable', el.dataset.id), date = U.classDate(), s = Dt.subject(e.code);
    const restoring = e.cancelledOn === date;
    e.cancelledOn = restoring ? null : date; S.save();
    const when = `${U.fmtDay(date)} at ${U.fmtTime(SC.SLOTS[e.slot][0])}`;
    Notify.push({ to: 'student', text: restoring ? `${s.name} on ${when} is back on as scheduled.` : `${s.name} on ${when} has been cancelled.`, type: restoring ? 'success' : 'warning', link: 'timetable' });
    S.log(`${Dt.facultyName(s.faculty)} ${restoring ? 'restored' : 'cancelled'} ${s.name} on ${U.fmtDay(date)}`, 'ban');
    UI.toast(restoring ? 'Class restored. Students have been notified (demo).' : 'Class cancelled. Students have been notified (demo).', restoring ? 'success' : 'warning');
    Shell.refresh();
  });

  /* -----------------------------------------------------------------------
     ANNOUNCEMENTS
     ----------------------------------------------------------------------- */
  const ANN_CATS = ['Academic', 'Exam', 'Event', 'General', 'Holiday', 'Placement'];

  function annCard(a) {
    const user = me(), can = user.role === 'admin' || a.authorId === user.id;
    return html`<article class="card ann ${a.pinned ? 'pinned' : ''}">
      <div class="ann-head">${UI.badge(a.category)}${a.pinned ? UI.badge('Pinned', 'purple', 'thumbtack') : ''}
        ${user.role === 'admin' ? UI.badge('For ' + a.audience.toLowerCase(), 'neutral') : ''}<span class="grow"></span><time datetime="${a.date}">${U.fmtDate(a.date)}</time></div>
      <h3>${a.title}</h3><p>${a.body}</p>
      <footer class="ann-foot"><span class="who">${UI.avatar(a.author, 'sm')}${a.author}</span>
        ${can ? html`<span class="row-actions">
          ${user.role === 'admin' ? html`<button class="btn btn-sm btn-ghost" data-act="ann-pin" data-id="${a.id}"><i class="fa-solid fa-thumbtack"></i> ${a.pinned ? 'Unpin' : 'Pin'}</button>` : ''}
          <button class="btn btn-sm btn-ghost" data-act="ann-edit" data-id="${a.id}"><i class="fa-solid fa-pen"></i> Edit</button>
          <button class="btn btn-sm btn-ghost-danger" data-act="ann-del" data-id="${a.id}"><i class="fa-solid fa-trash"></i> Delete</button></span>` : ''}
      </footer></article>`;
  }

  function annForm(a) {
    const user = me(), admin = user.role === 'admin';
    UI.form({
      title: a ? 'Edit announcement' : 'New announcement', size: 'lg', submitLabel: a ? 'Save changes' : 'Publish announcement',
      note: html`Recipients receive an in-app notification. ${UI.demoTag('No email or SMS is sent in the demo')}`,
      fields: [
        { name: 'title', label: 'Title', required: true, span: 2, value: a && a.title, placeholder: 'For example: Guest lecture on cloud computing' },
        { name: 'category', label: 'Category', type: 'select', options: ANN_CATS, value: a ? a.category : (admin ? 'General' : 'Academic') },
        { name: 'audience', label: 'Send to', type: 'select', options: admin ? ['All', 'Students', 'Faculty'] : ['Students'], value: a ? a.audience : (admin ? 'All' : 'Students') },
        { name: 'body', label: 'Message', type: 'textarea', rows: 5, required: true, span: 2, value: a && a.body },
        ...(admin ? [{ name: 'pinned', label: 'Pin to top', type: 'select', options: ['No', 'Yes'], value: a && a.pinned ? 'Yes' : 'No' }] : [])
      ],
      onSubmit(v) {
        const data = { title: v.title, category: v.category, audience: v.audience, body: v.body, pinned: admin ? v.pinned === 'Yes' : (a ? a.pinned : false) };
        if (a) { S.update('announcements', a.id, data); UI.toast('Announcement updated.'); }
        else {
          S.add('announcements', Object.assign({ id: S.nextId('AN'), authorId: user.id, author: user.name, date: U.iso() }, data));
          Notify.push({ to: v.audience === 'All' ? 'all' : v.audience === 'Students' ? 'student' : 'faculty', text: `New announcement: ${v.title}`, type: 'info', link: 'announcements' });
          S.log(`${user.name} posted "${v.title}"`, 'bullhorn');
          UI.toast('Announcement published. Recipients have been notified (demo).');
        }
        Shell.refresh();
      }
    });
  }
  A_('ann-new', () => annForm(null));
  A_('ann-edit', el => annForm(S.find('announcements', el.dataset.id)));
  A_('ann-pin', el => { const a = S.find('announcements', el.dataset.id); S.update('announcements', a.id, { pinned: !a.pinned }); UI.toast(a.pinned ? 'Announcement pinned to the top.' : 'Announcement unpinned.'); Shell.refresh(); });
  A_('ann-del', el => {
    const a = S.find('announcements', el.dataset.id);
    UI.confirm({ title: 'Delete announcement?', danger: true, confirmLabel: 'Delete', text: `"${a.title}" will be removed for everyone.`, onConfirm: () => { S.remove('announcements', a.id); UI.toast('Announcement deleted.'); Shell.refresh(); } });
  });

  P.announcements = {
    title: 'Announcements',
    render() {
      const user = me();
      V.ann = V.ann || UI.dataView({
        id: 'ann',
        filters: [{ key: 'q', type: 'search', placeholder: 'Search announcements' }, { key: 'cat', type: 'select', label: 'Category', options: [['all', 'All categories']].concat(ANN_CATS.map(c => [c, c])) }],
        getRows: st => Dt.visibleAnnouncements(me().role).filter(a => (st.cat === 'all' || a.category === st.cat) && U.matches(st.q, a.title, a.body, a.author)),
        renderRows: rows => html`<div class="stack">${rows.map(annCard)}</div>`,
        empty: { icon: 'bullhorn', title: 'No announcements match', text: 'Try another category or clear the search box.' }
      });
      const canPost = user.role !== 'student';
      return html`<div class="page">${UI.pageHead('Announcements and notices', 'Official notices from the institute, departments and faculty.',
        canPost ? html`<button class="btn btn-primary" data-act="ann-new"><i class="fa-solid fa-plus"></i> New announcement</button>` : '')}
        ${V.ann.html()}</div>`;
    },
    mount(root) { V.ann.mount(root); }
  };

  /* -----------------------------------------------------------------------
     CAMPUS EVENTS
     ----------------------------------------------------------------------- */
  const EV_CATS = ['Technical', 'Workshop', 'Sports', 'Cultural', 'Placement', 'Social'];

  function eventCard(e) {
    const user = me(), role = user.role;
    const d = U.parse(e.date), left = U.daysUntil(e.date), past = left < 0;
    const regs = e.registered.length, full = regs >= e.capacity;
    const mine = role === 'student' && e.registered.includes(user.refId);
    let action;
    if (role === 'student') {
      if (past) action = html`<button class="btn btn-ghost" disabled>Event ended</button>`;
      else if (mine) action = html`<button class="btn btn-soft" data-act="ev-register" data-id="${e.id}"><i class="fa-solid fa-check"></i> Registered. Cancel?</button>`;
      else if (full) action = html`<button class="btn btn-ghost" disabled>Event is full</button>`;
      else action = html`<button class="btn btn-primary" data-act="ev-register" data-id="${e.id}">Register</button>`;
    } else if (role === 'admin') {
      action = html`<button class="btn btn-soft" data-act="ev-regs" data-id="${e.id}"><i class="fa-solid fa-users"></i> Registrations</button>
        <button class="btn-icon" data-act="ev-edit" data-id="${e.id}" aria-label="Edit event"><i class="fa-solid fa-pen"></i></button>
        <button class="btn-icon danger" data-act="ev-del" data-id="${e.id}" aria-label="Delete event"><i class="fa-solid fa-trash"></i></button>`;
    }
    return html`<article class="card event ${past ? 'past' : ''}">
      <div class="event-top">
        <div class="date-block"><strong>${d.getDate()}</strong><span>${d.toLocaleDateString('en-US', { month: 'short' })}</span></div>
        <div class="grow"><div class="ann-head">${UI.badge(e.category)}${past ? UI.badge('Completed', 'neutral') : left === 0 ? UI.badge('Today', 'success') : left <= 7 ? UI.badge(`In ${U.plural(left, 'day')}`, 'warning') : ''}</div><h3>${e.title}</h3></div>
      </div>
      <ul class="meta-list"><li><i class="fa-regular fa-clock"></i>${U.fmtDay(e.date)}, ${U.fmtTime(e.time)}</li><li><i class="fa-solid fa-location-dot"></i>${e.venue}</li><li><i class="fa-solid fa-users"></i>${e.organizer}</li></ul>
      <p class="clamp">${e.description}</p>
      <div class="seats"><div class="seats-head"><span>${regs} of ${e.capacity} seats taken</span><strong>${U.pctOf(regs, e.capacity)}%</strong></div>${UI.progress(U.pctOf(regs, e.capacity), full ? 'red' : 'blue')}</div>
      <footer class="event-foot"><button class="btn btn-ghost" data-act="ev-details" data-id="${e.id}">Details</button><span class="grow"></span>${action || ''}</footer>
    </article>`;
  }

  function eventForm(e) {
    UI.form({
      title: e ? 'Edit event' : 'Create event', size: 'lg', submitLabel: e ? 'Save changes' : 'Create event',
      fields: [
        { name: 'title', label: 'Event title', required: true, span: 2, value: e && e.title },
        { name: 'category', label: 'Category', type: 'select', options: EV_CATS, value: e ? e.category : 'Technical' },
        { name: 'organizer', label: 'Organised by', required: true, value: e && e.organizer },
        { name: 'date', label: 'Date', type: 'date', required: true, value: e ? e.date : U.dayOffset(14) },
        { name: 'time', label: 'Start time', type: 'time', required: true, value: e ? e.time : '10:00' },
        { name: 'venue', label: 'Venue', required: true, value: e && e.venue },
        { name: 'capacity', label: 'Seats available', type: 'number', min: 1, max: 5000, required: true, value: e ? e.capacity : 100 },
        { name: 'description', label: 'Description', type: 'textarea', rows: 4, required: true, span: 2, value: e && e.description }
      ],
      validate: v => e && v.capacity < e.registered.length ? { capacity: `Already ${e.registered.length} students have registered.` } : null,
      onSubmit(v) {
        if (e) { S.update('events', e.id, v); UI.toast('Event updated.'); }
        else {
          S.add('events', Object.assign({ id: S.nextId('EV'), registered: [] }, v));
          Notify.push({ to: 'student', text: `New event: ${v.title} on ${U.fmtDate(v.date)}. Registrations are open.`, type: 'info', link: 'events' });
          S.log(`Event created: ${v.title}`, 'calendar-plus'); UI.toast('Event created. Students have been notified (demo).');
        }
        Shell.refresh();
      }
    });
  }

  A_('ev-new', () => eventForm(null));
  A_('ev-edit', el => eventForm(S.find('events', el.dataset.id)));
  A_('ev-del', el => {
    const e = S.find('events', el.dataset.id);
    UI.confirm({ title: 'Delete event?', danger: true, confirmLabel: 'Delete event', text: `"${e.title}" and its ${U.plural(e.registered.length, 'registration')} will be removed.`, onConfirm: () => { S.remove('events', e.id); UI.toast('Event deleted.'); Shell.refresh(); } });
  });
  A_('ev-register', el => {
    const user = me(), e = S.find('events', el.dataset.id), sid = user.refId;
    if (e.registered.includes(sid)) {
      e.registered = e.registered.filter(x => x !== sid); S.save(); UI.toast(`Registration cancelled for ${e.title}.`, 'info');
    } else if (e.registered.length >= e.capacity) {
      UI.toast('Sorry, this event is full.', 'error');
    } else {
      e.registered.push(sid); S.save();
      Notify.push({ to: 'student', uid: user.id, text: `You are registered for ${e.title} on ${U.fmtDate(e.date)}.`, type: 'success', link: 'events' });
      S.log(`${user.name} registered for ${e.title}`, 'calendar-check');
      UI.toast(`You are registered for ${e.title}. A confirmation was added to your notifications.`);
    }
    Shell.refresh();
  });
  A_('ev-details', el => {
    const e = S.find('events', el.dataset.id);
    UI.modal({
      title: e.title, size: 'md',
      body: html`<div class="ann-head mb">${UI.badge(e.category)}</div><p>${e.description}</p>
        <dl class="details"><dt>Date</dt><dd>${U.fmtDay(e.date)}, ${U.fmtTime(e.time)}</dd><dt>Venue</dt><dd>${e.venue}</dd><dt>Organised by</dt><dd>${e.organizer}</dd><dt>Seats</dt><dd>${e.registered.length} of ${e.capacity} taken</dd></dl>`,
      footer: html`<button class="btn btn-primary" data-act="close-modal">Close</button>`
    });
  });
  A_('ev-regs', el => {
    const e = S.find('events', el.dataset.id);
    const rows = e.registered.map(Dt.student).filter(Boolean);
    UI.modal({
      title: `Registrations for ${e.title}`, size: 'lg',
      body: rows.length ? UI.table(['Student', 'Roll number', 'Department', ''], rows.map(s => html`<tr>
        <td><div class="cell-user">${UI.avatar(s.name, 'sm')}<strong>${s.name}</strong></div></td><td>${s.id}</td><td>${s.dept}</td>
        <td class="right"><button class="btn btn-sm btn-ghost-danger" data-act="ev-unreg" data-id="${e.id}" data-sid="${s.id}">Remove</button></td></tr>`))
        : UI.empty({ icon: 'user-clock', title: 'No registrations yet', text: 'Students who register will appear here.' }),
      footer: html`${rows.length ? html`<button class="btn btn-soft" data-act="ev-export" data-id="${e.id}"><i class="fa-solid fa-download"></i> Export CSV</button>` : ''}<button class="btn btn-primary" data-act="close-modal">Done</button>`
    });
  });
  A_('ev-unreg', el => {
    const e = S.find('events', el.dataset.id); e.registered = e.registered.filter(x => x !== el.dataset.sid); S.save();
    UI.toast('Registration removed.', 'info'); A['ev-regs']({ dataset: { id: e.id } }); Shell.refresh();
  });
  A_('ev-export', el => {
    const e = S.find('events', el.dataset.id);
    U.download(`registrations-${e.id}.csv`, U.toCSV(['Roll number', 'Name', 'Department', 'Email'], e.registered.map(Dt.student).filter(Boolean).map(s => [s.id, s.name, s.dept, s.email])));
    UI.toast('Registration list downloaded.');
  });

  P.events = {
    title: 'Campus events',
    render() {
      const user = me();
      const whenOpts = [['all', 'All dates'], ['upcoming', 'Upcoming'], ['past', 'Past events']].concat(user.role === 'student' ? [['mine', 'My registrations']] : []);
      V.events = V.events || UI.dataView({
        id: 'events', initial: { when: 'upcoming' },
        filters: [{ key: 'q', type: 'search', placeholder: 'Search events' }, { key: 'cat', type: 'select', label: 'Category', options: [['all', 'All categories']].concat(EV_CATS.map(c => [c, c])) }, { key: 'when', type: 'select', label: 'When', options: whenOpts }],
        getRows: st => {
          const u = me();
          return db.events.filter(e => (st.cat === 'all' || e.category === st.cat)
            && (st.when === 'all' || (st.when === 'upcoming' && U.daysUntil(e.date) >= 0) || (st.when === 'past' && U.daysUntil(e.date) < 0) || (st.when === 'mine' && e.registered.includes(u.refId)))
            && U.matches(st.q, e.title, e.venue, e.organizer, e.description))
            .sort((a, b) => st.when === 'past' ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date));
        },
        renderRows: rows => html`<div class="grid cards-3">${rows.map(eventCard)}</div>`,
        empty: { icon: 'calendar-xmark', title: 'No events found', text: 'Change the filters to see more events.' }
      });
      const upcoming = db.events.filter(e => U.daysUntil(e.date) >= 0);
      const stats = html`<div class="grid stats">
        ${UI.stat({ icon: 'calendar-days', label: 'Upcoming events', value: upcoming.length, tone: 'blue' })}
        ${UI.stat({ icon: 'user-check', label: user.role === 'student' ? 'Your registrations' : 'Total registrations', value: user.role === 'student' ? db.events.filter(e => e.registered.includes(user.refId)).length : U.sum(db.events.map(e => e.registered.length)), tone: 'purple' })}
        ${UI.stat({ icon: 'fire', label: 'Next event', value: upcoming.length ? U.fmtDay(upcoming.slice().sort((a, b) => a.date.localeCompare(b.date))[0].date) : 'None', tone: 'teal' })}</div>`;
      return html`<div class="page">${UI.pageHead('Campus events', user.role === 'student' ? 'Discover what is happening on campus and reserve your seat.' : 'Workshops, competitions and cultural programmes.',
        user.role === 'admin' ? html`<button class="btn btn-primary" data-act="ev-new"><i class="fa-solid fa-plus"></i> Create event</button>` : '')}
        ${stats}${V.events.html()}</div>`;
    },
    mount(root) { V.events.mount(root); }
  };

  /* -----------------------------------------------------------------------
     LIBRARY
     ----------------------------------------------------------------------- */
  const BOOK_CATS = ['Computer Science', 'Electronics', 'Mechanical', 'Civil', 'Mathematics', 'General'];
  const MAX_BOOKS = 3;

  function bookForm(b) {
    UI.form({
      title: b ? 'Edit book' : 'Add book', submitLabel: b ? 'Save changes' : 'Add book',
      fields: [
        { name: 'title', label: 'Title', required: true, span: 2, value: b && b.title },
        { name: 'author', label: 'Author', required: true, value: b && b.author },
        { name: 'category', label: 'Category', type: 'select', options: BOOK_CATS, value: b ? b.category : 'Computer Science' },
        { name: 'shelf', label: 'Shelf code', required: true, value: b && b.shelf, placeholder: 'For example: CS-A12' },
        { name: 'copies', label: 'Total copies', type: 'number', min: 1, max: 100, required: true, value: b ? b.copies : 1 },
        { name: 'year', label: 'Edition year', type: 'number', min: 1900, max: 2030, required: true, value: b ? b.year : 2024 }
      ],
      validate: v => b && v.copies < Dt.activeIssues(b.id).length ? { copies: `${Dt.activeIssues(b.id).length} copies are currently issued.` } : null,
      onSubmit(v) {
        if (b) { S.update('books', b.id, v); UI.toast('Book details updated.'); }
        else { S.add('books', Object.assign({ id: S.nextId('BK') }, v)); S.log(`Book added to library: ${v.title}`, 'book'); UI.toast('Book added to the catalog.'); }
        Shell.refresh();
      }
    });
  }
  A_('bk-new', () => bookForm(null));
  A_('bk-edit', el => bookForm(S.find('books', el.dataset.id)));
  A_('bk-del', el => {
    const b = S.find('books', el.dataset.id);
    if (Dt.activeIssues(b.id).length) { UI.toast('This book has active loans. Mark them as returned first.', 'error'); return; }
    UI.confirm({ title: 'Delete book?', danger: true, confirmLabel: 'Delete', text: `"${b.title}" will be removed from the catalog.`, onConfirm: () => { S.remove('books', b.id); UI.toast('Book removed from the catalog.'); Shell.refresh(); } });
  });
  /* Student asks for a book: the admin has to approve before it is issued */
  A_('bk-issue', el => {
    const user = me(), b = S.find('books', el.dataset.id);
    const mine = Dt.myIssues(user.refId, true);
    if (mine.length >= MAX_BOOKS) { UI.toast(`Limit reached: you can borrow up to ${MAX_BOOKS} books at a time.`, 'error'); return; }
    if (mine.some(i => i.bookId === b.id)) { UI.toast('You already have, or have requested, a copy of this book.', 'error'); return; }
    if (!Dt.available(b)) { UI.toast('All copies are currently issued.', 'error'); return; }
    S.add('issues', { id: S.nextId('IS'), bookId: b.id, sid: user.refId, status: 'Issue Requested', requestedOn: U.iso(), issueDate: null, dueDate: null, returnDate: null });
    Notify.push({ to: 'admin', text: `${user.name} requested to issue "${b.title}".`, type: 'warning', link: 'library' });
    S.log(`${user.name} requested to borrow "${b.title}"`, 'book-open');
    UI.toast(`Request sent to the admin for approval: "${b.title}".`); Shell.refresh();
  });
  A_('bk-cancel', el => {
    const i = S.find('issues', el.dataset.id);
    if (!i || Dt.issueStatus(i) !== 'Issue Requested') return;
    S.remove('issues', i.id); UI.toast('Issue request cancelled.'); Shell.refresh();
  });
  /* Student asks to return a book: the admin confirms it has been received */
  A_('bk-return', el => {
    const user = me(), i = S.find('issues', el.dataset.id), b = S.find('books', i.bookId);
    if (Dt.issueStatus(i) !== 'Issued') return;
    S.update('issues', i.id, { status: 'Return Requested', returnRequestedOn: U.iso() });
    Notify.push({ to: 'admin', text: `${user.name} requested to return "${b ? b.title : 'a book'}".`, type: 'warning', link: 'library' });
    S.log(`${user.name} requested to return "${b ? b.title : 'a book'}"`, 'rotate-left');
    UI.toast('Return request sent to the admin for approval.'); Shell.refresh();
  });
  /* Admin decisions */
  const notifyLoan = (i, text, type) => { const u = Dt.userOf(i.sid); Notify.push({ to: 'student', uid: u && u.id, text, type, link: 'library' }); };
  A_('bk-approve-issue', el => {
    const i = S.find('issues', el.dataset.id), b = S.find('books', i.bookId), due = U.dayOffset(14);
    S.update('issues', i.id, { status: 'Issued', issueDate: U.iso(), dueDate: due, approvedBy: me().name });
    notifyLoan(i, `Your request was approved: "${b.title}" is issued. Return by ${U.fmtDate(due)}.`, 'success');
    S.log(`Issue approved: "${b.title}" for ${Dt.studentName(i.sid)}`, 'book-open');
    UI.toast(`Issue approved. Due on ${U.fmtDate(due)}.`); Shell.refresh();
  });
  A_('bk-reject-issue', el => {
    const i = S.find('issues', el.dataset.id), b = S.find('books', i.bookId);
    UI.confirm({ title: 'Reject issue request?', danger: true, confirmLabel: 'Reject', text: `"${b.title}" will not be issued to ${Dt.studentName(i.sid)}.`, onConfirm: () => {
      S.update('issues', i.id, { status: 'Rejected', decidedBy: me().name });
      notifyLoan(i, `Your request for "${b.title}" was not approved.`, 'danger');
      UI.toast('Issue request rejected.'); Shell.refresh();
    } });
  });
  A_('bk-approve-return', el => {
    const i = S.find('issues', el.dataset.id), b = S.find('books', i.bookId);
    S.update('issues', i.id, { status: 'Returned', returnDate: U.iso(), approvedBy: me().name });
    const fine = Dt.fine(S.find('issues', i.id));
    notifyLoan(i, fine ? `Return of "${b.title}" confirmed. Late fine: Rs ${fine}.` : `Return of "${b.title}" confirmed. Thank you!`, fine ? 'warning' : 'success');
    S.log(`Return approved: "${b.title}" from ${Dt.studentName(i.sid)}`, 'rotate-left');
    UI.toast(fine ? `Return approved. Late fine Rs ${fine}.` : 'Return approved.', fine ? 'warning' : 'success'); Shell.refresh();
  });
  A_('bk-reject-return', el => {
    const i = S.find('issues', el.dataset.id), b = S.find('books', i.bookId);
    UI.confirm({ title: 'Reject return request?', danger: true, confirmLabel: 'Reject', text: `"${b.title}" stays issued to ${Dt.studentName(i.sid)}.`, onConfirm: () => {
      S.update('issues', i.id, { status: 'Issued' });
      notifyLoan(i, `Your return of "${b.title}" was not confirmed. Please hand the book in at the library.`, 'warning');
      UI.toast('Return request rejected.'); Shell.refresh();
    } });
  });

  function bookTable(rows) {
    const user = me(), role = user.role;
    const mineLoans = role === 'student' ? Dt.myIssues(user.refId, true) : [];
    const mineIds = mineLoans.map(i => i.bookId);
    return UI.table(['Title', 'Category', 'Shelf', 'Availability', ''], rows.map(b => {
      const av = Dt.available(b);
      let action = '';
      const myLoan = mineLoans.find(i => i.bookId === b.id);
      if (role === 'student') action = myLoan ? (Dt.issueStatus(myLoan) === 'Issue Requested' ? UI.badge('Awaiting admin approval', 'warning', 'hourglass-half') : UI.badge('Issued to you', 'info', 'check'))
        : av ? html`<button class="btn btn-sm btn-primary" data-act="bk-issue" data-id="${b.id}">Issue book</button>` : html`<button class="btn btn-sm btn-ghost" disabled>Unavailable</button>`;
      if (role === 'admin') action = html`<button class="btn-icon" data-act="bk-edit" data-id="${b.id}" aria-label="Edit book"><i class="fa-solid fa-pen"></i></button><button class="btn-icon danger" data-act="bk-del" data-id="${b.id}" aria-label="Delete book"><i class="fa-solid fa-trash"></i></button>`;
      return html`<tr><td><strong>${b.title}</strong><small class="block">${b.author}, ${b.year}</small></td><td>${b.category}</td><td>${b.shelf}</td>
        <td>${av ? UI.badge(`${av} of ${b.copies} available`, 'success') : UI.badge('All copies issued', 'danger')}</td><td class="right nowrap">${action}</td></tr>`;
    }));
  }

  function myBooks(user) {
    const list = Dt.myIssues(user.refId).sort((a, b) => (!Dt.holdsCopy(a) - !Dt.holdsCopy(b)) || (b.issueDate || b.requestedOn || '').localeCompare(a.issueDate || a.requestedOn || ''));
    if (!list.length) return UI.empty({ icon: 'book-open', title: 'You have not borrowed any books', text: 'Open the catalog tab and choose Issue book. The admin approves your request before the book is issued.' });
    return UI.table(['Book', 'Issued on', 'Due date', 'Status', ''], list.map(i => {
      const b = S.find('books', i.bookId) || { title: 'Removed book', author: '' }, left = U.daysUntil(i.dueDate);
      const ss = Dt.issueStatus(i), left2 = i.dueDate ? left : 99;
      const status = ss === 'Issue Requested' ? UI.badge('Awaiting admin approval', 'warning', 'hourglass-half') : ss === 'Rejected' ? UI.badge('Request rejected', 'danger') : ss === 'Return Requested' ? UI.badge('Return awaiting admin approval', 'warning', 'hourglass-half') : ss === 'Returned' ? UI.badge('Returned', 'neutral') : left2 < 0 ? UI.badge(`Overdue by ${U.plural(-left2, 'day')}. Fine Rs ${Dt.fine(i)}`, 'danger') : left2 <= 3 ? UI.badge(`Due in ${U.plural(left2, 'day')}`, 'warning') : UI.badge('On time', 'success');
      const act = ss === 'Issued' ? html`<button class="btn btn-sm btn-soft" data-act="bk-return" data-id="${i.id}">Request return</button>` : ss === 'Issue Requested' ? html`<button class="btn btn-sm btn-ghost" data-act="bk-cancel" data-id="${i.id}">Cancel request</button>` : '';
      return html`<tr><td><strong>${b.title}</strong><small class="block">${b.author}</small></td><td>${i.issueDate ? U.fmtDate(i.issueDate) : html`<span class="muted">Requested ${U.fmtDate(i.requestedOn)}</span>`}</td><td>${i.dueDate ? U.fmtDate(i.dueDate) : '-'}</td><td>${status}</td>
        <td class="right">${act}</td></tr>`;
    }));
  }

  P.library = {
    title: 'Library',
    render() {
      const user = me(), role = user.role;
      V.catalog = V.catalog || UI.dataView({
        id: 'catalog',
        filters: [{ key: 'q', type: 'search', placeholder: 'Search by title or author' }, { key: 'cat', type: 'select', label: 'Category', options: [['all', 'All categories']].concat(BOOK_CATS.map(c => [c, c])) }, { key: 'av', type: 'select', label: 'Availability', options: [['all', 'Any availability'], ['yes', 'Available now'], ['no', 'All copies issued']] }],
        getRows: st => db.books.filter(b => (st.cat === 'all' || b.category === st.cat) && (st.av === 'all' || (st.av === 'yes') === (Dt.available(b) > 0)) && U.matches(st.q, b.title, b.author, b.shelf)),
        renderRows: rows => UI.card('', bookTable(rows), { flush: true }),
        empty: { icon: 'book-open', title: 'No books match your search', text: 'Check the spelling or clear a filter.' }
      });
      V.records = V.records || UI.dataView({
        id: 'records',
        filters: [{ key: 'q', type: 'search', placeholder: 'Search student or book' }, { key: 'st', type: 'select', label: 'Status', options: [['all', 'All loans'], ['pending', 'Awaiting approval'], ['out', 'Currently issued'], ['late', 'Overdue'], ['back', 'Returned']] }],
        getRows: st => db.issues.filter(i => {
          const b = S.find('books', i.bookId) || {}, s = Dt.student(i.sid) || {};
          const ss = Dt.issueStatus(i), late = ss === 'Issued' && U.daysUntil(i.dueDate) < 0;
          return (st.st === 'all' || (st.st === 'pending' && ['Issue Requested', 'Return Requested'].includes(ss)) || (st.st === 'out' && ['Issued', 'Return Requested'].includes(ss)) || (st.st === 'late' && late) || (st.st === 'back' && ss === 'Returned')) && U.matches(st.q, b.title, s.name, s.id);
        }).sort((a, b) => (['Issue Requested', 'Return Requested'].includes(Dt.issueStatus(b)) - ['Issue Requested', 'Return Requested'].includes(Dt.issueStatus(a))) || (b.issueDate || b.requestedOn || '').localeCompare(a.issueDate || a.requestedOn || '')),
        renderRows: rows => UI.card('', UI.table(['Student', 'Book', 'Issued', 'Due', 'Status', ''], rows.map(i => {
          const b = S.find('books', i.bookId) || { title: 'Removed book' }, ss = Dt.issueStatus(i), left = i.dueDate ? U.daysUntil(i.dueDate) : 99;
          const status = ss === 'Issue Requested' ? UI.badge('Issue requested', 'warning', 'hourglass-half') : ss === 'Return Requested' ? UI.badge('Return requested', 'warning', 'hourglass-half') : ss === 'Rejected' ? UI.badge('Rejected', 'danger') : ss === 'Returned' ? UI.badge('Returned', 'neutral') : left < 0 ? UI.badge(`Overdue, Rs ${Dt.fine(i)}`, 'danger') : UI.badge('Issued', 'info');
          const btn = (act, label, cls) => html`<button class="btn btn-sm ${cls}" data-act="${act}" data-id="${i.id}">${label}</button>`;
          const act = ss === 'Issue Requested' ? html`${btn('bk-approve-issue', 'Approve', 'btn-primary')} ${btn('bk-reject-issue', 'Reject', 'btn-ghost')}` : ss === 'Return Requested' ? html`${btn('bk-approve-return', 'Approve return', 'btn-primary')} ${btn('bk-reject-return', 'Reject', 'btn-ghost')}` : ss === 'Issued' ? btn('bk-approve-return', 'Mark returned', 'btn-soft') : '';
          return html`<tr><td><strong>${Dt.studentName(i.sid)}</strong><small class="block">${i.sid}</small></td><td>${b.title}</td><td>${i.issueDate ? U.fmtDate(i.issueDate) : html`<span class="muted">Requested ${U.fmtDate(i.requestedOn)}</span>`}</td><td>${i.dueDate ? U.fmtDate(i.dueDate) : '-'}</td><td>${status}</td>
            <td class="right nowrap">${act}</td></tr>`;
        })), { flush: true }),
        empty: { icon: 'clipboard-list', title: 'No loan records match', text: 'Change the status filter to see more.' }
      });
      const copies = U.sum(db.books.map(b => b.copies)), avail = U.sum(db.books.map(Dt.available));
      let stats, tabs = '', body;
      if (role === 'student') {
        const mine = Dt.myIssues(user.refId, true);
        const dueSoon = mine.filter(i => U.daysUntil(i.dueDate) <= 3).length, fines = U.sum(mine.map(Dt.fine));
        stats = html`<div class="grid stats">
          ${UI.stat({ icon: 'book-bookmark', label: 'Books you have', value: `${mine.length} of ${MAX_BOOKS}`, tone: 'blue' })}
          ${UI.stat({ icon: 'hourglass-half', label: 'Due within 3 days', value: dueSoon, tone: dueSoon ? 'orange' : 'teal' })}
          ${UI.stat({ icon: 'indian-rupee-sign', label: 'Pending fines', value: 'Rs ' + fines, tone: fines ? 'red' : 'teal' })}</div>`;
        tabs = UI.tabs('library', [{ id: 'catalog', label: 'Catalog', icon: 'book' }, { id: 'mine', label: 'My books', icon: 'bookmark', count: mine.length }]);
        body = html`${UI.panel('library', 'catalog', V.catalog.html())}${UI.panel('library', 'mine', UI.card('', myBooks(user), { flush: true }))}`;
      } else if (role === 'admin') {
        const out = db.issues.filter(i => ['Issued', 'Return Requested'].includes(Dt.issueStatus(i))), late = out.filter(i => Dt.issueStatus(i) === 'Issued' && U.daysUntil(i.dueDate) < 0), pend = Dt.pendingIssues();
        stats = html`<div class="grid stats">
          ${UI.stat({ icon: 'layer-group', label: 'Titles in catalog', value: db.books.length, sub: `${copies} copies in total`, tone: 'blue' })}
          ${UI.stat({ icon: 'clock', label: 'Awaiting your approval', value: pend.length, sub: 'Issue and return requests', tone: pend.length ? 'orange' : 'teal' })}
          ${UI.stat({ icon: 'hand-holding', label: 'Books currently issued', value: out.length, tone: 'purple' })}
          ${UI.stat({ icon: 'triangle-exclamation', label: 'Overdue loans', value: late.length, tone: late.length ? 'red' : 'teal' })}</div>`;
        tabs = UI.tabs('library', [{ id: 'catalog', label: 'Catalog', icon: 'book' }, { id: 'records', label: 'Loan records', icon: 'clipboard-list', count: pend.length }]);
        body = html`${UI.panel('library', 'catalog', V.catalog.html())}${UI.panel('library', 'records', V.records.html())}`;
      } else {
        stats = html`<div class="grid stats">
          ${UI.stat({ icon: 'layer-group', label: 'Titles in catalog', value: db.books.length, tone: 'blue' })}
          ${UI.stat({ icon: 'check-double', label: 'Copies available now', value: avail, sub: `of ${copies} copies`, tone: 'teal' })}</div>`;
        body = V.catalog.html();
      }
      return html`<div class="page">${UI.pageHead('Library', role === 'student' ? 'Search the catalog and request up to three books at a time. The admin approves each issue and return. Late fine is Rs 2 per day.' : 'Catalog, circulation and approval of student issue and return requests.',
        role === 'admin' ? html`<button class="btn btn-primary" data-act="bk-new"><i class="fa-solid fa-plus"></i> Add book</button>` : '')}${stats}${tabs}${body}</div>`;
    },
    mount(root) {
      V.catalog.mount(root);
      const role = me().role;
      if (role === 'admin') V.records.mount(root);
    }
  };


  /* -----------------------------------------------------------------------
     TICKET TIMELINE (shared by student, faculty and admin)
     ----------------------------------------------------------------------- */
  A_('tk-view', el => {
    const c = S.find('complaints', el.dataset.id);
    if (!c) return;
    UI.modal({
      title: `${c.id}: ${c.subject}`, size: 'lg',
      body: html`<div class="ann-head mb">${UI.badge(c.kind)}${UI.badge(c.status)}${UI.badge(c.priority + ' priority')}</div><p>${c.description}</p>
        <dl class="details"><dt>Raised by</dt><dd>${Dt.studentName(c.sid)} (${c.sid})</dd><dt>Category</dt><dd>${c.category}</dd><dt>Raised on</dt><dd>${U.fmtDate(c.date)}</dd><dt>Handled by</dt><dd>${c.assignee}</dd></dl>
        <h4 class="mt">Progress timeline</h4><ol class="timeline">${c.remarks.map(r => html`<li><strong>${r.by}</strong><small>${U.fmtDate(r.date)}</small><p>${r.text}</p></li>`)}</ol>`,
      footer: html`<button class="btn btn-primary" data-act="close-modal">Close</button>`
    });
  });

  /* -----------------------------------------------------------------------
     PROFILE AND SETTINGS
     ----------------------------------------------------------------------- */
  function profileRows(user, rec) {
    if (user.role === 'student') {
      const mentor = db.faculty.find(f => f.dept === rec.dept);
      return [['Roll number', rec.id], ['Department', Dt.dept(rec.dept)], ['Year and semester', `Year ${rec.year}, Semester ${rec.sem}`], ['Batch', rec.batch], ['Section', rec.section],
        ['CGPA', rec.cgpa.toFixed(2)], ['Overall attendance', Dt.overall(rec.id) + '%'], ['Class mentor', mentor ? mentor.name : 'Not assigned'],
        ['Email', rec.email], ['Phone', rec.phone], ['Guardian', rec.guardian], ['Address', rec.address]];
    }
    if (user.role === 'faculty') {
      return [['Employee ID', rec.id], ['Department', Dt.dept(rec.dept)], ['Designation', rec.designation], ['Qualification', rec.qualification], ['Experience', U.plural(rec.experience, 'year')],
        ['Office', rec.office], ['Subjects', Dt.subjectsTaughtBy(rec.id).map(s => s.code).join(', ') || 'None assigned'], ['Email', rec.email], ['Phone', rec.phone]];
    }
    return [['Designation', rec.designation], ['Office', rec.office], ['Email', rec.email], ['Phone', rec.phone]];
  }

  function editProfile() {
    const user = me(), { kind, rec } = Dt.record(user);
    const fields = [
      { name: 'name', label: 'Full name', required: true, value: rec.name },
      { name: 'phone', label: 'Phone number', type: 'tel', required: true, value: rec.phone }
    ];
    if (user.role === 'student') fields.push({ name: 'guardian', label: 'Guardian name', value: rec.guardian }, { name: 'address', label: 'Address', value: rec.address });
    else fields.push({ name: 'office', label: 'Office', value: rec.office });
    fields.push({ name: 'bio', label: 'About me', type: 'textarea', rows: 3, span: 2, value: rec.bio, placeholder: 'A short introduction that appears on your profile' });
    UI.form({
      title: 'Edit profile', fields, submitLabel: 'Save profile',
      onSubmit(v) {
        S.update(kind, rec.id, v);
        if (kind !== 'users') S.update('users', user.id, { name: v.name });
        UI.toast('Profile updated.'); Shell.refresh();
      }
    });
  }
  A_('profile-edit', editProfile);
  A_('pw-change', () => {
    const user = me();
    UI.form({
      title: 'Change password', submitLabel: 'Update password', size: 'sm',
      note: html`${UI.demoTag('Password is stored in your browser only')} Choose at least 6 characters.`,
      fields: [
        { name: 'current', label: 'Current password', type: 'password', required: true, span: 2, autocomplete: 'current-password' },
        { name: 'next', label: 'New password', type: 'password', required: true, span: 2, autocomplete: 'new-password' },
        { name: 'again', label: 'Confirm new password', type: 'password', required: true, span: 2, autocomplete: 'new-password' }
      ],
      validate: v => {
        const e = {};
        if (v.current !== user.password) e.current = 'Current password is incorrect.';
        if (v.next.length < 6) e.next = 'Use at least 6 characters.';
        if (v.again !== v.next) e.again = 'Passwords do not match.';
        return e;
      },
      onSubmit(v) { S.update('users', user.id, { password: v.next }); UI.toast('Password updated.'); }
    });
  });
  A_('pref', el => {
    const key = el.dataset.key;
    if (key === 'dark') { Prefs.set({ theme: el.checked ? 'dark' : 'light' }); Prefs.apply(); }
    else Prefs.set({ [key]: el.checked });
    UI.toast('Preference saved.', 'info'); if (key === 'dark') Shell.refresh();
  });

  const switchRow = (key, title, text, checked, demo) => html`
    <label class="switch-row"><span><strong>${title} ${demo ? UI.demoTag('Saved as a preference, but nothing is actually sent') : ''}</strong><small>${text}</small></span>
    <span class="switch"><input type="checkbox" data-change="pref" data-key="${key}" ${checked ? 'checked' : ''}><i></i></span></label>`;

  P.profile = {
    title: 'Profile and settings',
    render() {
      const user = me(), { rec } = Dt.record(user), prefs = Prefs.get();
      const tabs = UI.tabs('profile', [{ id: 'profile', label: 'Profile', icon: 'id-card' }, { id: 'settings', label: 'Settings', icon: 'gear' }]);
      const profile = html`<div class="profile-layout">
        ${UI.card('', html`<div class="profile-hero">${UI.avatar(rec.name, 'xl')}<h2>${rec.name}</h2><p>${user.role === 'student' ? `${rec.dept}, Year ${rec.year}` : rec.designation}</p>
          ${UI.badge(ROLE_LABEL[user.role], 'purple')}${rec.bio ? html`<p class="bio">${rec.bio}</p>` : html`<p class="bio muted">Add a short introduction using Edit profile.</p>`}
          <button class="btn btn-primary block-btn" data-act="profile-edit"><i class="fa-solid fa-pen"></i> Edit profile</button></div>`)}
        ${UI.card('Personal and academic details', html`<dl class="details wide">${profileRows(user, rec).map(([k, v]) => html`<dt>${k}</dt><dd>${v}</dd>`)}</dl>`, { icon: 'address-card' })}</div>`;
      const settings = html`<div class="grid two">
        ${UI.card('Appearance', switchRow('dark', 'Dark mode', 'Use a darker colour theme across the portal.', prefs.theme === 'dark'), { icon: 'palette' })}
        ${UI.card('Notifications', html`${switchRow('push', 'In-app alerts', 'Show alerts for announcements and updates.', prefs.push)}${switchRow('email', 'Email digest', 'A daily summary of what changed.', prefs.email, true)}${switchRow('sms', 'SMS alerts', 'Text messages for urgent notices.', prefs.sms, true)}`, { icon: 'bell' })}
        ${UI.card('Security', html`<p class="muted">Change the password used for the demo account.</p><button class="btn btn-soft" data-act="pw-change"><i class="fa-solid fa-key"></i> Change password</button>`, { icon: 'shield-halved' })}
        ${UI.card('Demo data', html`<p class="muted">Everything you add or change is stored in this browser. Reset to restore the original sample students, tickets, events and books before your next demonstration.</p><button class="btn btn-outline-danger" data-act="reset-demo"><i class="fa-solid fa-rotate-left"></i> Reset demo data</button>`, { icon: 'flask' })}</div>`;
      return html`<div class="page">${UI.pageHead('Profile and settings', 'Manage your details, appearance and notification preferences.')}${tabs}${UI.panel('profile', 'profile', profile)}${UI.panel('profile', 'settings', settings)}</div>`;
    }
  };

  /* -----------------------------------------------------------------------
     ATTENDANCE
     ----------------------------------------------------------------------- */
  function attendanceLegend() {
    return html`<p class="legend-line"><span class="dot" style="background:#12a26a"></span>75% or above <span class="dot" style="background:#e08a00"></span>60% to 74% <span class="dot" style="background:#e5484d"></span>Below 60%</p>`;
  }

  function studentAttendanceView(sid) {
    const rows = Dt.perSubject(sid), overall = Dt.overall(sid);
    return html`
      <div class="grid att-top">
        <div class="card ring-card">${Ch.ring(overall, { label: 'Overall' })}<p class="muted center">Institute requirement is 75% attendance in each subject.</p></div>
        ${UI.card('By subject', Ch.hbar(rows.map(r => ({ label: r.name, value: r.pct, text: `${r.pct}% (${r.attended}/${r.total})`, color: r.pct >= 75 ? '#12a26a' : r.pct >= 60 ? '#e08a00' : '#e5484d' }))), { cls: 'grow' })}
      </div>
      ${UI.card('Subject-wise detail', UI.table(['Subject', 'Faculty', 'Attended', 'Status', 'To reach 75%'], rows.map(r => html`
        <tr><td><strong>${r.name}</strong><small class="block">${r.code}${r.type === 'Lab' ? ', Lab' : ''}</small></td><td>${r.faculty}</td><td>${r.attended} / ${r.total}</td>
          <td>${UI.badge(r.pct + '%', Dt.attTone(r.pct))}</td>
          <td>${r.pct >= 75 ? html`<span class="muted">Can miss ${U.plural(Dt.canMiss(r.attended, r.total), 'class')}</span>` : html`<span class="warn-text">Attend next ${U.plural(Dt.need75(r.attended, r.total), 'class')}</span>`}</td></tr>`)), { flush: true })}
      ${attendanceLegend()}`;
  }

  function facultyMarkModal(dept, code) {
    const date = U.classDate(), students = Dt.studentsOfDept(dept).filter(s => s.status === 'Active');
    UI.modal({
      title: `Mark attendance, ${Dt.subject(code).name}`, size: 'lg',
      body: html`<p class="muted mb">${U.fmtDay(date)}. Toggle each student present or absent, then save.</p>
        <div class="table-wrap"><table class="table"><thead><tr><th>Student</th><th>Roll number</th><th class="right">Present</th></tr></thead>
        <tbody>${students.map(s => html`<tr><td>${UI.avatar(s.name, 'sm')} ${s.name}</td><td>${s.id}</td>
          <td class="right"><span class="switch"><input type="checkbox" checked data-mark="${s.id}"><i></i></span></td></tr>`)}</tbody></table></div>`,
      footer: html`<button class="btn btn-ghost" data-act="close-modal">Cancel</button><button class="btn btn-primary" id="saveAtt">Save attendance</button>`
    });
    document.getElementById('saveAtt').addEventListener('click', () => {
      let present = 0;
      students.forEach(s => {
        const on = document.querySelector(`[data-mark="${s.id}"]`).checked;
        if (on) present++;
        const row = db.attendance.find(a => a.sid === s.id && a.code === code);
        if (row) { row.total += 1; if (on) row.attended += 1; }
      });
      S.save(); S.log(`Attendance marked for ${Dt.subject(code).name} (${Dt.dept(dept)})`, 'clipboard-check');
      UI.toast(`Attendance saved for ${U.plural(students.length, 'student')}, ${present} present.`);
      UI.closeModal(); Shell.refresh();
    });
  }

  function facultyAttendanceView(fid) {
    const subs = Dt.subjectsTaughtBy(fid);
    if (!subs.length) return UI.empty({ icon: 'chalkboard', title: 'No subjects assigned yet' });
    if (!V.attSubject || !subs.find(s => s.code === V.attSubject)) V.attSubject = subs[0].code;
    const sub = Dt.subject(V.attSubject);
    const rows = Dt.studentsOfDept(sub.dept).filter(s => s.status === 'Active').map(s => {
      const a = db.attendance.find(x => x.sid === s.id && x.code === sub.code) || { attended: 0, total: 0 };
      return { s, pct: U.pctOf(a.attended, a.total), attended: a.attended, total: a.total };
    }).sort((a, b) => a.pct - b.pct);
    const atRisk = rows.filter(r => r.pct < 75).length;
    return html`
      <div class="toolbar"><select class="select" data-change="att-subject" aria-label="Subject">${UI.options(subs.map(s => [s.code, `${s.name} (${s.code})`]), V.attSubject)}</select>
        <span class="grow"></span><button class="btn btn-primary" data-act="att-mark" data-code="${sub.code}" data-dept="${sub.dept}"><i class="fa-solid fa-clipboard-check"></i> Mark today's attendance</button></div>
      <div class="grid stats">${UI.stat({ icon: 'users', label: 'Students', value: rows.length, tone: 'blue' })}${UI.stat({ icon: 'chart-line', label: 'Class average', value: Math.round(U.avg(rows.map(r => r.pct))) + '%', tone: 'purple' })}${UI.stat({ icon: 'triangle-exclamation', label: 'Below 75%', value: atRisk, tone: atRisk ? 'red' : 'teal' })}</div>
      ${UI.card('', UI.table(['Student', 'Roll number', 'Attended', 'Percentage'], rows.map(r => html`<tr><td>${UI.avatar(r.s.name, 'sm')} ${r.s.name}</td><td>${r.s.id}</td><td>${r.attended} / ${r.total}</td><td>${UI.progress(r.pct, Dt.attTone(r.pct))} <small>${r.pct}%</small></td></tr>`)), { flush: true })}
      ${attendanceLegend()}`;
  }

  function adminAttendanceView() {
    const rows = Object.keys(DEPTS).map(k => ({ label: k, value: Dt.deptAttendance(k) }));
    const low = db.students.filter(s => Dt.overall(s.id) < 75);
    return html`
      <div class="grid two">${UI.card('Average attendance by department', Ch.bar(rows, { unit: '%' }))}${UI.card('Institute average', html`${Ch.ring(Dt.avgAttendance(), { label: 'All students' })}<p class="muted center">${U.plural(low.length, 'student')} below the 75% requirement.</p>`)}</div>
      ${UI.card(`Students below 75% attendance`, low.length ? UI.table(['Student', 'Roll number', 'Department', 'Attendance'], low.sort((a, b) => Dt.overall(a.id) - Dt.overall(b.id)).map(s => html`
        <tr><td>${UI.avatar(s.name, 'sm')} ${s.name}</td><td>${s.id}</td><td>${s.dept}</td><td>${UI.progress(Dt.overall(s.id), 'red')} <small>${Dt.overall(s.id)}%</small></td></tr>`))
        : UI.empty({ icon: 'thumbs-up', title: 'No students below the requirement', text: 'Every student currently meets the 75% attendance rule.' }), { flush: true })}
      ${attendanceLegend()}`;
  }

  P.attendance = {
    title: 'Attendance',
    render() {
      const user = me();
      const sub = user.role === 'student' ? 'Your subject-wise attendance record.' : user.role === 'faculty' ? 'Mark and review attendance for your subjects.' : 'Attendance overview across departments.';
      const body = user.role === 'student' ? studentAttendanceView(user.refId) : user.role === 'faculty' ? facultyAttendanceView(user.refId) : adminAttendanceView();
      return html`<div class="page">${UI.pageHead('Attendance', sub)}${body}</div>`;
    }
  };
  A_('att-subject', el => { V.attSubject = el.value; Shell.refresh(); });
  A_('att-mark', el => facultyMarkModal(el.dataset.dept, el.dataset.code));

  /* -----------------------------------------------------------------------
     ASSIGNMENTS AND EXAMINATIONS
     ----------------------------------------------------------------------- */
  function asgForm(a, dept) {
    const subs = Dt.subjectsOf(dept);
    UI.form({
      title: a ? 'Edit assignment' : 'New assignment', size: 'lg', submitLabel: a ? 'Save changes' : 'Publish assignment',
      fields: [
        { name: 'title', label: 'Title', required: true, span: 2, value: a && a.title },
        { name: 'code', label: 'Subject', type: 'select', options: subs.map(s => [s.code, `${s.name} (${s.code})`]), value: a ? a.code : subs[0].code },
        { name: 'due', label: 'Due date', type: 'date', required: true, value: a ? a.due : U.dayOffset(7), min: U.iso() },
        { name: 'maxMarks', label: 'Maximum marks', type: 'number', min: 1, max: 100, required: true, value: a ? a.maxMarks : 20 },
        { name: 'description', label: 'Instructions', type: 'textarea', rows: 4, required: true, span: 2, value: a && a.description }
      ],
      onSubmit(v) {
        if (a) { S.update('assignments', a.id, v); UI.toast('Assignment updated.'); }
        else {
          S.add('assignments', Object.assign({ id: S.nextId('AS'), createdBy: me().refId, createdOn: U.iso() }, v));
          Notify.push({ to: 'student', text: `New assignment: ${v.title}, due ${U.fmtDate(v.due)}.`, type: 'info', link: 'assignments' });
          S.log(`New assignment posted: ${v.title}`, 'file-circle-plus'); UI.toast('Assignment published. Students have been notified (demo).');
        }
        Shell.refresh();
      }
    });
  }
  A_('asg-new', el => asgForm(null, el.dataset.dept));
  A_('asg-edit', el => { const a = S.find('assignments', el.dataset.id); asgForm(a, Dt.assignmentDept(a)); });
  A_('asg-del', el => {
    const a = S.find('assignments', el.dataset.id);
    UI.confirm({ title: 'Delete assignment?', danger: true, confirmLabel: 'Delete', text: `"${a.title}" and any submissions will be removed.`, onConfirm: () => { db.submissions = db.submissions.filter(s => s.aid !== a.id); S.remove('assignments', a.id); UI.toast('Assignment deleted.'); Shell.refresh(); } });
  });

  function submitModal(a) {
    const user = me(), existing = Dt.submission(a.id, user.refId);
    UI.form({
      title: existing ? 'Update your submission' : 'Submit assignment', submitLabel: existing ? 'Update submission' : 'Submit',
      note: html`${UI.demoTag('The file is not actually uploaded')} Choose any file to record a submission.`,
      fields: [
        { name: 'file', label: 'File', type: 'file', required: !existing },
        { name: 'note', label: 'Note to faculty (optional)', type: 'textarea', rows: 2 }
      ],
      onSubmit(v) {
        const late = U.daysUntil(a.due) < 0;
        const rec = { aid: a.id, sid: user.refId, date: U.iso(), file: v.file || (existing && existing.file) || `${user.refId}_${a.code}.pdf`, status: 'Submitted', marks: null, feedback: '', late };
        if (existing) S.update('submissions', existing.id, rec); else S.add('submissions', Object.assign({ id: S.nextId('SB') }, rec));
        S.log(`${user.name} submitted "${a.title}"`, 'file-arrow-up');
        UI.toast(late ? 'Submitted, but after the due date. It may be marked late.' : 'Assignment submitted successfully.', late ? 'warning' : 'success');
        Shell.refresh();
      }
    });
  }
  A_('asg-submit', el => submitModal(S.find('assignments', el.dataset.id)));

  function gradeModal(a) {
    const subs = db.submissions.filter(s => s.aid === a.id);
    UI.modal({
      title: `Submissions: ${a.title}`, size: 'lg',
      body: subs.length ? UI.table(['Student', 'Submitted', 'File', 'Marks', ''], subs.map(s => html`
        <tr><td>${UI.avatar(Dt.studentName(s.sid), 'sm')} ${Dt.studentName(s.sid)}${s.late ? UI.badge('Late', 'danger') : ''}</td><td>${U.fmtDate(s.date)}</td><td class="muted">${s.file}</td>
          <td>${s.marks === null ? UI.badge('Not graded', 'warning') : `${s.marks} / ${a.maxMarks}`}</td>
          <td class="right"><button class="btn btn-sm btn-soft" data-act="asg-grade-one" data-id="${s.id}" data-max="${a.maxMarks}">Grade</button></td></tr>`))
        : UI.empty({ icon: 'file-circle-question', title: 'No submissions yet' }),
      footer: html`<button class="btn btn-primary" data-act="close-modal">Close</button>`
    });
  }
  A_('asg-submissions', el => gradeModal(S.find('assignments', el.dataset.id)));
  A_('asg-grade-one', el => {
    const sub = S.find('submissions', el.dataset.id), max = Number(el.dataset.max), a = S.find('assignments', sub.aid);
    UI.form({
      title: `Grade ${Dt.studentName(sub.sid)}`, size: 'sm', submitLabel: 'Save grade',
      fields: [{ name: 'marks', label: `Marks (out of ${max})`, type: 'number', min: 0, max, required: true, value: sub.marks }, { name: 'feedback', label: 'Feedback', type: 'textarea', rows: 3, value: sub.feedback }],
      onSubmit(v) {
        S.update('submissions', sub.id, { marks: v.marks, feedback: v.feedback, status: 'Graded' });
        const su = Dt.userOf(sub.sid);
        Notify.push({ to: 'student', uid: su && su.id, text: `"${a.title}" graded: ${v.marks}/${max}.`, type: 'success', link: 'assignments' });
        UI.toast('Grade saved. The student has been notified (demo).'); gradeModal(a);
      }
    });
  });

  function asgCard(a) {
    const user = me();
    if (user.role === 'student') {
      const status = Dt.asgStatus(a, user.refId), sub = Dt.submission(a.id, user.refId), left = U.daysUntil(a.due);
      return html`<article class="card asg">
        <div class="ann-head">${UI.badge(a.code, 'neutral')}${UI.badge(status)}${sub && sub.status === 'Graded' ? UI.badge(`${sub.marks}/${a.maxMarks}`, 'success', 'star') : ''}</div>
        <h3>${a.title}</h3><p class="clamp">${a.description}</p>
        <ul class="meta-list"><li><i class="fa-regular fa-calendar"></i>Due ${U.fmtDate(a.due)}${status === 'Pending' ? html`, ${left === 0 ? 'today' : `in ${U.plural(left, 'day')}`}` : ''}</li><li><i class="fa-solid fa-star"></i>${a.maxMarks} marks</li></ul>
        ${sub && sub.feedback ? html`<div class="note"><strong>Feedback:</strong> ${sub.feedback}</div>` : ''}
        <footer class="event-foot"><span class="grow"></span>${status === 'Graded' ? html`<button class="btn btn-ghost" disabled>Graded</button>` : html`<button class="btn ${sub ? 'btn-soft' : 'btn-primary'}" data-act="asg-submit" data-id="${a.id}">${sub ? 'Update submission' : 'Submit'}</button>`}</footer>
      </article>`;
    }
    const subs = db.submissions.filter(s => s.aid === a.id), graded = subs.filter(s => s.status === 'Graded').length;
    const total = Dt.studentsOfDept(Dt.assignmentDept(a)).filter(s => s.status === 'Active').length;
    return html`<article class="card asg">
      <div class="ann-head">${UI.badge(a.code, 'neutral')}<span class="grow"></span><time>${U.fmtDate(a.due)}</time></div>
      <h3>${a.title}</h3><p class="clamp">${a.description}</p>
      <div class="seats"><div class="seats-head"><span>${subs.length} of ${total} submitted, ${graded} graded</span></div>${UI.progress(U.pctOf(subs.length, total || 1))}</div>
      <footer class="event-foot"><button class="btn btn-ghost" data-act="asg-edit" data-id="${a.id}"><i class="fa-solid fa-pen"></i> Edit</button><button class="btn btn-ghost-danger" data-act="asg-del" data-id="${a.id}"><i class="fa-solid fa-trash"></i></button><span class="grow"></span><button class="btn btn-primary" data-act="asg-submissions" data-id="${a.id}">Submissions</button></footer>
    </article>`;
  }

  function examTable(dept) {
    const exams = Dt.examsFor(dept);
    return UI.card('Examination schedule', exams.length ? UI.table(['Subject', 'Type', 'Date', 'Time', 'Venue'], exams.map(e => { const s = Dt.subject(e.code); return html`
      <tr><td><strong>${s.name}</strong><small class="block">${e.code}</small></td><td>${UI.badge(e.type, e.type.includes('Practical') ? 'purple' : 'danger')}</td><td>${U.fmtDate(e.date)}</td><td>${U.fmtTime(e.start)} to ${U.fmtTime(e.end)}</td><td>${e.room}</td></tr>`; }))
      : UI.empty({ icon: 'calendar-xmark', title: 'No examinations scheduled yet' }), { icon: 'file-signature', flush: true });
  }

  P.assignments = {
    title: 'Assignments and exams',
    render() {
      const user = me();
      let dept = user.role === 'student' ? Dt.student(user.refId).dept : user.role === 'faculty' ? ((Dt.subjectsTaughtBy(user.refId)[0] || {}).dept || 'CSE') : (V.asgDept || 'CSE');
      V.asgDept = dept;
      const subs = user.role === 'faculty' ? Dt.subjectsTaughtBy(user.refId) : Dt.subjectsOf(dept);
      const list = user.role === 'faculty' ? db.assignments.filter(a => subs.some(s => s.code === a.code)) : Dt.assignmentsFor(dept);
      V.asg = V.asg || UI.dataView({
        id: 'asg', initial: { status: 'all' },
        filters: [{ key: 'q', type: 'search', placeholder: 'Search assignments' }, { key: 'status', type: 'select', label: 'Status', options: user.role === 'student' ? [['all', 'All status'], ['Pending', 'Pending'], ['Submitted', 'Submitted'], ['Graded', 'Graded'], ['Overdue', 'Overdue']] : [['all', 'All subjects']] }],
        getRows: st => {
          const curList = user.role === 'faculty' ? db.assignments.filter(a => Dt.subjectsTaughtBy(me().refId).some(s => s.code === a.code)) : Dt.assignmentsFor(V.asgDept);
          return curList.filter(a => U.matches(st.q, a.title, a.code) && (st.status === 'all' || (user.role === 'student' ? Dt.asgStatus(a, user.refId) === st.status : true))).sort((a, b) => a.due.localeCompare(b.due));
        },
        renderRows: rows => html`<div class="grid cards-3">${rows.map(asgCard)}</div>`,
        empty: { icon: 'file-circle-question', title: 'No assignments found', text: 'Try a different filter.' }
      });
      const actions = user.role === 'admin' ? html`<select class="select" data-change="asg-dept" aria-label="Department">${UI.options(Object.keys(DEPTS).map(k => [k, DEPTS[k]]), dept)}</select>`
        : user.role === 'faculty' && subs.length ? html`<button class="btn btn-primary" data-act="asg-new" data-dept="${dept}"><i class="fa-solid fa-plus"></i> New assignment</button>` : '';
      const tabs = UI.tabs('assignments', [{ id: 'asg', label: 'Assignments', icon: 'file-lines' }, { id: 'exam', label: 'Examinations', icon: 'file-signature' }]);
      return html`<div class="page">${UI.pageHead('Assignments and examinations', user.role === 'student' ? 'Track homework, submissions and grades.' : 'Publish assignments and review student submissions.', actions)}
        ${tabs}${UI.panel('assignments', 'asg', V.asg.html())}${UI.panel('assignments', 'exam', examTable(dept))}</div>`;
    },
    mount(root) { V.asg.mount(root); }
  };
  A_('asg-dept', el => { V.asgDept = el.value; Shell.refresh(); });

  /* -----------------------------------------------------------------------
     COMPLAINTS AND SERVICE REQUESTS (help desk)
     ----------------------------------------------------------------------- */
  const CMP_CATS = ['Hostel', 'Mess and Canteen', 'IT and Wi-Fi', 'Infrastructure', 'Transport', 'Documents', 'Accounts and Fees', 'Other'];
  const ASSIGNEES = ['Unassigned', 'IT Services', 'Maintenance Cell', 'Hostel Warden', 'Academic Section', 'Accounts Office', 'Transport Office', 'Mess Committee'];

  function ticketForm() {
    UI.form({
      title: 'New complaint or service request', size: 'lg', submitLabel: 'Submit ticket',
      fields: [
        { name: 'kind', label: 'Type', type: 'segmented', options: ['Complaint', 'Service Request'], value: 'Complaint', required: true },
        { name: 'category', label: 'Category', type: 'select', options: CMP_CATS, value: 'Hostel' },
        { name: 'priority', label: 'Priority', type: 'select', options: ['Low', 'Medium', 'High'], value: 'Medium' },
        { name: 'subject', label: 'Subject', required: true, span: 2, value: '' },
        { name: 'description', label: 'Description', type: 'textarea', rows: 4, required: true, span: 2 }
      ],
      onSubmit(v) {
        const user = me();
        const t = S.add('complaints', { id: S.nextId('CMP'), sid: user.refId, kind: v.kind, category: v.category, priority: v.priority, status: 'Open', subject: v.subject, description: v.description, date: U.iso(), updatedOn: U.iso(), assignee: 'Unassigned', remarks: [{ by: 'System', text: 'Ticket created.', date: U.iso() }] });
        Notify.push({ to: 'admin', text: `New ${v.kind.toLowerCase()}: ${v.subject}`, type: 'warning', link: 'complaints' });
        S.log(`${user.name} raised a ${v.kind.toLowerCase()}: ${v.subject}`, 'ticket');
        UI.toast(`Ticket ${t.id} submitted. Track it under My tickets.`); Shell.refresh();
      }
    });
  }
  A_('cmp-new', ticketForm);

  function ticketDetail(id) {
    const t = S.find('complaints', id); if (!t) return;
    const user = me(), canManage = user.role === 'admin';
    UI.modal({
      title: `${t.id} — ${t.subject}`, size: 'lg',
      body: html`<div class="ann-head mb">${UI.badge(t.kind)}${UI.badge(t.category, 'neutral')}${UI.badge(t.priority)}${UI.badge(t.status)}</div>
        <p>${t.description}</p>
        <dl class="details mb"><dt>Raised by</dt><dd>${Dt.studentName(t.sid)}</dd><dt>Assigned to</dt><dd>${t.assignee}</dd><dt>Raised on</dt><dd>${U.fmtDate(t.date)}</dd></dl>
        <h4 class="mb-sm">Activity</h4>
        <ul class="timeline">${t.remarks.map(r => html`<li><strong>${r.by}</strong><span>${r.text}</span><time>${U.fmtDate(r.date)}</time></li>`)}</ul>
        ${canManage ? html`
          <div class="form-grid mt">
            <div class="field"><label class="label" for="tkStatus">Update status</label><select class="select" id="tkStatus">${UI.options(['Open', 'In Progress', 'Resolved', 'Rejected'], t.status)}</select></div>
            <div class="field"><label class="label" for="tkAssignee">Assign to</label><select class="select" id="tkAssignee">${UI.options(ASSIGNEES, t.assignee)}</select></div>
            <div class="field span-2"><label class="label" for="tkNote">Add a remark</label><textarea class="textarea" id="tkNote" rows="2" placeholder="Explain what was done or what happens next"></textarea></div>
          </div>` : ''}`,
      footer: canManage ? html`<button class="btn btn-ghost" data-act="close-modal">Close</button><button class="btn btn-primary" id="tkSave">Save update</button>` : html`<button class="btn btn-primary" data-act="close-modal">Close</button>`
    });
    if (canManage) document.getElementById('tkSave').addEventListener('click', () => {
      const status = document.getElementById('tkStatus').value, assignee = document.getElementById('tkAssignee').value, note = document.getElementById('tkNote').value.trim();
      const changed = status !== t.status || assignee !== t.assignee;
      if (note) t.remarks.push({ by: user.name, text: note, date: U.iso() });
      else if (changed) t.remarks.push({ by: user.name, text: `Status updated to ${status}${assignee !== t.assignee ? `, assigned to ${assignee}` : ''}.`, date: U.iso() });
      t.status = status; t.assignee = assignee; t.updatedOn = U.iso(); S.save();
      if (changed) {
        const su = Dt.userOf(t.sid);
        Notify.push({ to: 'student', uid: su && su.id, text: `Ticket ${t.id} is now ${status}.`, type: status === 'Resolved' ? 'success' : status === 'Rejected' ? 'danger' : 'info', link: 'helpdesk' });
      }
      UI.toast('Ticket updated.'); UI.closeModal(); Shell.refresh();
    });
  }
  A_('cmp-open', el => ticketDetail(el.dataset.id));

  function ticketRow(t, showStudent) {
    return html`<tr class="row-click" data-act="cmp-open" data-id="${t.id}">
      <td><strong>${t.id}</strong></td>${showStudent ? html`<td>${Dt.studentName(t.sid)}</td>` : ''}
      <td>${t.subject}<small class="block">${t.category}</small></td><td>${UI.badge(t.kind)}</td><td>${UI.badge(t.priority)}</td><td>${UI.badge(t.status)}</td><td>${U.fmtDate(t.date)}</td></tr>`;
  }

  P.complaints = {
    title: 'Complaints and service requests',
    render() {
      V.cmpAll = V.cmpAll || UI.dataView({
        id: 'cmpAll', initial: { status: 'all' },
        filters: [{ key: 'q', type: 'search', placeholder: 'Search tickets or students' }, { key: 'status', type: 'select', label: 'Status', options: [['all', 'All status'], ['Open', 'Open'], ['In Progress', 'In Progress'], ['Resolved', 'Resolved'], ['Rejected', 'Rejected']] }, { key: 'priority', type: 'select', label: 'Priority', options: [['all', 'Any priority'], ['High', 'High'], ['Medium', 'Medium'], ['Low', 'Low']] }],
        getRows: st => db.complaints.filter(t => (st.status === 'all' || t.status === st.status) && (st.priority === 'all' || t.priority === st.priority) && U.matches(st.q, t.subject, t.category, Dt.studentName(t.sid))).sort((a, b) => b.date.localeCompare(a.date)),
        renderRows: rows => UI.card('', UI.table(['Ticket', 'Student', 'Subject', 'Type', 'Priority', 'Status', 'Date'], rows.map(t => ticketRow(t, true))), { flush: true }),
        empty: { icon: 'ticket', title: 'No tickets match your filters' }
      });
      const open = Dt.openTickets(), high = open.filter(t => t.priority === 'High');
      const stats = html`<div class="grid stats">${UI.stat({ icon: 'ticket', label: 'Open tickets', value: open.length, tone: 'blue' })}${UI.stat({ icon: 'bolt', label: 'High priority open', value: high.length, tone: high.length ? 'red' : 'teal' })}${UI.stat({ icon: 'circle-check', label: 'Resolved this term', value: db.complaints.filter(c => c.status === 'Resolved').length, tone: 'green' })}</div>`;
      return html`<div class="page">${UI.pageHead('Complaints and service requests', 'Track and update tickets raised by students.')}${stats}${V.cmpAll.html()}</div>`;
    },
    mount(root) { V.cmpAll.mount(root); }
  };

  P.helpdesk = {
    title: 'Help desk',
    render() {
      const user = me();
      V.cmpMine = V.cmpMine || UI.dataView({
        id: 'cmpMine', initial: { status: 'all' },
        filters: [{ key: 'q', type: 'search', placeholder: 'Search your tickets' }, { key: 'status', type: 'select', label: 'Status', options: [['all', 'All status'], ['Open', 'Open'], ['In Progress', 'In Progress'], ['Resolved', 'Resolved'], ['Rejected', 'Rejected']] }],
        getRows: st => db.complaints.filter(t => t.sid === user.refId && (st.status === 'all' || t.status === st.status) && U.matches(st.q, t.subject, t.category)).sort((a, b) => b.date.localeCompare(a.date)),
        renderRows: rows => UI.card('', UI.table(['Ticket', 'Subject', 'Type', 'Priority', 'Status', 'Date'], rows.map(t => ticketRow(t, false))), { flush: true }),
        empty: { icon: 'ticket', title: 'You have not raised any tickets', text: 'Use New ticket to report a problem or request a service.' }
      });
      return html`<div class="page">${UI.pageHead('Help desk', 'Report campus issues or request a service, and track progress.', html`<button class="btn btn-primary" data-act="cmp-new"><i class="fa-solid fa-plus"></i> New ticket</button>`)}${V.cmpMine.html()}</div>`;
    },
    mount(root) { V.cmpMine.mount(root); }
  };

  P.requests = {
    title: 'Student queries',
    render() {
      const user = me();
      V.qry = V.qry || UI.dataView({
        id: 'qry', initial: { status: 'all' },
        filters: [{ key: 'q', type: 'search', placeholder: 'Search queries' }, { key: 'status', type: 'select', label: 'Status', options: [['all', 'All'], ['Open', 'Open'], ['Answered', 'Answered']] }],
        getRows: st => db.queries.filter(q => q.fid === user.refId && (st.status === 'all' || q.status === st.status) && U.matches(st.q, q.subject, q.message, Dt.studentName(q.sid))).sort((a, b) => b.date.localeCompare(a.date)),
        renderRows: rows => html`<div class="stack">${rows.map(q => html`<article class="card">
          <div class="ann-head">${UI.badge(q.code, 'neutral')}${UI.badge(q.status)}<span class="grow"></span><time>${U.fmtDate(q.date)}</time></div>
          <h3>${q.subject}</h3><p><strong>${Dt.studentName(q.sid)}:</strong> ${q.message}</p>
          ${q.reply ? html`<div class="note"><strong>Your reply:</strong> ${q.reply}</div>` : html`<button class="btn btn-primary" data-act="qry-reply" data-id="${q.id}">Reply</button>`}</article>`)}</div>`,
        empty: { icon: 'comments', title: 'No student queries', text: 'Questions students ask about your subjects will appear here.' }
      });
      return html`<div class="page">${UI.pageHead('Student queries and requests', 'Questions students have asked about your subjects.')}${V.qry.html()}</div>`;
    },
    mount(root) { V.qry.mount(root); }
  };
  A_('qry-reply', el => {
    const q = S.find('queries', el.dataset.id);
    UI.form({
      title: `Reply to ${Dt.studentName(q.sid)}`, submitLabel: 'Send reply',
      fields: [{ name: 'reply', label: 'Your reply', type: 'textarea', rows: 4, required: true, span: 2 }],
      onSubmit(v) {
        S.update('queries', q.id, { reply: v.reply, status: 'Answered', repliedOn: U.iso() });
        const su = Dt.userOf(q.sid);
        Notify.push({ to: 'student', uid: su && su.id, text: `${me().name} replied to your question: ${q.subject}`, type: 'success', link: 'requests' });
        UI.toast('Reply sent. The student has been notified (demo).'); Shell.refresh();
      }
    });
  });

  /* -----------------------------------------------------------------------
     ADMIN: STUDENT AND FACULTY DIRECTORIES
     ----------------------------------------------------------------------- */
  function studentForm(s) {
    UI.form({
      title: s ? 'Edit student' : 'Add student', size: 'lg', submitLabel: s ? 'Save changes' : 'Add student',
      fields: [
        { name: 'name', label: 'Full name', required: true, span: 2, value: s && s.name },
        { name: 'dept', label: 'Department', type: 'select', options: Object.keys(DEPTS).map(k => [k, DEPTS[k]]), value: s ? s.dept : 'CSE' },
        { name: 'section', label: 'Section', value: s ? s.section : 'A' },
        { name: 'cgpa', label: 'CGPA', type: 'number', min: 0, max: 10, step: 0.01, required: true, value: s ? s.cgpa : 7.5 },
        { name: 'status', label: 'Status', type: 'select', options: ['Active', 'Inactive'], value: s ? s.status : 'Active' },
        { name: 'email', label: 'Email', type: 'email', required: true, value: s && s.email },
        { name: 'phone', label: 'Phone', type: 'tel', required: true, value: s && s.phone },
        { name: 'guardian', label: 'Guardian name', value: s && s.guardian },
        { name: 'address', label: 'Address', span: 2, value: s && s.address }
      ],
      onSubmit(v) {
        if (s) { S.update('students', s.id, v); UI.toast('Student record updated.'); }
        else {
          const count = db.students.filter(x => x.dept === v.dept).length + 1;
          const id = `24${v.dept}${String(count).padStart(3, '0')}`;
          const rec = Object.assign({ id, year: 3, sem: 5, batch: '2024-2028', bio: '' }, v);
          S.add('students', rec);
          S.add('users', { id: 'U-' + id, role: 'student', name: v.name, email: v.email, password: 'student123', refId: id });
          S.log(`New student added: ${v.name} (${id})`, 'user-plus'); UI.toast(`Student added with roll number ${id}. Default password: student123.`);
        }
        Shell.refresh();
      }
    });
  }
  A_('stu-new', () => studentForm(null));
  A_('stu-edit', el => studentForm(Dt.student(el.dataset.id)));
  A_('stu-del', el => {
    const s = Dt.student(el.dataset.id);
    UI.confirm({ title: 'Remove student?', danger: true, confirmLabel: 'Remove', text: `${s.name}'s record and login will be removed.`, onConfirm: () => { db.users = db.users.filter(u => u.refId !== s.id); S.remove('students', s.id); UI.toast('Student record removed.'); Shell.refresh(); } });
  });
  A_('stu-view', el => {
    const s = Dt.student(el.dataset.id);
    UI.modal({
      title: s.name, size: 'md',
      body: html`<div class="profile-hero sm">${UI.avatar(s.name, 'lg')}<h3>${s.name}</h3><p>${Dt.dept(s.dept)}, Section ${s.section}</p>${UI.badge(s.status)}</div>
        <dl class="details wide">${profileRows({ role: 'student' }, s).map(([k, v]) => html`<dt>${k}</dt><dd>${v}</dd>`)}</dl>`,
      footer: html`<button class="btn btn-ghost" data-act="close-modal">Close</button><button class="btn btn-primary" data-act="stu-edit" data-id="${s.id}">Edit</button>`
    });
  });

  P.students = {
    title: 'Students',
    render() {
      V.stu = V.stu || UI.dataView({
        id: 'stu', initial: { dept: 'all', status: 'all' },
        filters: [{ key: 'q', type: 'search', placeholder: 'Search by name or roll number' }, { key: 'dept', type: 'select', label: 'Department', options: [['all', 'All departments']].concat(Object.keys(DEPTS).map(k => [k, k])) }, { key: 'status', type: 'select', label: 'Status', options: [['all', 'Any status'], ['Active', 'Active'], ['Inactive', 'Inactive']] }],
        getRows: st => db.students.filter(s => (st.dept === 'all' || s.dept === st.dept) && (st.status === 'all' || s.status === st.status) && U.matches(st.q, s.name, s.id, s.email)).sort((a, b) => a.name.localeCompare(b.name)),
        renderRows: rows => UI.card('', UI.table(['Student', 'Roll number', 'Department', 'CGPA', 'Attendance', 'Status', ''], rows.map(s => html`
          <tr><td><div class="cell-user">${UI.avatar(s.name, 'sm')}<strong>${s.name}</strong></div></td><td>${s.id}</td><td>${s.dept}</td><td>${s.cgpa.toFixed(2)}</td>
            <td>${UI.badge(Dt.overall(s.id) + '%', Dt.attTone(Dt.overall(s.id)))}</td><td>${UI.badge(s.status)}</td>
            <td class="right nowrap"><button class="btn-icon" data-act="stu-view" data-id="${s.id}" aria-label="View"><i class="fa-solid fa-eye"></i></button><button class="btn-icon" data-act="stu-edit" data-id="${s.id}" aria-label="Edit"><i class="fa-solid fa-pen"></i></button><button class="btn-icon danger" data-act="stu-del" data-id="${s.id}" aria-label="Remove"><i class="fa-solid fa-trash"></i></button></td></tr>`)), { flush: true }),
        empty: { icon: 'user-graduate', title: 'No students match your search' }
      });
      const stats = html`<div class="grid stats">${UI.stat({ icon: 'user-graduate', label: 'Total students', value: db.students.length, tone: 'blue' })}${UI.stat({ icon: 'user-check', label: 'Active', value: db.students.filter(s => s.status === 'Active').length, tone: 'green' })}${UI.stat({ icon: 'chart-line', label: 'Average CGPA', value: U.avg(db.students.map(s => s.cgpa)).toFixed(2), tone: 'purple' })}</div>`;
      return html`<div class="page">${UI.pageHead('Student records', 'Manage the student directory.', html`<button class="btn btn-primary" data-act="stu-new"><i class="fa-solid fa-plus"></i> Add student</button>`)}${stats}${V.stu.html()}</div>`;
    },
    mount(root) { V.stu.mount(root); }
  };

  function facultyForm(f) {
    UI.form({
      title: f ? 'Edit faculty' : 'Add faculty', size: 'lg', submitLabel: f ? 'Save changes' : 'Add faculty',
      fields: [
        { name: 'name', label: 'Full name', required: true, span: 2, value: f && f.name },
        { name: 'dept', label: 'Department', type: 'select', options: Object.keys(DEPTS).map(k => [k, DEPTS[k]]), value: f ? f.dept : 'CSE' },
        { name: 'designation', label: 'Designation', type: 'select', options: ['Assistant Professor', 'Associate Professor', 'Professor'], value: f ? f.designation : 'Assistant Professor' },
        { name: 'qualification', label: 'Qualification', required: true, value: f && f.qualification },
        { name: 'experience', label: 'Experience (years)', type: 'number', min: 0, max: 45, required: true, value: f ? f.experience : 3 },
        { name: 'office', label: 'Office', required: true, value: f && f.office },
        { name: 'email', label: 'Email', type: 'email', required: true, value: f && f.email },
        { name: 'phone', label: 'Phone', type: 'tel', required: true, value: f && f.phone }
      ],
      onSubmit(v) {
        if (f) { S.update('faculty', f.id, v); UI.toast('Faculty record updated.'); }
        else {
          const id = 'F' + (100 + db.faculty.length + 1);
          S.add('faculty', Object.assign({ id, status: 'Active', bio: '' }, v));
          S.add('users', { id: 'U-' + id, role: 'faculty', name: v.name, email: v.email, password: 'faculty123', refId: id });
          S.log(`New faculty added: ${v.name}`, 'user-plus'); UI.toast('Faculty added. Default password: faculty123.');
        }
        Shell.refresh();
      }
    });
  }
  A_('fac-new', () => facultyForm(null));
  A_('fac-edit', el => facultyForm(Dt.faculty(el.dataset.id)));
  A_('fac-del', el => {
    const f = Dt.faculty(el.dataset.id);
    if (db.subjects.some(s => s.faculty === f.id)) { UI.toast("Reassign this faculty member's subjects before removing them.", 'error'); return; }
    UI.confirm({ title: 'Remove faculty?', danger: true, confirmLabel: 'Remove', text: `${f.name}'s record and login will be removed.`, onConfirm: () => { db.users = db.users.filter(u => u.refId !== f.id); S.remove('faculty', f.id); UI.toast('Faculty record removed.'); Shell.refresh(); } });
  });
  A_('fac-view', el => {
    const f = Dt.faculty(el.dataset.id);
    UI.modal({
      title: f.name, size: 'md',
      body: html`<div class="profile-hero sm">${UI.avatar(f.name, 'lg')}<h3>${f.name}</h3><p>${f.designation}, ${Dt.dept(f.dept)}</p></div><dl class="details wide">${profileRows({ role: 'faculty' }, f).map(([k, v]) => html`<dt>${k}</dt><dd>${v}</dd>`)}</dl>`,
      footer: html`<button class="btn btn-ghost" data-act="close-modal">Close</button><button class="btn btn-primary" data-act="fac-edit" data-id="${f.id}">Edit</button>`
    });
  });

  P.faculty = {
    title: 'Faculty',
    render() {
      V.fac = V.fac || UI.dataView({
        id: 'fac', initial: { dept: 'all' },
        filters: [{ key: 'q', type: 'search', placeholder: 'Search by name' }, { key: 'dept', type: 'select', label: 'Department', options: [['all', 'All departments']].concat(Object.keys(DEPTS).map(k => [k, k])) }],
        getRows: st => db.faculty.filter(f => (st.dept === 'all' || f.dept === st.dept) && U.matches(st.q, f.name, f.email)).sort((a, b) => a.name.localeCompare(b.name)),
        renderRows: rows => UI.card('', UI.table(['Faculty', 'Department', 'Designation', 'Subjects', ''], rows.map(f => html`
          <tr><td><div class="cell-user">${UI.avatar(f.name, 'sm')}<strong>${f.name}</strong></div></td><td>${f.dept}</td><td>${f.designation}</td><td>${Dt.subjectsTaughtBy(f.id).length}</td>
            <td class="right nowrap"><button class="btn-icon" data-act="fac-view" data-id="${f.id}" aria-label="View"><i class="fa-solid fa-eye"></i></button><button class="btn-icon" data-act="fac-edit" data-id="${f.id}" aria-label="Edit"><i class="fa-solid fa-pen"></i></button><button class="btn-icon danger" data-act="fac-del" data-id="${f.id}" aria-label="Remove"><i class="fa-solid fa-trash"></i></button></td></tr>`)), { flush: true }),
        empty: { icon: 'chalkboard-user', title: 'No faculty match your search' }
      });
      const stats = html`<div class="grid stats">${UI.stat({ icon: 'chalkboard-user', label: 'Total faculty', value: db.faculty.length, tone: 'blue' })}${UI.stat({ icon: 'book', label: 'Subjects offered', value: db.subjects.length, tone: 'purple' })}</div>`;
      return html`<div class="page">${UI.pageHead('Faculty records', 'Manage the faculty directory.', html`<button class="btn btn-primary" data-act="fac-new"><i class="fa-solid fa-plus"></i> Add faculty</button>`)}${stats}${V.fac.html()}</div>`;
    },
    mount(root) { V.fac.mount(root); }
  };

  /* -----------------------------------------------------------------------
     ADMIN: REPORTS
     ----------------------------------------------------------------------- */
  const EV_CATS2 = ['Technical', 'Workshop', 'Sports', 'Cultural', 'Placement', 'Social'];
  P.reports = {
    title: 'Reports',
    render() {
      const byDept = Object.keys(DEPTS).map((k, i) => ({ label: k, value: db.students.filter(s => s.dept === k).length, color: PALETTE[i] }));
      const cgpaByDept = Object.keys(DEPTS).map(k => ({ label: k, value: Number(U.avg(db.students.filter(s => s.dept === k).map(s => s.cgpa)).toFixed(2)) }));
      const attByDept = Object.keys(DEPTS).map(k => ({ label: k, value: Dt.deptAttendance(k) }));
      const ticketsByCat = CMP_CATS.map(c => ({ label: c, value: db.complaints.filter(t => t.category === c).length })).filter(x => x.value);
      const ticketsByStatus = ['Open', 'In Progress', 'Resolved', 'Rejected'].map(s => ({ label: s, value: db.complaints.filter(t => t.status === s).length, color: { Open: '#e08a00', 'In Progress': '#3557f2', Resolved: '#12a26a', Rejected: '#e5484d' }[s] }));
      const eventsByCat = EV_CATS2.map(c => ({ label: c, value: db.events.filter(e => e.category === c).length })).filter(x => x.value);
      const trend = [-4, -3, -2, -1, 0].map(w => Math.round(64 + Math.sin(w) * 6 + w * 2));
      return html`<div class="page">${UI.pageHead('Reports and analytics', 'Institute-wide statistics drawn from the current demo data.',
        html`<button class="btn btn-soft" data-act="rep-export"><i class="fa-solid fa-download"></i> Export summary CSV</button>`)}
        <div class="grid two">${UI.card('Students by department', Ch.donut(byDept.map(d => ({ label: DEPTS[d.label], value: d.value, color: d.color }))), { icon: 'chart-pie' })}${UI.card('Average CGPA by department', Ch.bar(cgpaByDept), { icon: 'chart-simple' })}</div>
        <div class="grid two">${UI.card('Attendance by department', Ch.hbar(attByDept, { unit: '%' }), { icon: 'chart-bar' })}${UI.card('Attendance trend (5 weeks)', Ch.line(['W-4', 'W-3', 'W-2', 'W-1', 'This week'], trend, { unit: '%' }), { icon: 'chart-line' })}</div>
        <div class="grid two">${UI.card('Tickets by status', Ch.donut(ticketsByStatus, { centerLabel: 'Tickets' }), { icon: 'ticket' })}${UI.card('Tickets by category', Ch.hbar(ticketsByCat), { icon: 'list-check' })}</div>
        ${UI.card('Events by category', Ch.bar(eventsByCat), { icon: 'calendar-days' })}</div>`;
    }
  };
  A_('rep-export', () => {
    const rows = Object.keys(DEPTS).map(k => [DEPTS[k], db.students.filter(s => s.dept === k).length, U.avg(db.students.filter(s => s.dept === k).map(s => s.cgpa)).toFixed(2), Dt.deptAttendance(k) + '%']);
    U.download('campus-report.csv', U.toCSV(['Department', 'Students', 'Average CGPA', 'Attendance'], rows));
    UI.toast('Report downloaded as a CSV file.');
  });

})(window);
