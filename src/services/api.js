const axios = require('axios');

const BASE = process.env.API_BASE_URL;

// ── Students ──────────────────────────────────────────────────────────────────

async function getStudent(telegramId) {
    try {
        const { data } = await axios.get(`${BASE}/students/${telegramId}`);
        return data;
    } catch (err) {
        if (err.response?.status === 404) return null;
        throw err;
    }
}

async function upsertStudent({ telegramId, fullName, phoneNumber, isRegistered }) {
    const { data } = await axios.post(`${BASE}/students`, {
        telegram_user_id: telegramId,
        full_name: fullName,
        phone_number: phoneNumber || null,
        is_registered: isRegistered || false,
    });
    return data;
}

// ── Grades & Groups ───────────────────────────────────────────────────────────

async function getGrades() {
    const { data } = await axios.get(`${BASE}/grades`);
    return data;
}

async function getGroups(gradeId) {
    const { data } = await axios.get(`${BASE}/groups`, { params: { grade_id: gradeId } });
    return data;
}

// ── Bookings ──────────────────────────────────────────────────────────────────

async function getStudentBookings(studentId) {
    const { data } = await axios.get(`${BASE}/bookings`, { params: { student_id: studentId } });
    return data;
}

async function getPendingBookings() {
    const { data } = await axios.get(`${BASE}/bookings/pending`);
    return data;
}

async function createBooking({ studentId, groupId, parentPhone }) {
    const { data } = await axios.post(`${BASE}/bookings`, {
        student_id: studentId,
        group_id: groupId,
        parent_phone: parentPhone || null,
    });
    return data;
}

// Returns { booking, telegram_user_id, student_name, group_name }
async function updateBookingStatus(bookingId, status) {
    const { data } = await axios.patch(`${BASE}/bookings/${bookingId}/status`, { status });
    return data;
}

// Returns { notify_waitlist: { telegram_user_id, full_name } | null }
async function cancelBooking(bookingId, studentId) {
    const { data } = await axios.delete(`${BASE}/bookings/${bookingId}`, {
        data: { student_id: studentId },
    });
    return data;
}

// ── Waitlist ──────────────────────────────────────────────────────────────────

async function joinWaitlist({ studentId, groupId, preferredTimeText, type }) {
    const { data } = await axios.post(`${BASE}/waitlist`, {
        student_id: studentId,
        group_id: groupId || null,
        preferred_time_text: preferredTimeText || null,
        type,
    });
    return data;
}

module.exports = {
    getStudent,
    upsertStudent,
    getGrades,
    getGroups,
    getStudentBookings,
    getPendingBookings,
    createBooking,
    updateBookingStatus,
    cancelBooking,
    joinWaitlist,
};
