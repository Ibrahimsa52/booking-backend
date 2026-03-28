// ── Auth Guard ────────────────────────────────────────────────────────────────
const token = localStorage.getItem('dash_token');
const currentUser = JSON.parse(localStorage.getItem('dash_user') || 'null');

if (!token) {
    window.location.replace('/dashboard/login.html');
}

// Inject auth header into every fetch
const apiFetch = (url, opts = {}) => fetch(url, {
    ...opts,
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, ...(opts.headers || {}) }
});

// ── App ────────────────────────────────────────────────────────────────────────
const app = {
    state: {
        stats: {},
        pendingBookings: [],
        generalWaitlist: [],
        groups: [],
        grades: [],
        students: [],
        dashUsers: [],
    },

    init() {
        // Show welcome name
        if (currentUser) {
            const el = document.getElementById('welcome-name');
            if (el) el.textContent = currentUser.username;
        }

        // Super Admin section
        if (currentUser && currentUser.role === 'super_admin') {
            const section = document.getElementById('super-admin-section');
            if (section) section.style.display = 'block';
        }

        this.bindNav();
        this.initTheme();
        this.setupLogout();
        this.fetchAllData();
    },

    // Navigation
    bindNav() {
        document.querySelectorAll('.nav-item[data-page]').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const pageId = link.getAttribute('data-page');
                this.switchPage(pageId);
            });
        });
    },

    switchPage(pageId) {
        document.querySelectorAll('.page-section').forEach(sec => sec.classList.remove('active'));
        document.getElementById(`page-${pageId}`).classList.add('active');
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        const link = document.querySelector(`.nav-item[data-page="${pageId}"]`);
        if (link) link.classList.add('active');

        if (pageId === 'settings' && currentUser?.role === 'super_admin') this.fetchDashUsers();
        if (pageId === 'students') this.fetchStudentsPage();
        if (pageId === 'waitlist') this.fetchWaitlist();
    },

    // Theme
    initTheme() {
        const toggle = document.getElementById('theme-toggle');
        if (!toggle) return;
        const saved = localStorage.getItem('theme');
        const isDark = saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);
        document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
        toggle.checked = isDark;
        toggle.addEventListener('change', (e) => {
            const dark = e.target.checked;
            document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
            localStorage.setItem('theme', dark ? 'dark' : 'light');
        });
    },

    // Logout
    setupLogout() {
        document.getElementById('logout-btn')?.addEventListener('click', (e) => {
            e.preventDefault();
            if (confirm('هل تريد تسجيل الخروج؟')) {
                localStorage.removeItem('dash_token');
                localStorage.removeItem('dash_user');
                window.location.replace('/dashboard/login.html');
            }
        });
    },

    // Modals
    openModal(id) { document.getElementById(id)?.classList.add('open'); },
    closeModal(id) { document.getElementById(id)?.classList.remove('open'); },

    // ── Fetch All Data ────────────────────────────────────────────────────────
    async fetchAllData() {
        await Promise.all([
            this.fetchStats(),
            this.fetchPendingBookings(),
            this.fetchGroupsForCalendar(),
            this.fetchWaitlist(),
            this.fetchGrades(),
        ]);
    },

    async fetchStats() {
        try {
            const data = await apiFetch('/api/stats').then(r => r.json());
            this.state.stats = data;
            this.renderStats();
        } catch (e) { console.error(e); }
    },

    renderStats() {
        const c = document.getElementById('stats-container');
        const s = this.state.stats;
        c.innerHTML = `
            <div class="card stat-card">
                <i class="ph ph-users stat-icon"></i>
                <div class="stat-label">إجمالي الطلاب</div>
                <div class="stat-value">${s.total_students ?? '-'}</div>
            </div>
            <div class="card stat-card">
                <i class="ph ph-hourglass-high stat-icon"></i>
                <div class="stat-label">طلبات معلقة</div>
                <div class="stat-value">${s.pending_requests ?? '-'}</div>
            </div>
            <div class="card stat-card">
                <i class="ph ph-chair stat-icon"></i>
                <div class="stat-label">مقاعد متاحة</div>
                <div class="stat-value">${s.available_seats ?? '-'}</div>
            </div>
            <div class="card stat-card">
                <i class="ph ph-clock stat-icon"></i>
                <div class="stat-label">قائمة الانتظار</div>
                <div class="stat-value">${s.waitlist_count ?? '-'}</div>
            </div>
        `;
    },

    // ── Bookings ──────────────────────────────────────────────────────────────
    async fetchPendingBookings() {
        try {
            const data = await apiFetch('/bookings/pending').then(r => r.json());
            this.state.pendingBookings = data;
            this.renderPendingBookings();
        } catch (e) { console.error(e); }
    },

    async refreshBookings() { await this.fetchPendingBookings(); },

    renderPendingBookings() {
        const tbodyMain = document.getElementById('bookings-tbody');
        const tbodyRecent = document.getElementById('recent-pending-tbody');
        const bookings = this.state.pendingBookings;

        if (!bookings.length) {
            tbodyMain.innerHTML = `<tr><td colspan="7" class="text-center text-muted">لا يوجد طلبات معلقة.</td></tr>`;
            tbodyRecent.innerHTML = `<tr><td colspan="5" class="text-center text-muted">لا يوجد طلبات معلقة.</td></tr>`;
            return;
        }

        tbodyMain.innerHTML = bookings.map(b => `
            <tr>
                <td><strong>${b.full_name}</strong></td>
                <td dir="ltr">${b.phone_number || '-'}</td>
                <td dir="ltr">${b.parent_phone || '-'}</td>
                <td><span class="badge badge-warning">${b.grade_name}</span></td>
                <td>${b.group_name} (${b.day_of_week})</td>
                <td dir="ltr">${new Date(b.booked_at).toLocaleString('ar-EG')}</td>
                <td class="text-left" style="white-space:nowrap;">
                    <button class="btn-sm btn-success" onclick="app.actionBooking('${b.id}','approved')"><i class="ph ph-check"></i> قبول</button>
                    <button class="btn-sm btn-danger" onclick="app.actionBooking('${b.id}','rejected')"><i class="ph ph-x"></i> رفض</button>
                </td>
            </tr>`).join('');

        tbodyRecent.innerHTML = bookings.slice(0, 5).map(b => `
            <tr>
                <td><strong>${b.full_name}</strong></td>
                <td>${b.grade_name}</td>
                <td>${b.group_name}</td>
                <td dir="ltr">${new Date(b.booked_at).toLocaleDateString('ar-EG')}</td>
                <td class="text-left">
                    <button class="btn-sm btn-success" onclick="app.actionBooking('${b.id}','approved')">قبول</button>
                </td>
            </tr>`).join('');
    },

    async actionBooking(id, status) {
        if (!confirm(`هل أنت متأكد من ${status === 'approved' ? 'الموافقة على' : 'رفض'} هذا الطلب؟`)) return;
        const res = await apiFetch(`/bookings/${id}/status`, {
            method: 'PATCH', body: JSON.stringify({ status })
        });
        const data = await res.json();
        if (!res.ok) return alert(data.error || 'خطأ في العملية');
        this.fetchAllData();
    },

    // ── Groups / Calendar ─────────────────────────────────────────────────────
    async fetchGrades() {
        try {
            const data = await apiFetch('/grades').then(r => r.json());
            this.state.grades = data;
            const sel = document.getElementById('ag-grade');
            if (sel) {
                sel.innerHTML = '<option value="">-- اختر الصف --</option>' +
                    data.map(g => `<option value="${g.id}">${g.name}</option>`).join('');
            }
        } catch (e) { console.error(e); }
    },

    async fetchGroupsForCalendar() {
        try {
            const data = await apiFetch('/groups').then(r => r.json());
            this.state.groups = data;
            this.renderCalendar();
        } catch (e) { console.error(e); }
    },

    renderCalendar() {
        const grid = document.getElementById('calendar-grid');
        if (!grid) return;
        const daysMap = { Saturday: 0, Sunday: 1, Monday: 2, Tuesday: 3, Wednesday: 4, Thursday: 5, Friday: 6 };
        const cols = Array.from({ length: 7 }, () => []);
        this.state.groups.forEach(g => {
            const idx = daysMap[g.day_of_week];
            if (idx !== undefined) cols[idx].push(g);
        });

        grid.innerHTML = cols.map(dayGroups => {
            const sorted = [...dayGroups].sort((a, b) => a.start_time.localeCompare(b.start_time));
            const slots = sorted.map(g => {
                const booked = g.max_students - (g.available_seats || 0);
                const isFull = (g.available_seats || 0) <= 0;
                return `<div class="slot-token ${isFull ? 'slot-full' : 'slot-available'}">
                    <div>
                        <div>${g.start_time.slice(0, 5)}</div>
                        <div class="group-name-tag">${g.name}</div>
                    </div>
                    <div style="display:flex;align-items:center;gap:2px;">
                        <span dir="ltr">${booked}/${g.max_students}</span>
                        <button class="slot-edit" onclick="app.openEditGroup(${JSON.stringify(JSON.stringify(g))})" title="تعديل"><i class="ph ph-pencil"></i></button>
                        <button class="slot-delete" onclick="app.deleteGroup('${g.id}')" title="حذف"><i class="ph ph-x"></i></button>
                    </div>
                </div>`;
            }).join('') || `<div class="text-muted text-center" style="font-size:12px;margin-top:20px;">لا يوجد</div>`;
            return `<div class="calendar-cell">${slots}</div>`;
        }).join('');
    },

    async addGroup() {
        const grade_id = document.getElementById('ag-grade').value;
        const name = document.getElementById('ag-name').value.trim();
        const day_of_week = document.getElementById('ag-day').value;
        const start_time = document.getElementById('ag-start').value;
        const end_time = document.getElementById('ag-end').value;
        const max_students = parseInt(document.getElementById('ag-max').value);
        const errEl = document.getElementById('ag-error');
        errEl.textContent = '';

        if (!grade_id || !name || !day_of_week || !start_time || !end_time || !max_students) {
            errEl.textContent = 'برجاء تعبئة جميع الحقول.';
            return;
        }
        const res = await apiFetch('/groups', {
            method: 'POST',
            body: JSON.stringify({ grade_id, name, day_of_week, start_time, end_time, max_students })
        });
        const data = await res.json();
        if (!res.ok) { errEl.textContent = data.error; return; }
        this.closeModal('add-group-modal');
        this.fetchGroupsForCalendar();
    },

    async deleteGroup(id) {
        if (!confirm('هل أنت متأكد من حذف هذه المجموعة؟')) return;
        const res = await apiFetch(`/groups/${id}`, { method: 'DELETE' });
        if (!res.ok) { alert('خطأ في الحذف.'); return; }
        this.fetchGroupsForCalendar();
        this.fetchStats();
    },

    openEditGroup(jsonStr) {
        const g = JSON.parse(jsonStr);
        document.getElementById('eg-id').value = g.id;
        document.getElementById('eg-name').value = g.name;
        document.getElementById('eg-day').value = g.day_of_week;
        document.getElementById('eg-start').value = g.start_time.slice(0, 5);
        document.getElementById('eg-end').value = g.end_time.slice(0, 5);
        document.getElementById('eg-max').value = g.max_students;
        document.getElementById('eg-error').textContent = '';
        this.openModal('edit-group-modal');
    },

    async saveEditGroup() {
        const id = document.getElementById('eg-id').value;
        const name = document.getElementById('eg-name').value.trim();
        const day_of_week = document.getElementById('eg-day').value;
        const start_time = document.getElementById('eg-start').value;
        const end_time = document.getElementById('eg-end').value;
        const max_students = parseInt(document.getElementById('eg-max').value);
        const errEl = document.getElementById('eg-error');
        errEl.textContent = '';

        if (!name || !day_of_week || !start_time || !end_time || !max_students) {
            errEl.textContent = 'برجاء تعبئة جميع الحقول.';
            return;
        }
        const res = await apiFetch(`/groups/${id}`, {
            method: 'PATCH',
            body: JSON.stringify({ name, day_of_week, start_time, end_time, max_students })
        });
        const data = await res.json();
        if (!res.ok) { errEl.textContent = data.error; return; }
        this.closeModal('edit-group-modal');
        this.fetchGroupsForCalendar();
    },

    // ── Students ──────────────────────────────────────────────────────────────
    async fetchStudentsPage() {
        try {
            const data = await apiFetch('/students').then(r => r.json());
            this.state.students = data;
            const tbody = document.getElementById('students-tbody');
            if (!data.length) {
                tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted">لا يوجد طلاب.</td></tr>`;
                return;
            }
            tbody.innerHTML = data.map(s => `
                <tr>
                    <td><strong>${s.full_name}</strong></td>
                    <td dir="ltr">${s.phone_number || '<span class="text-muted">—</span>'}</td>
                    <td dir="ltr">${s.parent_phone || '<span class="text-muted">—</span>'}</td>
                    <td dir="ltr">${new Date(s.created_at).toLocaleDateString('ar-EG')}</td>
                    <td class="text-left" style="white-space:nowrap;">
                        <button class="btn-sm btn-secondary" onclick="app.openRequestInfo('${s.id}')"><i class="ph ph-envelope"></i> طلب بيانات</button>
                        <button class="btn-sm btn-danger" onclick="app.deleteStudent('${s.id}')"><i class="ph ph-trash"></i></button>
                    </td>
                </tr>`).join('');
        } catch (e) { console.error(e); }
    },

    async refreshStudents() { await this.fetchStudentsPage(); },

    async deleteStudent(id) {
        if (!confirm('هل أنت متأكد من حذف هذا الطالب؟')) return;
        const res = await apiFetch(`/students/${id}`, { method: 'DELETE' });
        if (!res.ok) { alert('خطأ في الحذف.'); return; }
        this.fetchStudentsPage();
        this.fetchStats();
    },

    openRequestInfo(studentId) {
        document.getElementById('ri-student-id').value = studentId;
        document.getElementById('ri-msg').textContent = '';
        this.openModal('request-info-modal');
    },

    async sendRequestInfo() {
        const id = document.getElementById('ri-student-id').value;
        const field = document.getElementById('ri-field').value;
        const msgEl = document.getElementById('ri-msg');
        const res = await apiFetch(`/students/${id}/request-info`, {
            method: 'POST', body: JSON.stringify({ field })
        });
        const data = await res.json();
        if (!res.ok) { msgEl.style.color = 'var(--color-danger)'; msgEl.textContent = data.error; return; }
        msgEl.style.color = 'var(--color-success)';
        msgEl.textContent = '✅ تم إرسال الطلب بنجاح عبر تيليجرام.';
        setTimeout(() => this.closeModal('request-info-modal'), 1500);
    },

    // ── Waitlist ──────────────────────────────────────────────────────────────
    async fetchWaitlist() {
        try {
            const data = await apiFetch('/waitlist/general').then(r => r.json());
            const tb = document.getElementById('general-waitlist-tbody');
            if (!data.length) {
                tb.innerHTML = `<tr><td colspan="2" class="text-center text-muted">لا يوجد.</td></tr>`;
                return;
            }
            tb.innerHTML = data.map(w => `
                <tr>
                    <td><strong>${w.full_name}</strong></td>
                    <td dir="ltr">${new Date(w.created_at).toLocaleString('ar-EG')}</td>
                </tr>`).join('');
        } catch (e) { console.error(e); }
    },

    // ── Settings / Password ───────────────────────────────────────────────────
    async changePassword() {
        const current = document.getElementById('cp-current').value;
        const newPass = document.getElementById('cp-new').value;
        const msgEl = document.getElementById('cp-msg');
        if (!current || !newPass) { msgEl.style.color = 'var(--color-danger)'; msgEl.textContent = 'أدخل الحقلين.'; return; }
        const res = await apiFetch('/api/auth/change-password', {
            method: 'POST',
            body: JSON.stringify({ username: currentUser.username, current_password: current, new_password: newPass })
        });
        const data = await res.json();
        if (!res.ok) { msgEl.style.color = 'var(--color-danger)'; msgEl.textContent = data.error; return; }
        msgEl.style.color = 'var(--color-success)';
        msgEl.textContent = '✅ تم تغيير كلمة المرور بنجاح.';
        document.getElementById('cp-current').value = '';
        document.getElementById('cp-new').value = '';
    },

    // ── Super Admin — Users ───────────────────────────────────────────────────
    async fetchDashUsers() {
        try {
            const data = await apiFetch('/api/auth/users').then(r => r.json());
            this.state.dashUsers = data;
            const tbody = document.getElementById('users-tbody');
            tbody.innerHTML = data.map(u => `
                <tr>
                    <td><strong>${u.username}</strong> ${u.role === 'super_admin' ? '<span class="badge badge-warning">Super</span>' : ''}</td>
                    <td dir="ltr">${new Date(u.created_at).toLocaleDateString('ar-EG')}</td>
                    <td class="text-left">
                        <button class="btn-sm btn-secondary" onclick="app.openPermissions()"><i class="ph ph-lock-key"></i> صلاحيات</button>
                        <button class="btn-sm btn-danger" onclick="app.deleteUser('${u.id}','${u.username}')"><i class="ph ph-trash"></i></button>
                    </td>
                </tr>`).join('');
        } catch (e) { console.error(e); }
    },

    async addUser() {
        const username = document.getElementById('au-username').value.trim();
        const password = document.getElementById('au-password').value;
        const errEl = document.getElementById('au-error');
        errEl.textContent = '';
        if (!username || !password) { errEl.textContent = 'أدخل اسم المستخدم وكلمة المرور.'; return; }
        const res = await apiFetch('/api/auth/users', {
            method: 'POST', body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (!res.ok) { errEl.textContent = data.error; return; }
        this.closeModal('add-user-modal');
        document.getElementById('au-username').value = '';
        document.getElementById('au-password').value = '';
        this.fetchDashUsers();
    },

    async deleteUser(id, username) {
        if (username === 'ibrahim') { alert('لا يمكن حذف الحساب الرئيسي.'); return; }
        if (!confirm(`حذف المستخدم "${username}"؟`)) return;
        const res = await apiFetch(`/api/auth/users/${id}`, { method: 'DELETE' });
        if (!res.ok) { alert('خطأ في الحذف.'); return; }
        this.fetchDashUsers();
    },

    openPermissions() {
        alert('قريباً سيتم تفعيل نظام الصلاحيات المخصص.');
    }
};

window.addEventListener('DOMContentLoaded', () => app.init());
