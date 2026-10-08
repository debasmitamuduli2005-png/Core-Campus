# SmartCampus Management Portal

A frontend-only Smart Campus Management Portal built with plain **HTML5, CSS3 and vanilla JavaScript** — no frameworks, no backend, no build step. All data is realistic sample data (Indian college names, departments, subjects) stored in the browser's `localStorage`, so every screen is fully interactive and safe to demo repeatedly.

## 1. Project structure

```
smart-campus/
├── index.html          Login and role selection
├── student.html         Student dashboard shell
├── faculty.html         Faculty dashboard shell
├── admin.html            Administration dashboard shell
├── css/
│   └── style.css        All styling (design tokens, layout, components, responsive rules)
├── js/
│   ├── app.js            Shared engine: demo data, storage, UI components, charts,
│   │                      the app shell (sidebar/topbar/routing), and every shared
│   │                      page (timetable, attendance, assignments, events, library,
│   │                      announcements, help desk, students/faculty directories, reports)
│   ├── auth.js            Login/session/logout and the demo "quick switch role" helper
│   ├── student.js         Student-only navigation menu and dashboard page
│   ├── faculty.js         Faculty-only navigation menu and dashboard page
│   └── admin.js           Admin-only navigation menu and dashboard page
└── assets/               Empty folder, kept for any images you add later
```

## 2. How to create the project and run it

1. Download/copy the `smart-campus` folder into your own workspace and open it in VS Code.
2. Install the **Live Server** extension (by Ritwick Dey) from the VS Code marketplace, if you don't already have it.
3. Right-click `index.html` in the file explorer and choose **"Open with Live Server"** (or click "Go Live" in the status bar).
4. Your browser opens the login page at an address like `http://127.0.0.1:5500/index.html`.

No `npm install`, no build tools, no server-side code — it is plain static HTML/CSS/JS.

> Opening `index.html` by double-clicking (a `file://` URL) mostly works too, but Live Server is recommended so relative paths and future additions behave exactly like a real deployment.

## 3. Demo login credentials

| Role  | Email | Password |
|---|---|---|
| Student | `student@campus.edu` | `student123` |
| Faculty | `faculty@campus.edu` | `faculty123` |
| Administration | `admin@campus.edu` | `admin123` |

The login page has a **"Demo login credentials"** panel with one-click **Use** buttons that fill these in for you. You can also jump between roles at any time from the profile menu's **"View as…"** quick switch, without logging out.

## 4. Demonstrating it at a hackathon

A suggested 5–7 minute walkthrough:

1. **Login page** — show the role tabs and the demo-credentials panel; sign in as a **Student**.
2. **Student dashboard** — point out the live stats (attendance %, pending assignments, next exam, open tickets), today's class list, and the attendance-by-subject mini chart.
3. **Timetable** — switch between Week/Day view, and mention the CSV export.
4. **Attendance** — show the ring chart and the "attend next N classes to reach 75%" guidance.
5. **Assignments & Exams** — submit an assignment (any file name works, it's a demo upload).
6. **Campus Events** — register for an event and show the seat counter update live.
7. **Help Desk** — raise a complaint/service request ticket.
8. **Switch to Faculty** (profile menu → "View as faculty") — mark today's attendance for a class with the toggle list, then grade a student's submission.
9. **Switch to Admin** — open **Complaints & Requests**, click a ticket, change its status, and show the student would be notified. Then open **Reports** to show the donut/bar/line charts built with pure CSS and inline SVG (no chart library).
10. Close by opening the profile menu and showing **"Reset demo data"** — explain that this restores the original sample data for the next demo run.

## 5. What is simulated (this is a frontend-only prototype)

Because there is no backend, database or server, the following are simulated entirely in the browser and clearly marked with a **"Demo"** tag in the UI wherever relevant:

- **Login/authentication** — checked against a fixed list of demo accounts kept in `localStorage`, not a real identity provider.
- **File uploads** (assignment submissions, profile pictures) — only the file name is recorded; nothing is actually uploaded anywhere.
- **Email / SMS notifications** — represented only as in-app notifications (bell icon) and toast messages; no real messages are sent.
- **Attendance marking, grading, ticket updates, event registration, library issue/return** — all update the local demo database instantly, so the UI feels real, but nothing leaves your browser.
- **Reports and analytics** — computed live from the current demo data using plain CSS/SVG charts (no chart library, no server-side aggregation).
- **"Reset demo data"** (profile menu) — clears `localStorage` and reseeds the original sample dataset, so you can run the demo again from a clean state.

Everything else — navigation, search, filters, sorting, forms with validation, modals, role-based dashboards, and the responsive/collapsible layout — is fully working, real frontend functionality; only the *persistence layer* and *external communication* are simulated, as required for a frontend-only submission.

## 6. Gate pass, hostel leave and canteen (js/services.js)

| Module | Student | Administration |
|---|---|---|
| **Gate Pass** | Apply with purpose, destination and times; see a digital pass with barcode once approved; cancel while pending | Approve or reject (with reason), mark checked out and returned at the gate |
| **Hostel Leave** | Apply with leave type, room, dates, reason and guardian phone; track status; cancel while pending | Approve or reject (with reason), mark returned to hostel |
| **Canteen** | Browse the menu, order ahead and get a token, view order history and spend, cancel while preparing | Move orders Preparing, Ready, Collected; mark items sold out; add menu items; sales-by-item chart |

Status changes send in-app notifications to the student. Data lives in `localStorage` like everything else, and *Reset demo data* reseeds it. Existing browser data is upgraded automatically, so nothing needs clearing.

## 7. Hostel get pass (js/hostelpass.js)

An out-pass workflow for hostellers, separate from the college gate pass and overnight hostel leave.

- **Student:** apply with purpose, destination, date, out time, return-by time, hostel block and room (remembered for next time). A parent/guardian confirmation is required. Return times after the 9:00 PM curfew are flagged *After curfew* for the warden. Only one active pass per date. Once approved, the student sees a digital pass with a code and barcode, and can cancel before leaving.
- **Administration / warden / security:** approve or reject (reason required), then use the **Gate desk** tab to look a pass up by code and mark the student **Out** (only valid on the pass date) and **Returned**. Students still out past their return time show as **Overdue**, and late check-ins are marked *Returned late*. **Export log** downloads a CSV.
- Status changes send in-app notifications. *Reset demo data* reseeds the samples.

## 8. Faculty module: gate pass and hostel leave review

Faculty (demo login: `faculty@campus.edu`, shown as **Prof. Rajeswari Chhualsingh**) now have **Gate Pass** and **Hostel Leave** in the sidebar under *Student services*.

- **Access:** see every student's gate pass and leave request, filter by status and by verification, and search by student or ID.
- **Verify:** open a request and click **Verify student**. The record then shows who verified it and when, and the student is notified.
- **Gate pass verification:** enter a student's pass code (for example `GP-1A2B3C`) to check it is approved and valid for today.
- **Approve / Reject / Cancel:** Approve, Reject (reason required) or Cancel (reason required) a request. Approved passes can be marked checked out and returned.
- The faculty dashboard shows how many gate passes and leave requests are waiting for review.

The demo student account is **Dinakrushna Mohanta** (`student@campus.edu`).
