const bot = require('./bot');
const api = require('../services/api');

const TEACHER_NAME = process.env.TEACHER_NAME || 'المدرس';
const ADMIN_ID = Number(process.env.ADMIN_TELEGRAM_ID);

// ─── Session ──────────────────────────────────────────────────────────────────
const session = new Map();

const STEPS = {
    AWAIT_NAME: 'AWAIT_NAME',
    AWAIT_PHONE: 'AWAIT_PHONE',
    AWAIT_PARENT_PHONE: 'AWAIT_PARENT_PHONE',
    IDLE: 'IDLE',
};

// ─── Validation ───────────────────────────────────────────────────────────────

function isTripleName(text) {
    return text.trim().split(/\s+/).filter(Boolean).length >= 3;
}

function isValidEgyptianPhone(text) {
    return /^(010|011|012|015)\d{8}$/.test(text.trim());
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(t) { return t ? t.slice(0, 5) : ''; }

function statusLabel(status) {
    if (status === 'pending') return '⏳ طلبك قيد المراجعة';
    if (status === 'approved') return '✅ تم قبولك في المجموعة';
    if (status === 'rejected') return '❌ تم رفض طلبك';
    return status;
}

// showGroups:
// noTimeMode = false → show "لا يناسبني أي وقت" button at bottom
// noTimeMode = true  → show "🔔 أشعرني بأي وقت جديد" button at bottom
async function showGrades(chatId, messageId = null) {
    const grades = await api.getGrades();
    if (grades.length === 0) {
        const text = '❌ لا توجد مراحل دراسية متاحة حالياً.';
        return messageId
            ? bot.editMessageText(text, { chat_id: chatId, message_id: messageId })
            : bot.sendMessage(chatId, text);
    }
    const keyboard = grades.map(g => [{ text: `📚 ${g.name}`, callback_data: `grade:${g.id}` }]);
    const opts = { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } };
    const text = '📖 *اختار المرحلة الدراسية:*';
    return messageId
        ? bot.editMessageText(text, { chat_id: chatId, message_id: messageId, ...opts })
        : bot.sendMessage(chatId, text, opts);
}

async function showGroups(chatId, gradeId, messageId = null, noTimeMode = false) {
    const groups = await api.getGroups(gradeId);

    if (groups.length === 0) {
        const text = '❌ لا توجد مجموعات في هذه المرحلة.';
        return messageId
            ? bot.editMessageText(text, { chat_id: chatId, message_id: messageId })
            : bot.sendMessage(chatId, text);
    }

    const s = session.get(chatId) || {};
    session.set(chatId, { ...s, gradeId, groups, noTimeMode });

    const rows = groups.map(g => {
        const full = g.available_seats <= 0;
        const label = full
            ? `⛔ ${g.name} | ${g.day_of_week} ${formatTime(g.start_time)}–${formatTime(g.end_time)} (ممتلئة)`
            : `✅ ${g.name} | ${g.day_of_week} ${formatTime(g.start_time)}–${formatTime(g.end_time)} (${g.available_seats} مقاعد)`;
        return [{ text: label, callback_data: full ? `full:${g.id}` : `group:${g.id}` }];
    });

    if (noTimeMode) {
        // Show "notify me of any new slot" button
        rows.push([{ text: '🔔 أشعرني بأي وقت جديد', callback_data: 'general_interest' }]);
    } else {
        // Show "no suitable time" button
        rows.push([{ text: '🕐 لا يناسبني أي وقت', callback_data: 'no_suitable_time' }]);
    }
    rows.push([{ text: '↩️ رجوع للمراحل', callback_data: 'back_grades' }]);

    const opts = { parse_mode: 'Markdown', reply_markup: { inline_keyboard: rows } };
    const text = '👥 *اختار المجموعة:*';
    return messageId
        ? bot.editMessageText(text, { chat_id: chatId, message_id: messageId, ...opts })
        : bot.sendMessage(chatId, text, opts);
}

// ─── /start ───────────────────────────────────────────────────────────────────

bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;

    try {
        const student = await api.getStudent(telegramId);

        // ── EXISTING STUDENT ─────────────────────────────────────────────────────
        if (student && student.is_registered) {
            session.set(chatId, { step: STEPS.IDLE, studentId: student.id });
            const bookings = await api.getStudentBookings(student.id);
            const active = bookings[0] || null;

            // No active booking → show greeting and go straight to grade selection
            if (!active) {
                await bot.sendMessage(chatId, `👋 أهلاً *${student.full_name}*!\nاختار المرحلة الدراسية 👇`, { parse_mode: 'Markdown' });
                await showGrades(chatId);
                return;
            }

            // Has active booking → show status
            let text = `👤 *${student.full_name}*\n`;
            text += `📚 الصف: ${active.grade_name}\n`;
            text += `👥 المجموعة: ${active.group_name}\n`;
            text += `🗓 ${active.day_of_week} | ${formatTime(active.start_time)}–${formatTime(active.end_time)}\n`;
            text += `📋 الحالة: ${statusLabel(active.status)}`;

            const keyboard = [[{ text: '✏️ تعديل المجموعة', callback_data: `change_group:${active.id}` }]];
            await bot.sendMessage(chatId, text, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: keyboard },
            });
            return;
        }

        // ── NEW STUDENT ──────────────────────────────────────────────────────────
        session.set(chatId, { step: STEPS.AWAIT_NAME, telegramId });
        await bot.sendMessage(
            chatId,
            `اهلا بيك في البوت الرسمي لـ *${TEACHER_NAME}* 👋\n\nبرجاء ادخال *اسمك بالكامل (ثلاثي على الأقل):*`,
            { parse_mode: 'Markdown' }
        );
    } catch (err) {
        console.error('/start error:', err.message);
        bot.sendMessage(chatId, '❌ حصل خطأ. جرب تبعت /start تاني.');
    }
});

// ─── Text Input State Machine ─────────────────────────────────────────────────

bot.on('message', async (msg) => {
    if (!msg.text || msg.text.startsWith('/')) return;

    const chatId = msg.chat.id;
    const text = msg.text.trim();
    const s = session.get(chatId);
    if (!s || s.step === STEPS.IDLE) return;

    // ── Full Name ───────────────────────────────────────────────────────────────
    if (s.step === STEPS.AWAIT_NAME) {
        if (!isTripleName(text)) {
            await bot.sendMessage(chatId, '⚠️ برجاء إدخال *الاسم الثلاثي كامل* (ثلاث كلمات على الأقل):', { parse_mode: 'Markdown' });
            return;
        }
        session.set(chatId, { ...s, fullName: text, step: STEPS.AWAIT_PHONE });
        await bot.sendMessage(chatId, '📱 ادخل *رقم تليفونك*:', { parse_mode: 'Markdown' });
        return;
    }

    // ── Phone ───────────────────────────────────────────────────────────────────
    if (s.step === STEPS.AWAIT_PHONE) {
        if (!isValidEgyptianPhone(text)) {
            await bot.sendMessage(chatId, '⚠️ رقم الهاتف غير صالح.', { parse_mode: 'Markdown' });
            return;
        }
        session.set(chatId, { ...s, phone: text, step: STEPS.AWAIT_PARENT_PHONE });
        await bot.sendMessage(chatId, '👨‍👩‍👦 ادخل *رقم تليفون ولي الأمر*:', { parse_mode: 'Markdown' });
        return;
    }

    // ── Parent Phone → Register & Show Grades ───────────────────────────────────
    if (s.step === STEPS.AWAIT_PARENT_PHONE) {
        if (!isValidEgyptianPhone(text)) {
            await bot.sendMessage(chatId, '⚠️ رقم الهاتف غير صالح.', { parse_mode: 'Markdown' });
            return;
        }
        if (text === s.phone) {
            await bot.sendMessage(chatId, '⚠️ رقم ولي الأمر لازم يكون مختلف عن رقمك.');
            return;
        }
        session.set(chatId, { ...s, parentPhone: text, step: STEPS.IDLE });
        try {
            const student = await api.upsertStudent({
                telegramId: s.telegramId || msg.from.id,
                fullName: s.fullName,
                phoneNumber: s.phone,
                isRegistered: true,
            });
            session.set(chatId, { ...session.get(chatId), studentId: student.id });
            await bot.sendMessage(chatId, '✅ تم تسجيلك! اختار المرحلة الدراسية دلوقتي 👇');
            await showGrades(chatId);
        } catch (err) {
            console.error('registration error:', err.message);
            bot.sendMessage(chatId, '❌ حصل خطأ في التسجيل. جرب /start تاني.');
        }
        return;
    }
});

// ─── Callback Queries ─────────────────────────────────────────────────────────

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const msgId = query.message.message_id;
    const data = query.data;
    const s = session.get(chatId) || {};

    await bot.answerCallbackQuery(query.id).catch(() => { });

    // ── Grade selected ──────────────────────────────────────────────────────────
    if (data.startsWith('grade:')) {
        const gradeId = data.split(':')[1];
        session.set(chatId, { ...s, gradeId, noTimeMode: false });
        try {
            await showGroups(chatId, gradeId, msgId, false);
        } catch (err) {
            bot.sendMessage(chatId, '❌ تعذر تحميل المجموعات.');
        }
        return;
    }

    // ── Full group tapped → Direct waitlist registration ────────────────────────
    if (data.startsWith('full:')) {
        const groupId = data.split(':')[1];
        const group = (s.groups || []).find(g => g.id === groupId);
        if (!s.studentId) return bot.sendMessage(chatId, '⚠️ الجلسة انتهت. ابعت /start تاني.');
        try {
            await api.joinWaitlist({ studentId: s.studentId, groupId, type: 'waitlist' });
            const name = group?.name || 'هذه المجموعة';
            await bot.editMessageText(
                `⏳ *${name}* ممتلئة حالياً.\n\n✅ تم تسجيل أولويتك في قائمة الانتظار!\n_هيتبعتلك فور ما تتاح مكان._ 📩`,
                { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown' }
            );
        } catch (err) {
            const errMsg = err.response?.data?.error || '';
            if (errMsg.includes('already has an active')) {
                return bot.editMessageText('⚠️ انت مسجل في قائمة انتظار بالفعل. ابعت /start لمتابعة طلبك.', { chat_id: chatId, message_id: msgId });
            }
            bot.sendMessage(chatId, '❌ حصل خطأ. جرب تاني.');
        }
        return;
    }

    // ── Group selected → pending booking ───────────────────────────────────────
    if (data.startsWith('group:')) {
        const groupId = data.split(':')[1];
        const group = (s.groups || []).find(g => g.id === groupId);
        if (!s.studentId) return bot.sendMessage(chatId, '⚠️ الجلسة انتهت. ابعت /start تاني.');

        try {
            await api.createBooking({ studentId: s.studentId, groupId, parentPhone: s.parentPhone });
            const groupInfo = group
                ? `📚 *${group.name}* | ${group.day_of_week} ${formatTime(group.start_time)}–${formatTime(group.end_time)}`
                : '📚 المجموعة المختارة';

            bot.editMessageText(
                `${groupInfo}\n\n✅ *تم ارسال طلبك وجاري المراجعة!*\n_هيتبعتلك لما يتم قبولك أو رفض طلبك._`,
                { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown' }
            );
        } catch (err) {
            const errMsg = err.response?.data?.error || '';
            if (errMsg.includes('already has an active')) {
                return bot.editMessageText('⚠️ عندك طلب نشط بالفعل. ابعت /start عشان تشوف حالته.', { chat_id: chatId, message_id: msgId });
            }
            bot.sendMessage(chatId, `❌ حصل خطأ: ${errMsg || 'جرب تاني.'}`);
        }
        return;
    }

    // ── "No suitable time" → re-show same groups in noTimeMode ─────────────────
    if (data === 'no_suitable_time') {
        const gradeId = s.gradeId;
        if (!gradeId) return bot.sendMessage(chatId, '⚠️ الجلسة انتهت. ابعت /start تاني.');
        try {
            await showGroups(chatId, gradeId, msgId, true);
        } catch (err) {
            bot.sendMessage(chatId, '❌ تعذر تحميل المجموعات.');
        }
        return;
    }

    // ── "Notify me of any new time" → general interest ─────────────────────────
    if (data === 'general_interest') {
        if (!s.studentId) return bot.sendMessage(chatId, '⚠️ الجلسة انتهت. ابعت /start تاني.');
        try {
            await api.joinWaitlist({ studentId: s.studentId, type: 'general' });
            bot.editMessageText(
                '🔔 *تم تسجيل أولويتك!*\n\nمفيش مواعيد تانية حالياً، بس لما نضيف وقت جديد هنبعتلك فوراً. ✅',
                { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown' }
            );
        } catch (err) {
            const errMsg = err.response?.data?.error || '';
            if (errMsg.includes('already has an active')) {
                return bot.editMessageText('⚠️ انت مسجل بالفعل. ابعت /start لمتابعة طلبك.', { chat_id: chatId, message_id: msgId });
            }
            bot.sendMessage(chatId, '❌ حصل خطأ. جرب تاني.');
        }
        return;
    }

    // ── Back to grades ──────────────────────────────────────────────────────────
    if (data === 'back_grades') {
        try { await showGrades(chatId, msgId); }
        catch { bot.sendMessage(chatId, '❌ تعذر تحميل المراحل.'); }
        return;
    }

    // ── Change group ────────────────────────────────────────────────────────────
    if (data.startsWith('change_group:')) {
        const bookingId = data.split(':')[1];
        try {
            if (bookingId !== 'none') {
                const result = await api.cancelBooking(bookingId, s.studentId);
                if (result.notify_waitlist) {
                    const { telegram_user_id, full_name } = result.notify_waitlist;
                    bot.sendMessage(telegram_user_id,
                        `🔔 مرحباً *${full_name}*!\n\nتوفرت مكان في المجموعة التي كنت تنتظرها! ابعت /start عشان تحجز دلوقتي. ⚡`,
                        { parse_mode: 'Markdown' }
                    ).catch(() => { });
                }
            }
            await bot.editMessageText('✏️ اختار مرحلة دراسية جديدة:', { chat_id: chatId, message_id: msgId });
            await showGrades(chatId);
        } catch (err) {
            console.error('change_group error:', err.message);
            bot.sendMessage(chatId, '❌ حصل خطأ. جرب /start تاني.');
        }
        return;
    }

    // ─── ADMIN: Approve ─────────────────────────────────────────────────────────
    if (data.startsWith('approve:')) {
        if (query.from.id !== ADMIN_ID) return;
        const bookingId = data.split(':')[1];
        try {
            const result = await api.updateBookingStatus(bookingId, 'approved');
            await bot.editMessageText(
                `✅ تم قبول طلب *${result.student_name}* في مجموعة *${result.group_name}*.`,
                { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown' }
            );
            bot.sendMessage(result.telegram_user_id,
                `🎉 *تم قبولك في المجموعة!*\n\n📚 المجموعة: *${result.group_name}*\n\nمبروك وأهلاً بيك! 🌟`,
                { parse_mode: 'Markdown' }
            ).catch(() => { });
        } catch (err) {
            bot.sendMessage(chatId, `❌ ${err.response?.data?.error || 'حصل خطأ.'}`);
        }
        return;
    }

    // ─── ADMIN: Reject ──────────────────────────────────────────────────────────
    if (data.startsWith('reject:')) {
        if (query.from.id !== ADMIN_ID) return;
        const bookingId = data.split(':')[1];
        try {
            const result = await api.updateBookingStatus(bookingId, 'rejected');
            await bot.editMessageText(
                `❌ تم رفض طلب *${result.student_name}* في مجموعة *${result.group_name}*.`,
                { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown' }
            );
            bot.sendMessage(result.telegram_user_id,
                `😔 *للأسف تم رفض طلبك.*\n\nيمكنك الاختيار من جديد عن طريق /start واختيار مجموعة تانية.`,
                { parse_mode: 'Markdown' }
            ).catch(() => { });
        } catch (err) {
            bot.sendMessage(chatId, `❌ ${err.response?.data?.error || 'حصل خطأ.'}`);
        }
        return;
    }
});

// ─── /admin ───────────────────────────────────────────────────────────────────

bot.onText(/\/admin/, async (msg) => {
    const chatId = msg.chat.id;
    if (msg.from.id !== ADMIN_ID) {
        return bot.sendMessage(chatId, '⛔ مش مسموحلك بالوصول لهذا الأمر.');
    }
    try {
        const pending = await api.getPendingBookings();
        if (pending.length === 0) {
            return bot.sendMessage(chatId, '✅ لا يوجد طلبات معلقة.');
        }
        await bot.sendMessage(chatId, `📋 *الطلبات المعلقة (${pending.length}):*`, { parse_mode: 'Markdown' });
        for (const b of pending) {
            const text =
                `👤 *${b.full_name}*\n` +
                `📱 ${b.phone_number || 'غير مذكور'} | 👨‍👩‍👦 ${b.parent_phone || 'غير مذكور'}\n` +
                `🏫 ${b.grade_name} — 👥 ${b.group_name}\n` +
                `🗓 ${b.day_of_week} | 🕐 ${formatTime(b.start_time)}–${formatTime(b.end_time)}`;
            await bot.sendMessage(chatId, text, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[
                        { text: '✅ قبول', callback_data: `approve:${b.id}` },
                        { text: '❌ رفض', callback_data: `reject:${b.id}` },
                    ]]
                },
            });
        }
    } catch (err) {
        console.error('/admin error:', err.message);
        bot.sendMessage(chatId, '❌ حصل خطأ في جلب الطلبات.');
    }
});
