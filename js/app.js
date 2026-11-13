/**
 * ============================================================================
 * Smart Gradebook & Tracker - Main Application Controller
 * ============================================================================
 */

const App = {
  state: null,
  currentMode: 'teacher', // 'teacher' | 'student'
  currentTab: 'dashboard', // 'dashboard' | 'gradebook' | 'attendance' | 'courses'
  selectedCourseId: 'ALL', // สำหรับหน้า Dashboard ('ALL' หรือ course.id)
  selectedClassroom: 'ALL', // 'ALL' หรือชื่อห้องเรียน
  activeCourseId: null, // สำหรับหน้ากรอกคะแนน/เช็คชื่อ/ตั้งค่าวิชา
  activeClassroom: 'ALL',
  attendanceDate: new Date().toISOString().split('T')[0],
  gradeFilter: 'ALL', // 'ALL' | 'MISSING' | 'AT_RISK'
  searchQuery: '',
  studentPortalQuery: '',
  charts: {
    gradeChart: null,
    categoryChart: null
  },
  syncTimer: null,
  isSyncing: false,

  async init() {
    this.state = GradebookAPI.loadLocalState();
    if (this.state.courses && this.state.courses.length > 0) {
      this.activeCourseId = this.state.courses[0].id;
    }

    // ตรวจสอบพารามิเตอร์ URL ว่าเปิดมาจากลิงก์สำหรับนักเรียนหรือไม่ (?mode=student)
    const urlParams = new URLSearchParams(window.location.search);
    const modeParam = urlParams.get('mode');
    const studentIdParam = urlParams.get('studentId');

    const session = GradebookAPI.getTeacherSession();
    if (modeParam === 'student') {
      this.currentMode = 'student';
    } else if (session.loggedIn) {
      this.currentMode = 'teacher';
    } else {
      // ค่าเริ่มต้นให้เข้าโหมดอาจารย์ด้วยรหัสเริ่มต้น 1234 เพื่อความสะดวกในการทดลองใช้งานทันที
      // แต่ถ้าเป็นลิงก์นักเรียนจะบังคับใส่รหัสอาจารย์เสมอ
      GradebookAPI.setTeacherSession(true, GradebookAPI.getConfig().localTeacherPin || '1234');
      this.currentMode = 'teacher';
    }

    // แสดงผลหน้าจอเริ่มต้นทันทีระหว่างรอโหลดจาก Google Sheets
    this.renderAll();

    // ดึงข้อมูลล่าสุดจาก Google Sheets มาอัปเดตอัตโนมัติ
    const config = GradebookAPI.getConfig();
    if (config.scriptUrl) {
      this.setSyncStatus('syncing', 'กำลังโหลดข้อมูลล่าสุดจาก Google Sheets...');
      const res = await GradebookAPI.fetchFromGoogleSheets();
      if (res.ok && res.state) {
        this.state = res.state;
        if (this.state.courses.length > 0 && !this.state.courses.find(c => c.id === this.activeCourseId)) {
          this.activeCourseId = this.state.courses[0].id;
        }
        this.setSyncStatus('synced', 'ซิงค์กับ Google Sheets ล่าสุดแล้ว');
        this.renderAll();
      } else if (res.ok && res.emptyRemote) {
        this.setSyncStatus('idle', 'เชื่อมต่อแล้ว (ยังไม่มีข้อมูลบน Sheet กดซิงค์เพื่ออัปโหลด)');
      } else {
        this.setSyncStatus('error', 'ออฟไลน์ / ใช้ข้อมูลในเครื่อง');
      }
    } else {
      this.setSyncStatus('local', 'โหมดทดลองใช้งานในเครื่อง (คลิก "เชื่อม Google Sheets" เพื่อซิงค์ออนไลน์)');
    }

    if (studentIdParam && this.currentMode === 'student') {
      const input = document.getElementById('studentLookupInput');
      if (input) {
        input.value = studentIdParam;
        this.handleStudentLookup();
      }
    }
  },

  /**
   * บันทึกข้อมูลลงเครื่อง และซิงค์ขึ้น Google Sheets อัตโนมัติ (Debounce 1.2 วินาที)
   */
  persistState(immediateSync = false) {
    GradebookAPI.saveLocalState(this.state);
    const config = GradebookAPI.getConfig();

    if (!config.scriptUrl) {
      this.setSyncStatus('local', 'บันทึกในเครื่องแล้ว (ยังไม่ได้เชื่อม Google Sheets)');
      return;
    }

    if (!config.autoSync && !immediateSync) {
      this.setSyncStatus('unsaved', 'มีการแก้ไข (กดปุ่ม "ซิงค์ข้อมูล" เพื่ออัปเดต Google Sheets)');
      return;
    }

    this.setSyncStatus('syncing', 'กำลังบันทึกข้อมูลลง Google Sheets...');
    if (this.syncTimer) clearTimeout(this.syncTimer);

    const delay = immediateSync ? 50 : 1200;
    this.syncTimer = setTimeout(async () => {
      const res = await GradebookAPI.pushToGoogleSheets(this.state);
      if (res.ok) {
        this.setSyncStatus('synced', 'บันทึกลง Google Sheets เรียบร้อย');
      } else {
        this.setSyncStatus('error', res.message || 'ซิงค์ไม่สำเร็จ');
        this.showToast(res.message || 'ซิงค์ Google Sheets ไม่สำเร็จ', 'error');
      }
    }, delay);
  },

  setSyncStatus(status, text) {
    const badge = document.getElementById('syncStatusBadge');
    const label = document.getElementById('syncStatusText');
    const dot = document.getElementById('syncStatusDot');
    if (!badge || !label || !dot) return;

    label.textContent = text;
    badge.className = 'inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border cursor-pointer transition ';

    if (status === 'synced') {
      badge.className += 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100';
      dot.className = 'w-2 h-2 rounded-full bg-emerald-500';
    } else if (status === 'syncing') {
      badge.className += 'bg-blue-50 text-blue-700 border-blue-200';
      dot.className = 'w-2 h-2 rounded-full bg-blue-500 animate-ping';
    } else if (status === 'error') {
      badge.className += 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100';
      dot.className = 'w-2 h-2 rounded-full bg-red-500';
    } else {
      badge.className += 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100';
      dot.className = 'w-2 h-2 rounded-full bg-amber-500';
    }
  },

  /**
   * สลับโหมด อาจารย์ <-> นักเรียน
   */
  switchMode(targetMode) {
    if (targetMode === 'student') {
      this.currentMode = 'student';
      this.renderAll();
      return;
    }

    // ถ้าต้องการสลับเข้าโหมดอาจารย์ ต้องตรวจสอบสิทธิ์ก่อน
    const session = GradebookAPI.getTeacherSession();
    if (session.loggedIn) {
      this.currentMode = 'teacher';
      this.renderAll();
    } else {
      this.openTeacherLoginModal();
    }
  },

  logoutTeacher() {
    GradebookAPI.setTeacherSession(false, '');
    this.currentMode = 'student';
    this.showToast('ออกจากระบบอาจารย์แล้ว (อยู่ในโหมดนักเรียน ดูได้อย่างเดียว)', 'info');
    this.renderAll();
  },

  openTeacherLoginModal() {
    const modal = document.getElementById('teacherLoginModal');
    const pinInput = document.getElementById('teacherPinInput');
    const errBox = document.getElementById('teacherLoginError');
    if (errBox) errBox.classList.add('hidden');
    if (pinInput) pinInput.value = '';
    modal.classList.remove('hidden');
    setTimeout(() => pinInput && pinInput.focus(), 100);
  },

  closeTeacherLoginModal() {
    document.getElementById('teacherLoginModal').classList.add('hidden');
  },

  async submitTeacherLogin(e) {
    if (e) e.preventDefault();
    const pinInput = document.getElementById('teacherPinInput');
    const errBox = document.getElementById('teacherLoginError');
    const pin = pinInput ? pinInput.value.trim() : '';

    const res = await GradebookAPI.verifyTeacherPin(pin);
    if (res.valid) {
      GradebookAPI.setTeacherSession(true, pin);
      this.closeTeacherLoginModal();
      this.currentMode = 'teacher';
      this.showToast('เข้าสู่ระบบโหมดอาจารย์สำเร็จ (สิทธิ์แก้ไขข้อมูล)', 'success');
      this.renderAll();
    } else {
      if (errBox) {
        errBox.textContent = 'รหัสผ่านอาจารย์ไม่ถูกต้อง (ค่าเริ่มต้นสำหรับการทดลองคือ 1234)';
        errBox.classList.remove('hidden');
      }
    }
  },

  /**
   * สลับแท็บเมนูหลักในโหมดอาจารย์
   */
  switchTab(tabName) {
    this.currentTab = tabName;
    this.renderAll();
  },

  /**
   * เรนเดอร์หน้าจอทั้งหมดตามโหมดและแท็บที่เลือก
   */
  renderAll() {
    const teacherWrapper = document.getElementById('teacherModeWrapper');
    const studentWrapper = document.getElementById('studentModeWrapper');
    const btnTeacherMode = document.getElementById('btnSwitchTeacher');
    const btnStudentMode = document.getElementById('btnSwitchStudent');
    const btnLogout = document.getElementById('btnTeacherLogout');

    if (this.currentMode === 'student') {
      teacherWrapper.classList.add('hidden');
      studentWrapper.classList.remove('hidden');

      btnStudentMode.className = 'px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium bg-blue-600 text-white shadow-sm transition';
      btnTeacherMode.className = 'px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium text-slate-600 hover:text-slate-900 transition';
      if (btnLogout) btnLogout.classList.add('hidden');
      return;
    }

    // โหมดอาจารย์
    studentWrapper.classList.add('hidden');
    teacherWrapper.classList.remove('hidden');

    btnTeacherMode.className = 'px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium bg-blue-600 text-white shadow-sm transition';
    btnStudentMode.className = 'px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium text-slate-600 hover:text-slate-900 transition';
    if (btnLogout) btnLogout.classList.remove('hidden');

    // อัปเดตปุ่มแท็บ
    ['dashboard', 'gradebook', 'attendance', 'courses'].forEach(tab => {
      const btn = document.getElementById(`tabBtn_${tab}`);
      const panel = document.getElementById(`tabPanel_${tab}`);
      if (btn) {
        if (this.currentTab === tab) {
          btn.className = 'flex items-center gap-2 px-4 py-2.5 rounded-xl font-heading font-medium text-sm bg-blue-600 text-white shadow-sm transition';
        } else {
          btn.className = 'flex items-center gap-2 px-4 py-2.5 rounded-xl font-heading font-medium text-sm bg-white text-slate-600 hover:bg-slate-100 border border-slate-200 transition';
        }
      }
      if (panel) {
        if (this.currentTab === tab) panel.classList.remove('hidden');
        else panel.classList.add('hidden');
      }
    });

    this.renderCourseSelectors();

    if (this.currentTab === 'dashboard') {
      this.renderDashboard();
    } else if (this.currentTab === 'gradebook') {
      this.renderGradebook();
    } else if (this.currentTab === 'attendance') {
      this.renderAttendance();
    } else if (this.currentTab === 'courses') {
      this.renderCoursesManager();
    }
  },

  getActiveCourse() {
    if (!this.state || !this.state.courses.length) return null;
    let found = this.state.courses.find(c => c.id === this.activeCourseId);
    if (!found) {
      found = this.state.courses[0];
      this.activeCourseId = found.id;
    }
    return found;
  },

  /**
   * อัปเดตตัวเลือกวิชาและห้องเรียนในทุกหน้า
   */
  renderCourseSelectors() {
    const courses = this.state.courses || [];
    const activeCourse = this.getActiveCourse();

    // 1. ตัวเลือกวิชาและห้องเรียนในหน้า Dashboard ภาพรวม
    const dashCourseSel = document.getElementById('dashCourseFilter');
    const dashClassSel = document.getElementById('dashClassroomFilter');
    if (dashCourseSel) {
      dashCourseSel.innerHTML = `<option value="ALL">📚 ทุกวิชาทั้งหมด (${courses.length} วิชา)</option>` +
        courses.map(c => `<option value="${c.id}" ${this.selectedCourseId === c.id ? 'selected' : ''}>${c.code} - ${c.name} (${c.term})</option>`).join('');
    }

    if (dashClassSel) {
      let classrooms = new Set();
      if (this.selectedCourseId === 'ALL') {
        courses.forEach(c => (c.classrooms || []).forEach(r => classrooms.add(r)));
      } else {
        const c = courses.find(x => x.id === this.selectedCourseId);
        if (c) (c.classrooms || []).forEach(r => classrooms.add(r));
      }
      const roomArr = Array.from(classrooms);
      if (this.selectedClassroom !== 'ALL' && !roomArr.includes(this.selectedClassroom)) {
        this.selectedClassroom = 'ALL';
      }
      dashClassSel.innerHTML = `<option value="ALL">🏫 ทุกห้องเรียน (${roomArr.length} ห้อง)</option>` +
        roomArr.map(r => `<option value="${r}" ${this.selectedClassroom === r ? 'selected' : ''}>ห้อง ${r}</option>`).join('');
    }

    // 2. ตัวเลือกวิชาและห้องเรียนในหน้า Gradebook, Attendance, Courses
    ['gbCourseSelect', 'attCourseSelect', 'cfgCourseSelect'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.innerHTML = courses.map(c =>
          `<option value="${c.id}" ${activeCourse && activeCourse.id === c.id ? 'selected' : ''}>${c.code} - ${c.name} (${c.term})</option>`
        ).join('');
      }
    });

    ['gbClassroomSelect', 'attClassroomSelect'].forEach(id => {
      const el = document.getElementById(id);
      if (el && activeCourse) {
        const rooms = activeCourse.classrooms || [];
        if (this.activeClassroom !== 'ALL' && !rooms.includes(this.activeClassroom)) {
          this.activeClassroom = 'ALL';
        }
        el.innerHTML = `<option value="ALL">ทุกห้องเรียน (${rooms.join(', ') || '-'})</option>` +
          rooms.map(r => `<option value="${r}" ${this.activeClassroom === r ? 'selected' : ''}>ห้อง ${r}</option>`).join('');
      }
    });
  },

  onDashboardFilterChange() {
    const courseSel = document.getElementById('dashCourseFilter');
    const classSel = document.getElementById('dashClassroomFilter');
    if (courseSel) this.selectedCourseId = courseSel.value;
    if (classSel) this.selectedClassroom = classSel.value;
    this.renderCourseSelectors();
    this.renderDashboard();
  },

  onActiveCourseChange(selectEl) {
    this.activeCourseId = selectEl.value;
    this.activeClassroom = 'ALL';
    this.renderAll();
  },

  onActiveClassroomChange(selectEl) {
    this.activeClassroom = selectEl.value;
    this.renderAll();
  },

  /* ==========================================================================
   * 1. หน้า DASHBOARD ภาพรวม (Overview Dashboard)
   * ========================================================================== */
  renderDashboard() {
    const courses = this.state.courses || [];
    const filteredCourses = this.selectedCourseId === 'ALL'
      ? courses
      : courses.filter(c => c.id === this.selectedCourseId);

    const filteredCourseIds = new Set(filteredCourses.map(c => c.id));
    const filteredStudents = (this.state.students || []).filter(s => {
      if (!filteredCourseIds.has(s.courseId)) return false;
      if (this.selectedClassroom !== 'ALL' && s.classroom !== this.selectedClassroom) return false;
      return true;
    });

    const gradeCounts = { 'A': 0, 'B+': 0, 'B': 0, 'C+': 0, 'C': 0, 'D+': 0, 'D': 0, 'F': 0 };
    let totalScoreSum = 0;
    let totalAttendanceRateSum = 0;
    let studentsWithMissing = 0;
    let totalMissingPieces = 0;
    const studentSummaries = [];

    filteredStudents.forEach(stu => {
      const course = courses.find(c => c.id === stu.courseId);
      if (!course) return;
      const summary = GradebookAPI.calculateStudentSummary(course, stu, this.state.attendance);
      gradeCounts[summary.grade] = (gradeCounts[summary.grade] || 0) + 1;
      totalScoreSum += summary.totalScore;
      totalAttendanceRateSum += summary.attendanceStats.rate;
      if (summary.missingAssignments.length > 0) {
        studentsWithMissing++;
        totalMissingPieces += summary.missingAssignments.length;
      }
      studentSummaries.push({ student: stu, course, summary });
    });

    const count = filteredStudents.length;
    const avgScore = count > 0 ? (totalScoreSum / count).toFixed(1) : '0.0';
    const avgAtt = count > 0 ? Math.round(totalAttendanceRateSum / count) : 100;

    // อัปเดตการ์ดสถิติ 4 ใบ
    document.getElementById('statTotalStudents').textContent = count;
    document.getElementById('statTotalCoursesSub').textContent =
      `จาก ${filteredCourses.length} วิชา (${this.selectedClassroom === 'ALL' ? 'ทุกห้องเรียน' : 'ห้อง ' + this.selectedClassroom})`;

    document.getElementById('statAvgScore').textContent = avgScore;
    document.getElementById('statAvgAttendance').textContent = `${avgAtt}%`;
    document.getElementById('statMissingCount').textContent = `${studentsWithMissing} คน`;
    document.getElementById('statMissingPiecesSub').textContent = `รวมงานค้างทั้งหมด ${totalMissingPieces} ชิ้น`;
    document.getElementById('statGradeFCount').textContent = `${gradeCounts['F']} คน`;

    // วาดกราฟการกระจายเกรด A-F
    this.renderDashboardCharts(gradeCounts);

    // ตารางสรุปแต่ละห้องเรียน / วิชา
    const classroomBreakdownEl = document.getElementById('dashClassroomBreakdown');
    if (classroomBreakdownEl) {
      const rows = [];
      filteredCourses.forEach(course => {
        (course.classrooms || []).forEach(room => {
          if (this.selectedClassroom !== 'ALL' && room !== this.selectedClassroom) return;
          const roomItems = studentSummaries.filter(
            x => x.course.id === course.id && x.student.classroom === room
          );
          const rCount = roomItems.length;
          const rAvg = rCount > 0
            ? (roomItems.reduce((s, x) => s + x.summary.totalScore, 0) / rCount).toFixed(1)
            : '-';
          const rMissing = roomItems.filter(x => x.summary.missingAssignments.length > 0).length;
          const rGradeA = roomItems.filter(x => x.summary.grade === 'A' || x.summary.grade === 'B+').length;
          const rGradeF = roomItems.filter(x => x.summary.grade === 'F').length;

          rows.push(`
            <tr class="hover:bg-slate-50 border-b border-slate-100">
              <td class="py-3 px-4">
                <div class="font-medium text-slate-900">${course.code} ${course.name}</div>
                <div class="text-xs text-slate-500">ภาคเรียน ${course.term}</div>
              </td>
              <td class="py-3 px-4 text-center">
                <span class="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 font-medium text-xs">ห้อง ${room}</span>
              </td>
              <td class="py-3 px-4 text-center font-medium">${rCount} คน</td>
              <td class="py-3 px-4 text-center font-semibold text-blue-700">${rAvg}</td>
              <td class="py-3 px-4 text-center">
                <span class="text-emerald-700 font-medium">${rGradeA} คน</span>
              </td>
              <td class="py-3 px-4 text-center">
                ${rMissing > 0
                  ? `<span class="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-medium">${rMissing} คน</span>`
                  : `<span class="text-slate-400 text-xs">ส่งครบ</span>`}
              </td>
              <td class="py-3 px-4 text-center">
                ${rGradeF > 0
                  ? `<span class="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-semibold">${rGradeF} คน</span>`
                  : `<span class="text-emerald-600 text-xs">0</span>`}
              </td>
              <td class="py-3 px-4 text-right">
                <button onclick="App.jumpToClassroom('${course.id}', '${room}')" class="text-xs font-medium text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition">
                  เปิดตารางคะแนน →
                </button>
              </td>
            </tr>
          `);
        });
      });

      classroomBreakdownEl.innerHTML = rows.length > 0
        ? rows.join('')
        : `<tr><td colspan="8" class="py-8 text-center text-slate-400">ยังไม่มีข้อมูลห้องเรียน</td></tr>`;
    }

    // รายชื่อนักเรียนที่ต้องติดตามพิเศษ (มีงานค้าง หรือ คะแนนเสี่ยงติด F หรือ ขาดเรียนบ่อย)
    const alertListEl = document.getElementById('dashAlertStudentsList');
    if (alertListEl) {
      const alertItems = studentSummaries.filter(
        x => x.summary.missingAssignments.length > 0 || x.summary.grade === 'F' || x.summary.attendanceStats.rate < 80
      ).sort((a, b) => a.summary.totalScore - b.summary.totalScore);

      if (alertItems.length === 0) {
        alertListEl.innerHTML = `
          <div class="text-center py-8 text-emerald-600 bg-emerald-50/60 rounded-xl border border-emerald-100">
            <div class="text-base font-medium">🎉 ยอดเยี่ยม! นักเรียนทุกคนส่งงานครบและไม่มีผู้เสี่ยงติด F</div>
          </div>`;
      } else {
        alertListEl.innerHTML = alertItems.map(({ student, course, summary }) => `
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-slate-200 hover:border-blue-300 bg-white transition">
            <div class="flex items-start gap-3">
              <span class="grade-badge ${GradebookAPI.getGradeBadgeClass(summary.grade)} mt-0.5">${summary.grade}</span>
              <div>
                <div class="font-heading font-medium text-slate-900 flex items-center gap-2">
                  <span>${student.name}</span>
                  <span class="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600">รหัส ${student.studentId}</span>
                  <span class="text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-700">ห้อง ${student.classroom}</span>
                </div>
                <div class="text-xs text-slate-500 mt-0.5">
                  วิชา ${course.code} ${course.name} • คะแนนรวม <strong>${summary.totalScore}/${summary.maxTotalScore}</strong> • เข้าเรียน <strong>${summary.attendanceStats.rate}%</strong>
                </div>
                ${summary.missingAssignments.length > 0 ? `
                  <div class="mt-1.5 flex flex-wrap gap-1">
                    ${summary.missingAssignments.map(m =>
                      `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs bg-amber-50 text-amber-800 border border-amber-200">⚠️ ค้าง: ${m.title}</span>`
                    ).join('')}
                  </div>
                ` : ''}
              </div>
            </div>
            <div class="flex items-center gap-2 self-end sm:self-center shrink-0">
              <button onclick="App.openStudentProfile('${student.id}')" class="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 transition">
                ดูรายละเอียดรายคน
              </button>
              <button onclick="App.jumpToClassroom('${course.id}', '${student.classroom}')" class="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white transition">
                กรอกคะแนน
              </button>
            </div>
          </div>
        `).join('');
      }
    }
  },

  jumpToClassroom(courseId, classroom) {
    this.activeCourseId = courseId;
    this.activeClassroom = classroom;
    this.currentTab = 'gradebook';
    this.renderAll();
  },

  renderDashboardCharts(gradeCounts) {
    const ctx = document.getElementById('gradeDistributionChart');
    if (!ctx || typeof Chart === 'undefined') return;

    const labels = ['A', 'B+', 'B', 'C+', 'C', 'D+', 'D', 'F'];
    const data = labels.map(l => gradeCounts[l] || 0);
    const colors = [
      '#16a34a', // A
      '#10b981', // B+
      '#0ea5e9', // B
      '#3b82f6', // C+
      '#eab308', // C
      '#f97316', // D+
      '#ef4444', // D
      '#b91c1c'  // F
    ];

    if (this.charts.gradeChart) {
      this.charts.gradeChart.destroy();
    }

    this.charts.gradeChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'จำนวนนักเรียน (คน)',
          data,
          backgroundColor: colors,
          borderRadius: 8,
          maxBarThickness: 44
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { precision: 0 }
          }
        }
      }
    });
  },

  /* ==========================================================================
   * 2. หน้าตารางกรอกคะแนน & ส่งงาน & ตัดเกรด (Gradebook & Assignments)
   * ========================================================================== */
  renderGradebook() {
    const course = this.getActiveCourse();
    const container = document.getElementById('gradebookTableContainer');
    const summaryBar = document.getElementById('gradebookCourseSummaryBar');
    if (!course || !container) return;

    const maxCourseScore = GradebookAPI.calculateCourseMaxScore(course);
    const scale = course.gradingScale || DEFAULT_GRADING_SCALE;

    if (summaryBar) {
      summaryBar.innerHTML = `
        <div class="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
          <div class="flex flex-wrap items-center gap-3">
            <span class="font-semibold text-slate-800">${course.code} ${course.name}</span>
            <span class="px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium">คะแนนเต็มรวม: ${maxCourseScore} คะแนน</span>
            <span class="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-medium">คะแนนเข้าเรียน: ${course.attendanceMaxScore || 0} คะแนน</span>
          </div>
          <div class="flex flex-wrap items-center gap-1.5">
            <span class="text-slate-400">เกณฑ์เกรด:</span>
            <span class="px-1.5 py-0.5 rounded bg-slate-100">A ≥ ${scale['A']}</span>
            <span class="px-1.5 py-0.5 rounded bg-slate-100">B+ ≥ ${scale['B+']}</span>
            <span class="px-1.5 py-0.5 rounded bg-slate-100">B ≥ ${scale['B']}</span>
            <span class="px-1.5 py-0.5 rounded bg-slate-100">C+ ≥ ${scale['C+']}</span>
            <span class="px-1.5 py-0.5 rounded bg-slate-100">C ≥ ${scale['C']}</span>
            <span class="px-1.5 py-0.5 rounded bg-slate-100">D+ ≥ ${scale['D+']}</span>
            <span class="px-1.5 py-0.5 rounded bg-slate-100">D ≥ ${scale['D']}</span>
            <span class="px-1.5 py-0.5 rounded bg-red-50 text-red-700">F &lt; ${scale['D']}</span>
          </div>
        </div>
      `;
    }

    const assessments = course.assessments || [];
    let students = (this.state.students || [])
      .filter(s => s.courseId === course.id)
      .filter(s => this.activeClassroom === 'ALL' || s.classroom === this.activeClassroom);

    // ค้นหาตามชื่อหรือรหัส
    const q = (this.searchQuery || '').trim().toLowerCase();
    if (q) {
      students = students.filter(s =>
        String(s.studentId).toLowerCase().includes(q) ||
        String(s.name).toLowerCase().includes(q) ||
        String(s.classroom).toLowerCase().includes(q)
      );
    }

    // เรียงตามห้องเรียนและเลขที่
    students.sort((a, b) =>
      String(a.classroom).localeCompare(String(b.classroom)) || (Number(a.number) || 0) - (Number(b.number) || 0)
    );

    // กรองตามสถานะงานค้าง/เสี่ยง F
    const rowsWithSummary = students.map(stu => ({
      student: stu,
      summary: GradebookAPI.calculateStudentSummary(course, stu, this.state.attendance)
    })).filter(item => {
      if (this.gradeFilter === 'MISSING') return item.summary.missingAssignments.length > 0;
      if (this.gradeFilter === 'AT_RISK') return item.summary.grade === 'F' || item.summary.grade === 'D';
      return true;
    });

    const catBadgeColors = {
      assignment: 'bg-sky-50 text-sky-700 border-sky-200',
      report: 'bg-purple-50 text-purple-700 border-purple-200',
      midterm: 'bg-amber-50 text-amber-800 border-amber-200',
      final: 'bg-rose-50 text-rose-700 border-rose-200',
      other: 'bg-teal-50 text-teal-700 border-teal-200'
    };

    const headerCells = assessments.map(a => `
      <th class="py-3 px-2.5 text-center border-b border-r border-slate-200 min-w-[130px] bg-slate-50 align-top">
        <div class="flex flex-col items-center gap-1">
          <span class="px-2 py-0.5 rounded text-[10px] font-medium border ${catBadgeColors[a.category] || catBadgeColors.other}">
            ${GradebookAPI.getCategoryLabel(a.category)}
          </span>
          <div class="font-heading font-semibold text-slate-800 text-xs leading-snug line-clamp-2" title="${a.title}">
            ${a.title}
          </div>
          <div class="text-[11px] font-semibold text-blue-600">เต็ม ${a.maxScore} คะแนน</div>
        </div>
      </th>
    `).join('');

    const bodyRows = rowsWithSummary.map(({ student, summary }) => {
      const assessCells = assessments.map(a => {
        const rec = (student.scores && student.scores[a.id]) || { score: '', status: 'submitted' };
        const isMissing = rec.status === 'missing';
        const isLate = rec.status === 'late';
        const scoreVal = rec.score !== undefined && rec.score !== null ? rec.score : '';

        return `
          <td class="p-2 border-b border-r border-slate-100 text-center align-middle ${isMissing ? 'bg-red-50/40' : ''}">
            <div class="flex flex-col items-center gap-1">
              <input
                type="number"
                step="0.5"
                min="0"
                max="${a.maxScore}"
                placeholder="-"
                value="${scoreVal}"
                onchange="App.updateStudentScore('${student.id}', '${a.id}', this.value, ${a.maxScore})"
                class="score-input w-20 text-center px-2 py-1 rounded-lg border text-sm font-semibold ${
                  isMissing ? 'border-red-300 bg-red-50 text-red-700' : 'border-slate-200 bg-slate-50/70 text-slate-900'
                }"
              />
              <select
                onchange="App.updateSubmissionStatus('${student.id}', '${a.id}', this.value)"
                class="text-[11px] px-1.5 py-0.5 rounded border border-transparent hover:border-slate-200 cursor-pointer ${
                  isMissing
                    ? 'text-red-600 font-semibold bg-red-100/70'
                    : isLate
                      ? 'text-amber-700 font-medium bg-amber-100/70'
                      : 'text-emerald-700 bg-emerald-50/70'
                }"
              >
                <option value="submitted" ${rec.status === 'submitted' || (!isMissing && !isLate) ? 'selected' : ''}>✓ ส่งแล้ว</option>
                <option value="late" ${isLate ? 'selected' : ''}>⏱ ส่งช้า</option>
                <option value="missing" ${isMissing ? 'selected' : ''}>✗ ค้างส่ง</option>
              </select>
            </div>
          </td>
        `;
      }).join('');

      return `
        <tr id="stuRow_${student.id}" class="hover:bg-blue-50/30 transition bg-white">
          <td class="py-2.5 px-2 border-b border-r border-slate-200 text-center text-xs font-medium text-slate-600">
            ${student.number || '-'}
          </td>
          <td class="py-2.5 px-3 border-b border-r border-slate-200 text-center text-xs font-mono font-medium text-slate-800">
            <span class="font-mono">${student.studentId}</span>
          </td>
          <td class="py-2.5 px-3 border-b border-r border-slate-200 sticky-col-left shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
            <div class="flex items-center justify-between gap-2 min-w-[190px]">
              <div>
                <button onclick="App.openStudentProfile('${student.id}')" class="font-heading font-medium text-sm text-blue-700 hover:text-blue-900 hover:underline text-left">
                  ${student.name}
                </button>
                <div class="text-[11px] text-slate-500 flex items-center gap-2">
                  <span class="px-1.5 py-0.5 rounded bg-slate-100 text-[10px] text-slate-600 font-medium">ห้อง ${student.classroom}</span>
                  ${summary.missingAssignments.length > 0
                    ? `<span class="text-red-600 font-medium">• ค้าง ${summary.missingAssignments.length} งาน</span>`
                    : `<span class="text-emerald-600">• ส่งครบ</span>`}
                </div>
              </div>
              <button onclick="App.openStudentProfile('${student.id}')" title="ดูรายละเอียดคะแนนรายคน" class="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition">
                🔍
              </button>
            </div>
          </td>
          <td class="py-2.5 px-3 border-b border-r border-slate-200 text-center bg-emerald-50/30">
            <div class="font-semibold text-sm text-emerald-700" id="attScoreCell_${student.id}">${summary.categoryScores.attendance}</div>
            <div class="text-[11px] text-slate-500">มาเรียน ${summary.attendanceStats.rate}%</div>
          </td>
          ${assessCells}
          <td class="py-2.5 px-3 border-b border-r border-slate-200 text-center bg-blue-50/40 font-heading">
            <div class="text-base font-bold text-blue-900" id="totalScoreCell_${student.id}">${summary.totalScore}</div>
            <div class="text-[10px] text-slate-500">เต็ม ${summary.maxTotalScore}</div>
          </td>
          <td class="py-2.5 px-3 border-b border-slate-200 text-center sticky-col-right bg-white shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.06)]">
            <span id="gradeBadgeCell_${student.id}" class="grade-badge ${GradebookAPI.getGradeBadgeClass(summary.grade)}">
              ${summary.grade}
            </span>
          </td>
        </tr>
      `;
    }).join('');

    container.innerHTML = `
      <table class="w-full border-collapse text-left">
        <thead>
          <tr class="bg-slate-100 text-slate-700 text-xs font-heading">
            <th class="py-3 px-2 border-b border-r border-slate-200 text-center w-16">ลำดับที่</th>
            <th class="py-3 px-3 border-b border-r border-slate-200 text-center min-w-[125px]">รหัสนักศึกษา</th>
            <th class="py-3 px-3 border-b border-r border-slate-200 sticky-col-left bg-slate-100 min-w-[210px]">ชื่อ-นามสกุล</th>
            <th class="py-3 px-3 border-b border-r border-slate-200 text-center bg-emerald-50/60 min-w-[105px]">
              <div class="font-semibold text-emerald-900">คะแนนเข้าเรียน</div>
              <div class="text-[11px] text-emerald-700">เต็ม ${course.attendanceMaxScore || 0}</div>
            </th>
            ${headerCells}
            <th class="py-3 px-3 border-b border-r border-slate-200 text-center bg-blue-50 min-w-[95px]">
              <div class="font-semibold text-blue-900">คะแนนรวม</div>
              <div class="text-[11px] text-blue-700">เต็ม ${maxCourseScore}</div>
            </th>
            <th class="py-3 px-3 border-b border-slate-200 text-center sticky-col-right bg-slate-100 min-w-[85px]">
              เกรด (A-F)
            </th>
          </tr>
        </thead>
        <tbody>
          ${bodyRows || `<tr><td colspan="${assessments.length + 6}" class="py-10 text-center text-slate-400">ไม่พบรายชื่อนักเรียนตามเงื่อนไขที่เลือก</td></tr>`}
        </tbody>
      </table>
    `;
  },

  /**
   * อัปเดตคะแนนของนักเรียนแบบเรียลไทม์ พร้อมคำนวณเกรดใหม่ทันที
   */
  updateStudentScore(studentId, assessmentId, rawValue, maxScore) {
    const stu = (this.state.students || []).find(s => s.id === studentId);
    if (!stu) return;
    if (!stu.scores) stu.scores = {};
    if (!stu.scores[assessmentId]) stu.scores[assessmentId] = { score: '', status: 'submitted' };

    if (rawValue === '' || rawValue === null) {
      stu.scores[assessmentId].score = '';
    } else {
      let num = Number(rawValue);
      if (isNaN(num)) num = 0;
      if (num < 0) num = 0;
      if (num > maxScore) {
        num = maxScore;
        this.showToast(`คะแนนสูงสุดของช่องนี้คือ ${maxScore} คะแนน ระบบปรับเป็น ${maxScore} ให้อัตโนมัติ`, 'info');
      }
      stu.scores[assessmentId].score = num;
      // หากเดิมเป็นค้างส่ง พอใส่คะแนนให้เปลี่ยนเป็นส่งแล้วอัตโนมัติ
      if (stu.scores[assessmentId].status === 'missing') {
        stu.scores[assessmentId].status = 'submitted';
      }
    }

    this.persistState();
    this.renderGradebook();
  },

  updateSubmissionStatus(studentId, assessmentId, newStatus) {
    const stu = (this.state.students || []).find(s => s.id === studentId);
    if (!stu) return;
    if (!stu.scores) stu.scores = {};
    if (!stu.scores[assessmentId]) stu.scores[assessmentId] = { score: '', status: newStatus };

    stu.scores[assessmentId].status = newStatus;
    if (newStatus === 'missing') {
      stu.scores[assessmentId].score = '';
    }

    this.persistState();
    this.renderGradebook();
  },

  onGradebookSearch(val) {
    this.searchQuery = val;
    this.renderGradebook();
  },

  onGradeFilterChange(val) {
    this.gradeFilter = val;
    this.renderGradebook();
  },

  /* ==========================================================================
   * 3. ระบบเช็คชื่อและติดตามการเข้าเรียน (Attendance Tracker)
   * ========================================================================== */
  renderAttendance() {
    const course = this.getActiveCourse();
    const container = document.getElementById('attendanceListContainer');
    const dateInput = document.getElementById('attDateInput');
    const historyDatesEl = document.getElementById('attSavedDatesPills');
    if (!course || !container) return;

    if (dateInput && dateInput.value !== this.attendanceDate) {
      dateInput.value = this.attendanceDate;
    }

    if (!this.state.attendance) this.state.attendance = {};
    if (!this.state.attendance[course.id]) this.state.attendance[course.id] = {};

    const courseAtt = this.state.attendance[course.id];
    const savedDates = Object.keys(courseAtt).sort().reverse();

    if (historyDatesEl) {
      historyDatesEl.innerHTML = savedDates.length > 0
        ? savedDates.map(d => `
            <div class="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-full text-xs font-medium border transition ${
              d === this.attendanceDate
                ? 'bg-blue-50 border-blue-400 text-blue-900 shadow-sm ring-1 ring-blue-400'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
            }">
              <button
                onclick="App.selectAttendanceDate('${d}')"
                class="flex items-center gap-1 font-semibold hover:text-blue-600 transition"
                title="คลิกเพื่อเปิดดูหรือแก้ไขวันที่ ${d}"
              >
                📅 ${d}
              </button>
              <button
                onclick="App.deleteAttendanceDate('${d}')"
                title="ลบประวัติการเช็คชื่อวันที่ ${d}"
                class="px-2 py-0.5 rounded-full bg-red-100 hover:bg-red-600 text-red-600 hover:text-white text-[11px] font-bold transition cursor-pointer"
              >
                ✕ ลบ
              </button>
            </div>
          `).join('')
        : `<span class="text-xs text-slate-400">ยังไม่มีประวัติวันที่เช็คชื่อ</span>`;
    }

    const dayRecord = courseAtt[this.attendanceDate] || {};
    let students = (this.state.students || [])
      .filter(s => s.courseId === course.id)
      .filter(s => this.activeClassroom === 'ALL' || s.classroom === this.activeClassroom)
      .sort((a, b) => String(a.classroom).localeCompare(String(b.classroom)) || (Number(a.number) || 0) - (Number(b.number) || 0));

    let presentCount = 0, lateCount = 0, leaveCount = 0, absentCount = 0;
    students.forEach(s => {
      const st = dayRecord[s.id];
      if (st === 'present') presentCount++;
      else if (st === 'late') lateCount++;
      else if (st === 'leave') leaveCount++;
      else if (st === 'absent') absentCount++;
    });

    document.getElementById('attStatPresent').textContent = presentCount;
    document.getElementById('attStatLate').textContent = lateCount;
    document.getElementById('attStatLeave').textContent = leaveCount;
    document.getElementById('attStatAbsent').textContent = absentCount;

    container.innerHTML = students.map(stu => {
      const status = dayRecord[stu.id] || '';
      const summary = GradebookAPI.calculateStudentSummary(course, stu, this.state.attendance);
      const stats = summary.attendanceStats;

      return `
        <tr class="hover:bg-slate-50 border-b border-slate-100">
          <td class="py-3 px-3 text-center text-xs font-medium text-slate-600">${stu.number || '-'}</td>
          <td class="py-3 px-4 text-center font-mono text-xs font-medium text-slate-800">
            <span class="font-mono">${stu.studentId}</span>
          </td>
          <td class="py-3 px-4">
            <button onclick="App.openStudentProfile('${stu.id}')" class="font-heading font-medium text-slate-900 hover:text-blue-600 text-left">
              ${stu.name}
            </button>
            <div class="text-xs text-slate-500">
              <span class="px-1.5 py-0.5 rounded bg-slate-100 text-[10px] text-slate-600 font-medium">ห้อง ${stu.classroom}</span>
            </div>
          </td>
          <td class="py-3 px-4">
            <div class="flex flex-wrap items-center justify-center gap-1.5">
              <button
                onclick="App.setStudentAttendance('${stu.id}', 'present')"
                class="att-btn px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 bg-white text-slate-700 hover:bg-emerald-50 ${status === 'present' ? 'active-present' : ''}"
              >
                ✓ มาเรียน
              </button>
              <button
                onclick="App.setStudentAttendance('${stu.id}', 'late')"
                class="att-btn px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 bg-white text-slate-700 hover:bg-amber-50 ${status === 'late' ? 'active-late' : ''}"
              >
                ⏱ มาสาย
              </button>
              <button
                onclick="App.setStudentAttendance('${stu.id}', 'leave')"
                class="att-btn px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 bg-white text-slate-700 hover:bg-sky-50 ${status === 'leave' ? 'active-leave' : ''}"
              >
                📝 ลา
              </button>
              <button
                onclick="App.setStudentAttendance('${stu.id}', 'absent')"
                class="att-btn px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 bg-white text-slate-700 hover:bg-red-50 ${status === 'absent' ? 'active-absent' : ''}"
              >
                ✗ ขาดเรียน
              </button>
            </div>
          </td>
          <td class="py-3 px-4 text-center text-xs">
            <div class="inline-flex items-center gap-2 text-slate-600">
              <span class="text-emerald-700 font-medium">มา ${stats.present}</span>
              <span class="text-amber-700">สาย ${stats.late}</span>
              <span class="text-sky-700">ลา ${stats.leave}</span>
              <span class="text-red-600 font-medium">ขาด ${stats.absent}</span>
            </div>
          </td>
          <td class="py-3 px-4 text-center">
            <div class="font-semibold text-sm text-emerald-700">${summary.categoryScores.attendance} / ${course.attendanceMaxScore || 0}</div>
            <div class="text-[11px] text-slate-500">(${stats.rate}%)</div>
          </td>
        </tr>
      `;
    }).join('') || `<tr><td colspan="6" class="py-8 text-center text-slate-400">ไม่มีรายชื่อนักเรียนในห้องนี้</td></tr>`;
  },

  selectAttendanceDate(dateStr) {
    if (!dateStr) return;
    this.attendanceDate = dateStr;
    this.renderAttendance();
  },

  setStudentAttendance(studentId, status) {
    const course = this.getActiveCourse();
    if (!course) return;
    if (!this.state.attendance[course.id]) this.state.attendance[course.id] = {};
    if (!this.state.attendance[course.id][this.attendanceDate]) {
      this.state.attendance[course.id][this.attendanceDate] = {};
    }
    const current = this.state.attendance[course.id][this.attendanceDate][studentId];
    if (current === status) {
      // คลิกซ้ำเพื่อยกเลิกการเช็คชื่อคนนี้ (ล้างสถานะ)
      delete this.state.attendance[course.id][this.attendanceDate][studentId];
    } else {
      this.state.attendance[course.id][this.attendanceDate][studentId] = status;
    }
    this.persistState();
    this.renderAttendance();
  },

  deleteAttendanceDate(dateStr) {
    const course = this.getActiveCourse();
    if (!course) return;
    if (!this.state.attendance || !this.state.attendance[course.id] || !this.state.attendance[course.id][dateStr]) {
      this.showToast(`ไม่พบข้อมูลการเช็คชื่อของวันที่ ${dateStr}`, 'info');
      return;
    }

    if (!confirm(`คุณต้องการลบข้อมูลการเช็คชื่อของวันที่ "${dateStr}" ในวิชานี้ใช่หรือไม่?\n\n(สถิติการเข้าเรียนและคะแนนจะถูกคำนวณใหม่โดยไม่นับรวมวันนี้)`)) {
      return;
    }

    delete this.state.attendance[course.id][dateStr];

    const remaining = Object.keys(this.state.attendance[course.id]).sort().reverse();
    if (this.attendanceDate === dateStr) {
      this.attendanceDate = remaining.length > 0 ? remaining[0] : new Date().toISOString().split('T')[0];
    }

    this.persistState();
    this.renderAttendance();
    this.renderDashboard();
    this.showToast(`ลบประวัติการเช็คชื่อวันที่ ${dateStr} เรียบร้อยแล้ว`, 'success');
  },

  deleteCurrentAttendanceDate() {
    this.deleteAttendanceDate(this.attendanceDate);
  },

  markAllAttendance(status) {
    const course = this.getActiveCourse();
    if (!course) return;
    if (!this.state.attendance[course.id]) this.state.attendance[course.id] = {};
    if (!this.state.attendance[course.id][this.attendanceDate]) {
      this.state.attendance[course.id][this.attendanceDate] = {};
    }

    const students = (this.state.students || [])
      .filter(s => s.courseId === course.id)
      .filter(s => this.activeClassroom === 'ALL' || s.classroom === this.activeClassroom);

    students.forEach(s => {
      this.state.attendance[course.id][this.attendanceDate][s.id] = status;
    });

    this.persistState();
    this.renderAttendance();
    this.showToast(`เช็คชื่อ "${status === 'present' ? 'มาเรียนทั้งหมด' : status}" สำหรับวันที่ ${this.attendanceDate} เรียบร้อย`, 'success');
  },

  /* ==========================================================================
   * 4. หน้าจัดการวิชา ห้องเรียน ช่องคะแนน และเกณฑ์ตัดเกรด A-F (Course & Scale Manager)
   * ========================================================================== */
  renderCoursesManager() {
    const course = this.getActiveCourse();
    if (!course) return;

    document.getElementById('cfgCourseCode').value = course.code || '';
    document.getElementById('cfgCourseName').value = course.name || '';
    document.getElementById('cfgCourseTerm').value = course.term || '';
    document.getElementById('cfgCourseClassrooms').value = (course.classrooms || []).join(', ');
    document.getElementById('cfgAttMaxScore').value = course.attendanceMaxScore !== undefined ? course.attendanceMaxScore : 10;

    // เกณฑ์การตัดเกรด 8 ระดับ
    const scale = course.gradingScale || DEFAULT_GRADING_SCALE;
    ['A', 'B+', 'B', 'C+', 'C', 'D+', 'D'].forEach(g => {
      const el = document.getElementById(`scaleInput_${g}`);
      if (el) el.value = scale[g] !== undefined ? scale[g] : DEFAULT_GRADING_SCALE[g];
    });

    // รายการช่องคะแนน (งาน, รายงาน, สอบกลางภาค, ปลายภาค, อื่นๆ)
    const assessListEl = document.getElementById('cfgAssessmentsList');
    const assessments = course.assessments || [];
    if (assessListEl) {
      assessListEl.innerHTML = assessments.map((a, idx) => `
        <div class="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center p-3 rounded-xl bg-slate-50 border border-slate-200">
          <div class="sm:col-span-5">
            <label class="block text-[11px] text-slate-500">ชื่อรายการประเมิน / ช่องคะแนน</label>
            <input
              type="text"
              value="${a.title}"
              onchange="App.updateAssessmentField('${a.id}', 'title', this.value)"
              class="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-sm bg-white"
            />
          </div>
          <div class="sm:col-span-3">
            <label class="block text-[11px] text-slate-500">หมวดหมู่</label>
            <select
              onchange="App.updateAssessmentField('${a.id}', 'category', this.value)"
              class="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm bg-white"
            >
              <option value="assignment" ${a.category === 'assignment' ? 'selected' : ''}>งาน / ใบงาน / การบ้าน</option>
              <option value="report" ${a.category === 'report' ? 'selected' : ''}>รายงาน / โครงงาน</option>
              <option value="midterm" ${a.category === 'midterm' ? 'selected' : ''}>สอบกลางภาค (Midterm)</option>
              <option value="final" ${a.category === 'final' ? 'selected' : ''}>สอบปลายภาค (Final)</option>
              <option value="other" ${a.category === 'other' ? 'selected' : ''}>คะแนนอื่นๆ / จิตพิสัย</option>
            </select>
          </div>
          <div class="sm:col-span-2">
            <label class="block text-[11px] text-slate-500">คะแนนเต็ม</label>
            <input
              type="number"
              step="0.5"
              min="0"
              value="${a.maxScore}"
              onchange="App.updateAssessmentField('${a.id}', 'maxScore', Number(this.value))"
              class="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-sm font-semibold text-blue-700 bg-white"
            />
          </div>
          <div class="sm:col-span-2 flex justify-end items-end h-full pt-4">
            <button
              onclick="App.deleteAssessment('${a.id}')"
              class="px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 transition"
            >
              ลบช่องนี้
            </button>
          </div>
        </div>
      `).join('') || `<div class="text-center py-6 text-slate-400">ยังไม่มีช่องคะแนน กดปุ่ม "+ เพิ่มช่องคะแนน/งาน" ด้านล่างได้เลยครับ</div>`;
    }

    const totalMax = GradebookAPI.calculateCourseMaxScore(course);
    const maxBadge = document.getElementById('cfgTotalMaxScoreBadge');
    if (maxBadge) {
      maxBadge.textContent = `คะแนนเต็มรวมทั้งวิชา: ${totalMax} คะแนน`;
      maxBadge.className = totalMax === 100
        ? 'px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800'
        : 'px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800';
    }
  },

  saveCourseBasicSettings() {
    const course = this.getActiveCourse();
    if (!course) return;

    course.code = document.getElementById('cfgCourseCode').value.trim() || 'รหัสวิชา';
    course.name = document.getElementById('cfgCourseName').value.trim() || 'ชื่อวิชา';
    course.term = document.getElementById('cfgCourseTerm').value.trim() || '1/2569';
    const roomsRaw = document.getElementById('cfgCourseClassrooms').value;
    course.classrooms = roomsRaw.split(',').map(r => r.trim()).filter(Boolean);
    if (course.classrooms.length === 0) course.classrooms = ['ห้อง 1'];
    course.attendanceMaxScore = Number(document.getElementById('cfgAttMaxScore').value) || 0;

    // บันทึกเกณฑ์เกรด
    const newScale = { 'F': 0 };
    ['A', 'B+', 'B', 'C+', 'C', 'D+', 'D'].forEach(g => {
      const el = document.getElementById(`scaleInput_${g}`);
      newScale[g] = el ? Number(el.value) : DEFAULT_GRADING_SCALE[g];
    });
    course.gradingScale = newScale;

    this.persistState();
    this.renderAll();
    this.showToast('บันทึกการตั้งค่ารายวิชาและเกณฑ์ตัดเกรดเรียบร้อยแล้ว', 'success');
  },

  addAssessmentItem() {
    const course = this.getActiveCourse();
    if (!course) return;
    if (!course.assessments) course.assessments = [];

    const newItem = {
      id: 'as_' + Date.now(),
      title: `งาน/คะแนนช่องที่ ${course.assessments.length + 1}`,
      category: 'assignment',
      maxScore: 10,
      dueDate: new Date().toISOString().split('T')[0]
    };
    course.assessments.push(newItem);
    this.persistState();
    this.renderCoursesManager();
    this.showToast('เพิ่มช่องคะแนนใหม่เรียบร้อยแล้ว', 'success');
  },

  updateAssessmentField(assessmentId, field, value) {
    const course = this.getActiveCourse();
    if (!course) return;
    const item = (course.assessments || []).find(a => a.id === assessmentId);
    if (!item) return;
    item[field] = value;
    this.persistState();
    this.renderCoursesManager();
  },

  deleteAssessment(assessmentId) {
    const course = this.getActiveCourse();
    if (!course) return;
    if (!confirm('ต้องการลบช่องคะแนนนี้ใช่หรือไม่?')) return;
    course.assessments = (course.assessments || []).filter(a => a.id !== assessmentId);
    this.persistState();
    this.renderCoursesManager();
    this.showToast('ลบช่องคะแนนเรียบร้อยแล้ว', 'info');
  },

  createNewCourseModal() {
    const code = prompt('กรอกรหัสวิชาใหม่ (เช่น ว30102):', 'ว30102');
    if (!code) return;
    const name = prompt('กรอกชื่อวิชา:', 'รายวิชาใหม่');
    if (!name) return;
    const rooms = prompt('กรอกห้องเรียนที่สอน (คั่นด้วยเครื่องหมายจุลภาค , เช่น ม.4/1, ม.4/2):', 'ม.4/1, ม.4/2');

    const newCourse = {
      id: 'course_' + Date.now(),
      code: code.trim(),
      name: name.trim(),
      term: '1/2569',
      classrooms: (rooms || 'ห้อง 1').split(',').map(r => r.trim()).filter(Boolean),
      attendanceMaxScore: 10,
      gradingScale: { ...DEFAULT_GRADING_SCALE },
      assessments: [
        { id: 'as_' + (Date.now() + 1), title: 'งาน/การบ้านชิ้นที่ 1', category: 'assignment', maxScore: 20 },
        { id: 'as_' + (Date.now() + 2), title: 'รายงานประจำวิชา', category: 'report', maxScore: 20 },
        { id: 'as_' + (Date.now() + 3), title: 'สอบกลางภาค', category: 'midterm', maxScore: 25 },
        { id: 'as_' + (Date.now() + 4), title: 'สอบปลายภาค', category: 'final', maxScore: 25 }
      ]
    };

    this.state.courses.push(newCourse);
    this.activeCourseId = newCourse.id;
    this.persistState();
    this.renderAll();
    this.showToast(`เพิ่มวิชา "${newCourse.code} ${newCourse.name}" เรียบร้อยแล้ว!`, 'success');
  },

  deleteCurrentCourse() {
    if (this.state.courses.length <= 1) {
      this.showToast('ต้องมีอย่างน้อย 1 รายวิชาในระบบ', 'error');
      return;
    }
    const course = this.getActiveCourse();
    if (!confirm(`ยืนยันการลบวิชา "${course.code} ${course.name}" และข้อมูลนักเรียนในวิชานี้ทั้งหมดหรือไม่?`)) return;

    this.state.courses = this.state.courses.filter(c => c.id !== course.id);
    this.state.students = (this.state.students || []).filter(s => s.courseId !== course.id);
    if (this.state.attendance) delete this.state.attendance[course.id];

    this.activeCourseId = this.state.courses[0].id;
    this.persistState();
    this.renderAll();
    this.showToast('ลบรายวิชาเรียบร้อยแล้ว', 'info');
  },

  /* ==========================================================================
   * 5. เพิ่มนักเรียน & นำเข้ารายชื่อนักเรียนจาก Excel / Google Sheets
   * ========================================================================== */
  openAddStudentModal() {
    const course = this.getActiveCourse();
    if (!course) return;
    const roomSel = document.getElementById('newStuClassroom');
    if (roomSel) {
      roomSel.innerHTML = (course.classrooms || []).map(r =>
        `<option value="${r}" ${this.activeClassroom === r ? 'selected' : ''}>${r}</option>`
      ).join('');
    }
    document.getElementById('newStuNumber').value = '';
    document.getElementById('newStuId').value = '';
    document.getElementById('newStuName').value = '';
    document.getElementById('bulkStudentsTextarea').value = '';
    document.getElementById('addStudentModal').classList.remove('hidden');
  },

  closeAddStudentModal() {
    document.getElementById('addStudentModal').classList.add('hidden');
  },

  submitSingleStudent(e) {
    if (e) e.preventDefault();
    const course = this.getActiveCourse();
    if (!course) return;

    const classroom = document.getElementById('newStuClassroom').value;
    const number = Number(document.getElementById('newStuNumber').value) || 1;
    const studentId = document.getElementById('newStuId').value.trim();
    const name = document.getElementById('newStuName').value.trim();

    if (!studentId || !name) {
      this.showToast('กรุณากรอกรหัสนักเรียนและชื่อ-นามสกุล', 'error');
      return;
    }

    this.state.students.push({
      id: 'stu_' + Date.now(),
      courseId: course.id,
      classroom,
      number,
      studentId,
      name,
      note: '',
      scores: {}
    });

    this.persistState(true);
    this.closeAddStudentModal();
    this.renderAll();
    this.showToast(`เพิ่มนักเรียน "${name}" เรียบร้อยแล้ว`, 'success');
  },

  submitBulkStudents() {
    const course = this.getActiveCourse();
    if (!course) return;
    const classroom = document.getElementById('newStuClassroom').value || (course.classrooms[0] || 'ห้อง 1');
    const rawText = document.getElementById('bulkStudentsTextarea').value.trim();
    if (!rawText) {
      this.showToast('กรุณาวางรายชื่อนักเรียนก่อนกดนำเข้า', 'error');
      return;
    }

    const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    let addedCount = 0;

    lines.forEach((line, idx) => {
      // รองรับทั้งการคั่นด้วย Tab (ก๊อปจาก Excel/Google Sheets), คอมม่า (,), เว้นวรรค หรือวางเฉพาะชื่ออย่างเดียว
      let parts = [];
      if (line.includes('\t')) {
        parts = line.split('\t').map(s => s.trim()).filter(Boolean);
      } else if (line.includes(',')) {
        parts = line.split(',').map(s => s.trim()).filter(Boolean);
      } else {
        parts = [line.trim()];
      }

      let number = idx + 1;
      let studentId = '';
      let name = '';

      if (parts.length >= 3) {
        number = Number(parts[0]) || (idx + 1);
        studentId = parts[1];
        name = parts.slice(2).join(' ');
      } else if (parts.length === 2) {
        studentId = parts[0];
        name = parts[1];
      } else if (parts.length === 1) {
        // กรณีวางเฉพาะชื่อ-นามสกุล หรือคั่นด้วยเว้นวรรค เช่น "6601001 นายสมชาย ใจดี"
        const tokens = parts[0].split(/\s+/);
        if (tokens.length >= 3 && /^\d+$/.test(tokens[0]) && /^[A-Za-z0-9-]+$/.test(tokens[1])) {
          number = Number(tokens[0]) || (idx + 1);
          studentId = tokens[1];
          name = tokens.slice(2).join(' ');
        } else if (tokens.length >= 2 && /^\d{3,}$/.test(tokens[0])) {
          studentId = tokens[0];
          name = tokens.slice(1).join(' ');
        } else {
          studentId = String(idx + 1).padStart(3, '0');
          name = parts[0];
        }
      }

      if (studentId && name) {
        this.state.students.push({
          id: 'stu_' + Date.now() + '_' + idx,
          courseId: course.id,
          classroom,
          number,
          studentId,
          name,
          note: '',
          scores: {}
        });
        addedCount++;
      }
    });

    if (addedCount > 0) {
      this.persistState(true);
      this.closeAddStudentModal();
      this.renderAll();
      this.showToast(`นำเข้ารายชื่อนักเรียนจำนวน ${addedCount} คน เข้าห้อง ${classroom} สำเร็จ!`, 'success');
    } else {
      this.showToast('รูปแบบข้อมูลไม่ถูกต้อง กรุณาใส่เป็น: รหัสนักเรียน [Tab หรือ ,] ชื่อ-นามสกุล', 'error');
    }
  },

  /* ==========================================================================
   * 6. ดูรายละเอียดคะแนนรายบุคคล (Student Individual Profile Modal)
   * ========================================================================== */
  openStudentProfile(studentInternalId) {
    const stu = (this.state.students || []).find(s => s.id === studentInternalId);
    if (!stu) return;
    const course = (this.state.courses || []).find(c => c.id === stu.courseId);
    if (!course) return;

    const summary = GradebookAPI.calculateStudentSummary(course, stu, this.state.attendance);
    const modalContent = document.getElementById('studentProfileModalContent');
    const isTeacher = this.currentMode === 'teacher';

    const catOrder = ['attendance', 'assignment', 'report', 'midterm', 'final', 'other'];
    const categoryBars = catOrder.map(cat => {
      const maxVal = summary.categoryMax[cat] || 0;
      if (maxVal <= 0) return '';
      const val = summary.categoryScores[cat] || 0;
      const pct = Math.min(100, Math.round((val / maxVal) * 100));
      return `
        <div class="p-3 rounded-xl bg-slate-50 border border-slate-200">
          <div class="flex justify-between text-xs font-medium mb-1">
            <span class="text-slate-700">${GradebookAPI.getCategoryLabel(cat)}</span>
            <span class="font-semibold text-slate-900">${val} / ${maxVal} คะแนน (${pct}%)</span>
          </div>
          <div class="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
            <div class="h-full bg-blue-600 rounded-full" style="width: ${pct}%"></div>
          </div>
        </div>
      `;
    }).join('');

    const assessmentRows = (course.assessments || []).map(a => {
      const rec = (stu.scores && stu.scores[a.id]) || {};
      const hasScore = rec.score !== '' && rec.score !== null && rec.score !== undefined;
      const isMissing = rec.status === 'missing' || (!hasScore && rec.status !== 'submitted');
      const isLate = rec.status === 'late';

      return `
        <tr class="border-b border-slate-100">
          <td class="py-2.5 px-3 text-xs font-medium text-slate-800">${a.title}</td>
          <td class="py-2.5 px-3 text-center text-xs text-slate-500">${GradebookAPI.getCategoryLabel(a.category)}</td>
          <td class="py-2.5 px-3 text-center text-xs">
            ${isMissing
              ? `<span class="px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">✗ ค้างส่ง</span>`
              : isLate
                ? `<span class="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium">⏱ ส่งช้า</span>`
                : `<span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">✓ ส่งแล้ว</span>`}
          </td>
          <td class="py-2.5 px-3 text-right font-heading font-semibold text-sm text-slate-900">
            ${hasScore ? rec.score : '-'} <span class="text-xs font-normal text-slate-400">/ ${a.maxScore}</span>
          </td>
        </tr>
      `;
    }).join('');

    modalContent.innerHTML = `
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div class="flex items-center gap-2">
            <span class="px-2.5 py-0.5 rounded-lg bg-blue-100 text-blue-800 text-xs font-semibold">ห้อง ${stu.classroom} • ลำดับที่ ${stu.number || '-'}</span>
            <span class="text-xs text-slate-500">รหัสนักศึกษา: <strong>${stu.studentId}</strong></span>
          </div>
          <h3 class="text-xl font-heading font-bold text-slate-900 mt-1">${stu.name}</h3>
          <p class="text-xs text-slate-500">รายวิชา: ${course.code} ${course.name} (ภาคเรียน ${course.term})</p>
        </div>
        <div class="flex items-center gap-4 bg-slate-50 px-4 py-3 rounded-2xl border border-slate-200">
          <div class="text-right">
            <div class="text-xs text-slate-500">คะแนนรวมสุทธิ</div>
            <div class="text-2xl font-heading font-bold text-blue-700">${summary.totalScore} <span class="text-xs font-normal text-slate-400">/ ${summary.maxTotalScore}</span></div>
          </div>
          <div class="h-10 w-px bg-slate-200"></div>
          <div class="text-center">
            <div class="text-xs text-slate-500 mb-0.5">เกรดที่ได้</div>
            <span class="grade-badge ${GradebookAPI.getGradeBadgeClass(summary.grade)} text-lg px-3.5 py-1">${summary.grade}</span>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <div>
          <h4 class="font-heading font-semibold text-sm text-slate-800 mb-2">📊 สัดส่วนคะแนนแยกตามหมวดหมู่</h4>
          <div class="space-y-2">
            ${categoryBars}
          </div>

          <h4 class="font-heading font-semibold text-sm text-slate-800 mt-4 mb-2">📅 สรุปการเข้าเรียน (${summary.attendanceStats.rate}%)</h4>
          <div class="grid grid-cols-4 gap-2 text-center">
            <div class="p-2.5 rounded-xl bg-emerald-50 border border-emerald-100">
              <div class="text-lg font-bold text-emerald-700">${summary.attendanceStats.present}</div>
              <div class="text-[11px] text-emerald-800">มาเรียน</div>
            </div>
            <div class="p-2.5 rounded-xl bg-amber-50 border border-amber-100">
              <div class="text-lg font-bold text-amber-700">${summary.attendanceStats.late}</div>
              <div class="text-[11px] text-amber-800">มาสาย</div>
            </div>
            <div class="p-2.5 rounded-xl bg-sky-50 border border-sky-100">
              <div class="text-lg font-bold text-sky-700">${summary.attendanceStats.leave}</div>
              <div class="text-[11px] text-sky-800">ลา</div>
            </div>
            <div class="p-2.5 rounded-xl bg-red-50 border border-red-100">
              <div class="text-lg font-bold text-red-700">${summary.attendanceStats.absent}</div>
              <div class="text-[11px] text-red-800">ขาดเรียน</div>
            </div>
          </div>
        </div>

        <div>
          <h4 class="font-heading font-semibold text-sm text-slate-800 mb-2">📝 รายละเอียดคะแนนและการส่งงานทุกช่อง</h4>
          <div class="border border-slate-200 rounded-xl overflow-hidden">
            <table class="w-full text-left border-collapse">
              <thead>
                <tr class="bg-slate-100 text-[11px] text-slate-600 font-heading">
                  <th class="py-2 px-3">รายการ</th>
                  <th class="py-2 px-3 text-center">หมวด</th>
                  <th class="py-2 px-3 text-center">สถานะ</th>
                  <th class="py-2 px-3 text-right">คะแนน</th>
                </tr>
              </thead>
              <tbody>
                ${assessmentRows}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="mt-4 pt-3 border-t border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div class="w-full sm:w-2/3">
          <label class="block text-xs text-slate-500 mb-1">หมายเหตุอาจารย์ / ข้อเสนอแนะรายบุคคล:</label>
          ${isTeacher ? `
            <input
              type="text"
              value="${stu.note || ''}"
              placeholder="เพิ่มบันทึกช่วยจำสำหรับนักเรียนคนนี้..."
              onchange="App.updateStudentNote('${stu.id}', this.value)"
              class="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-xs bg-slate-50 focus:bg-white"
            />
          ` : `
            <div class="text-xs text-slate-700 bg-slate-50 p-2 rounded-lg border border-slate-200">${stu.note || '-'}</div>
          `}
        </div>
        <div class="flex items-center gap-2 self-end">
          ${isTeacher ? `
            <button onclick="App.deleteStudent('${stu.id}')" class="px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 transition">
              ลบชื่อนักเรียน
            </button>
          ` : ''}
          <button onclick="window.print()" class="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 transition">
            🖨️ พิมพ์ใบสรุปผล
          </button>
          <button onclick="App.closeStudentProfile()" class="px-4 py-1.5 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white transition">
            ปิดหน้าต่าง
          </button>
        </div>
      </div>
    `;

    document.getElementById('studentProfileModal').classList.remove('hidden');
  },

  closeStudentProfile() {
    document.getElementById('studentProfileModal').classList.add('hidden');
  },

  updateStudentNote(studentId, noteText) {
    const stu = (this.state.students || []).find(s => s.id === studentId);
    if (!stu) return;
    stu.note = noteText;
    this.persistState();
    this.showToast('บันทึกหมายเหตุรายบุคคลแล้ว', 'success');
  },

  deleteStudent(studentId) {
    if (!confirm('ต้องการลบรายชื่อนักเรียนคนนี้ออกจากรายวิชาใช่หรือไม่?')) return;
    this.state.students = (this.state.students || []).filter(s => s.id !== studentId);
    this.persistState();
    this.closeStudentProfile();
    this.renderAll();
    this.showToast('ลบรายชื่อนักเรียนเรียบร้อยแล้ว', 'info');
  },

  clearCourseStudents() {
    const course = this.getActiveCourse();
    if (!course) return;
    const scopeLabel = this.activeClassroom === 'ALL'
      ? `ทั้งหมดในวิชา "${course.code} ${course.name}"`
      : `ในห้อง "${this.activeClassroom}" ของวิชา "${course.code} ${course.name}"`;

    if (!confirm(`ยืนยันการล้างรายชื่อนักเรียน${scopeLabel} ใช่หรือไม่?\n(เหมาะสำหรับลบข้อมูลตัวอย่างออกเพื่อใส่รายชื่อนักเรียนจริง)`)) {
      return;
    }

    this.state.students = (this.state.students || []).filter(s => {
      if (s.courseId !== course.id) return true;
      if (this.activeClassroom !== 'ALL' && s.classroom !== this.activeClassroom) return true;
      return false;
    });

    this.persistState(true);
    this.renderAll();
    this.showToast(`ล้างรายชื่อนักเรียน${scopeLabel}เรียบร้อยแล้ว`, 'info');
  },

  /* ==========================================================================
   * 7. หน้าสำหรับนักเรียนค้นหาคะแนน/งานค้างของตัวเอง (Read-Only Student Portal)
   * ========================================================================== */
  handleStudentLookup(e) {
    if (e) e.preventDefault();
    const input = document.getElementById('studentLookupInput');
    const resultContainer = document.getElementById('studentLookupResultContainer');
    if (!input || !resultContainer) return;

    const queryId = input.value.trim();
    if (!queryId) {
      this.showToast('กรุณากรอกรหัสนักเรียนเพื่อค้นหา', 'error');
      return;
    }

    const matchedStudents = (this.state.students || []).filter(
      s => String(s.studentId).trim().toLowerCase() === queryId.toLowerCase()
    );

    if (matchedStudents.length === 0) {
      resultContainer.innerHTML = `
        <div class="bg-white rounded-2xl p-8 text-center border border-slate-200 shadow-sm">
          <div class="text-3xl mb-2">🔍</div>
          <h3 class="font-heading font-semibold text-slate-800 text-base">ไม่พบรหัสนักเรียน "${queryId}" ในระบบ</h3>
          <p class="text-xs text-slate-500 mt-1">กรุณาตรวจสอบรหัสนักเรียนอีกครั้ง (รหัสตัวอย่างสำหรับทดสอบ: <strong>6601001</strong>, <strong>6601004</strong>, <strong>6502002</strong>)</p>
        </div>
      `;
      return;
    }

    const firstStu = matchedStudents[0];
    const courseCards = matchedStudents.map(stu => {
      const course = (this.state.courses || []).find(c => c.id === stu.courseId);
      if (!course) return '';
      const summary = GradebookAPI.calculateStudentSummary(course, stu, this.state.attendance);

      const assessmentItemsHtml = (course.assessments || []).map(a => {
        const rec = (stu.scores && stu.scores[a.id]) || {};
        const hasScore = rec.score !== '' && rec.score !== null && rec.score !== undefined;
        const isMissing = rec.status === 'missing' || (!hasScore && rec.status !== 'submitted');
        const isLate = rec.status === 'late';

        return `
          <div class="flex items-center justify-between py-2.5 px-3 rounded-xl border ${
            isMissing ? 'bg-red-50/60 border-red-200' : 'bg-slate-50/70 border-slate-200'
          }">
            <div>
              <div class="text-xs font-semibold text-slate-800">${a.title}</div>
              <div class="text-[11px] text-slate-500">${GradebookAPI.getCategoryLabel(a.category)}</div>
            </div>
            <div class="flex items-center gap-3">
              ${isMissing
                ? `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-red-100 text-red-700">⚠️ ค้างส่ง</span>`
                : isLate
                  ? `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-amber-100 text-amber-800">ส่งช้า</span>`
                  : `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-100 text-emerald-700">✓ ส่งแล้ว</span>`
              }
              <div class="text-right min-w-[65px]">
                <span class="font-heading font-bold text-sm text-slate-900">${hasScore ? rec.score : '-'}</span>
                <span class="text-xs text-slate-400">/${a.maxScore}</span>
              </div>
            </div>
          </div>
        `;
      }).join('');

      return `
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden animate-fade-in">
          <div class="bg-gradient-to-r from-blue-700 to-indigo-800 p-5 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div class="flex items-center gap-2 text-xs text-blue-100">
                <span class="px-2.5 py-0.5 rounded-full bg-white/15 font-medium">รหัสวิชา ${course.code}</span>
                <span>• ภาคเรียน ${course.term}</span>
                <span>• ห้อง ${stu.classroom} (ลำดับที่ ${stu.number || '-'})</span>
              </div>
              <h3 class="text-lg font-heading font-bold mt-1">${course.name}</h3>
            </div>
            <div class="flex items-center gap-4 bg-white/10 backdrop-blur px-4 py-2.5 rounded-xl">
              <div class="text-right">
                <div class="text-[11px] text-blue-100">คะแนนรวมปัจจุบัน</div>
                <div class="text-xl font-heading font-bold">${summary.totalScore} <span class="text-xs font-normal text-blue-200">/ ${summary.maxTotalScore}</span></div>
              </div>
              <div class="h-8 w-px bg-white/20"></div>
              <div class="text-center">
                <div class="text-[11px] text-blue-100">เกรด</div>
                <span class="grade-badge ${GradebookAPI.getGradeBadgeClass(summary.grade)} text-base">${summary.grade}</span>
              </div>
            </div>
          </div>

          <div class="p-5">
            ${summary.missingAssignments.length > 0 ? `
              <div class="mb-4 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2.5">
                <span class="text-base">⚠️</span>
                <div>
                  <div class="font-semibold">มีงาน/รายงานที่ยังค้างส่งจำนวน ${summary.missingAssignments.length} ชิ้น:</div>
                  <div class="mt-1 flex flex-wrap gap-1.5">
                    ${summary.missingAssignments.map(m => `<span class="px-2 py-0.5 rounded bg-white border border-amber-300 font-medium">${m.title} (${m.maxScore} คะแนน)</span>`).join('')}
                  </div>
                </div>
              </div>
            ` : `
              <div class="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium">
                🎉 ส่งงานและรายงานครบทุกชิ้นแล้ว!
              </div>
            `}

            <div class="grid grid-cols-2 sm:grid-cols-6 gap-2.5 mb-5 text-center">
              <div class="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                <div class="text-[11px] text-slate-500">การเข้าเรียน</div>
                <div class="font-heading font-bold text-sm text-emerald-700 mt-0.5">${summary.categoryScores.attendance} <span class="text-[10px] font-normal text-slate-400">/${summary.categoryMax.attendance}</span></div>
                <div class="text-[10px] text-slate-500">มาเรียน ${summary.attendanceStats.rate}%</div>
              </div>
              <div class="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                <div class="text-[11px] text-slate-500">งาน/ใบงาน</div>
                <div class="font-heading font-bold text-sm text-blue-700 mt-0.5">${summary.categoryScores.assignment} <span class="text-[10px] font-normal text-slate-400">/${summary.categoryMax.assignment}</span></div>
              </div>
              <div class="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                <div class="text-[11px] text-slate-500">รายงาน</div>
                <div class="font-heading font-bold text-sm text-purple-700 mt-0.5">${summary.categoryScores.report} <span class="text-[10px] font-normal text-slate-400">/${summary.categoryMax.report}</span></div>
              </div>
              <div class="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                <div class="text-[11px] text-slate-500">สอบกลางภาค</div>
                <div class="font-heading font-bold text-sm text-amber-700 mt-0.5">${summary.categoryScores.midterm} <span class="text-[10px] font-normal text-slate-400">/${summary.categoryMax.midterm}</span></div>
              </div>
              <div class="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                <div class="text-[11px] text-slate-500">สอบปลายภาค</div>
                <div class="font-heading font-bold text-sm text-rose-700 mt-0.5">${summary.categoryScores.final} <span class="text-[10px] font-normal text-slate-400">/${summary.categoryMax.final}</span></div>
              </div>
              <div class="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                <div class="text-[11px] text-slate-500">คะแนนอื่นๆ</div>
                <div class="font-heading font-bold text-sm text-teal-700 mt-0.5">${summary.categoryScores.other} <span class="text-[10px] font-normal text-slate-400">/${summary.categoryMax.other}</span></div>
              </div>
            </div>

            <h4 class="font-heading font-semibold text-xs text-slate-700 mb-2">รายละเอียดคะแนนแต่ละรายการ:</h4>
            <div class="space-y-2">
              ${assessmentItemsHtml}
            </div>

            ${stu.note ? `
              <div class="mt-4 p-3 rounded-xl bg-blue-50/60 border border-blue-100 text-xs text-slate-700">
                <strong>💬 หมายเหตุจากอาจารย์:</strong> ${stu.note}
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');

    resultContainer.innerHTML = `
      <div class="mb-4 flex items-center justify-between bg-white px-5 py-3.5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <span class="text-xs text-slate-500">ผลการค้นหาข้อมูลของ:</span>
          <h3 class="font-heading font-bold text-base text-slate-900">${firstStu.name} (รหัสประจำตัว ${firstStu.studentId})</h3>
        </div>
        <span class="px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-medium">พบข้อมูล ${matchedStudents.length} รายวิชา (อ่านได้อย่างเดียว)</span>
      </div>
      <div class="space-y-5">
        ${courseCards}
      </div>
    `;
  },

  fillSampleStudentId(sampleId) {
    const input = document.getElementById('studentLookupInput');
    if (input) {
      input.value = sampleId;
      this.handleStudentLookup();
    }
  },

  /* ==========================================================================
   * 8. หน้าตั้งค่าเชื่อมต่อ Google Sheets & ส่งออกไฟล์ Excel (CSV)
   * ========================================================================== */
  openGoogleSheetsModal() {
    const config = GradebookAPI.getConfig();
    document.getElementById('gsWebAppUrlInput').value = config.scriptUrl || '';
    document.getElementById('gsAutoSyncCheckbox').checked = config.autoSync !== false;

    this.updateShareLinksInModal(config.scriptUrl);
    document.getElementById('googleSheetsModal').classList.remove('hidden');
  },

  updateShareLinksInModal(scriptUrl) {
    const baseUrl = window.location.origin + window.location.pathname;
    const teacherUrl = scriptUrl
      ? `${baseUrl}?api=${encodeURIComponent(scriptUrl)}`
      : baseUrl;
    const studentUrl = scriptUrl
      ? `${baseUrl}?mode=student&api=${encodeURIComponent(scriptUrl)}`
      : `${baseUrl}?mode=student`;

    const teacherInput = document.getElementById('teacherShareUrlInput');
    if (teacherInput) teacherInput.value = teacherUrl;

    const studentInput = document.getElementById('studentShareUrlInput');
    if (studentInput) studentInput.value = studentUrl;
  },

  closeGoogleSheetsModal() {
    document.getElementById('googleSheetsModal').classList.add('hidden');
  },

  async saveGoogleSheetsConfig() {
    const urlInput = document.getElementById('gsWebAppUrlInput').value.trim();
    const autoSync = document.getElementById('gsAutoSyncCheckbox').checked;

    GradebookAPI.saveConfig({
      scriptUrl: urlInput,
      autoSync
    });
    this.updateShareLinksInModal(urlInput);

    if (!urlInput) {
      this.setSyncStatus('local', 'โหมดใช้งานในเครื่อง (ไม่ได้เชื่อม Google Sheets)');
      this.showToast('บันทึกการตั้งค่าแล้ว (ใช้งานโหมดในเครื่อง)', 'info');
      this.closeGoogleSheetsModal();
      return;
    }

    // ตรวจสอบว่า Sheet นี้มีข้อมูลอยู่แล้วหรือไม่ ถ้ามีให้ดึงมาแสดง ถ้ายังว่างให้สร้างตารางเริ่มต้นให้ทันที
    this.setSyncStatus('syncing', 'กำลังเชื่อมต่อกับ Google Sheets...');
    const pullRes = await GradebookAPI.fetchFromGoogleSheets();
    if (pullRes.ok && pullRes.state) {
      this.state = pullRes.state;
      if (this.state.courses && this.state.courses.length > 0) {
        this.activeCourseId = this.state.courses[0].id;
      }
      this.setSyncStatus('synced', 'เชื่อมต่อและดึงข้อมูลจาก Google Sheets สำเร็จ!');
      this.renderAll();
      this.showToast('เชื่อมต่อและโหลดข้อมูลจาก Google Sheets สำเร็จ!', 'success');
      this.closeGoogleSheetsModal();
      return;
    }

    const pushRes = await GradebookAPI.pushToGoogleSheets(this.state);
    if (pushRes.ok) {
      this.setSyncStatus('synced', 'ซิงค์ข้อมูลกับ Google Sheets สำเร็จ!');
      this.showToast('เชื่อมต่อและสร้างตารางใน Google Sheets สำเร็จ!', 'success');
      this.closeGoogleSheetsModal();
    } else {
      this.setSyncStatus('error', 'เชื่อมต่อไม่สำเร็จ กรุณาตรวจสอบ Web App URL หรือรหัสอาจารย์');
      this.showToast(pushRes.message || 'ไม่สามารถเชื่อมต่อกับ Google Sheets URL นี้ได้', 'error');
    }
  },

  async manualSyncNow() {
    const config = GradebookAPI.getConfig();
    if (!config.scriptUrl) {
      this.openGoogleSheetsModal();
      return;
    }
    this.setSyncStatus('syncing', 'กำลังซิงค์ข้อมูลกับ Google Sheets...');
    const res = await GradebookAPI.pushToGoogleSheets(this.state);
    if (res.ok) {
      this.setSyncStatus('synced', 'ซิงค์กับ Google Sheets ล่าสุดแล้ว');
      this.showToast('ซิงค์ข้อมูลและอัปเดตตารางใน Google Sheets เรียบร้อย!', 'success');
    } else {
      this.setSyncStatus('error', res.message || 'ซิงค์ไม่สำเร็จ');
      this.showToast(res.message || 'ซิงค์ไม่สำเร็จ', 'error');
    }
  },

  async pullFromGoogleSheetsNow() {
    const config = GradebookAPI.getConfig();
    if (!config.scriptUrl) {
      this.showToast('กรุณาวาง URL ของ Google Apps Script ก่อนครับ', 'error');
      return;
    }
    this.setSyncStatus('syncing', 'กำลังดึงข้อมูลจาก Google Sheets...');
    const res = await GradebookAPI.fetchFromGoogleSheets();
    if (res.ok && res.state) {
      this.state = res.state;
      this.setSyncStatus('synced', 'ดึงข้อมูลล่าสุดจาก Google Sheets แล้ว');
      this.renderAll();
      this.showToast('ดึงข้อมูลล่าสุดจาก Google Sheets สำเร็จ!', 'success');
    } else if (res.ok && res.emptyRemote) {
      this.showToast('บน Google Sheets ยังไม่มีข้อมูล ระบบจะส่งข้อมูลปัจจุบันขึ้นไปแทน', 'info');
      await this.manualSyncNow();
    } else {
      this.showToast(res.message || 'ดึงข้อมูลไม่สำเร็จ', 'error');
    }
  },

  async handleChangePinSubmit() {
    const currentPin = document.getElementById('currentPinChangeInput').value.trim();
    const newPin = document.getElementById('newPinChangeInput').value.trim();
    const res = await GradebookAPI.changeTeacherPin(currentPin, newPin);
    if (res.ok) {
      this.showToast(res.message, 'success');
      document.getElementById('currentPinChangeInput').value = '';
      document.getElementById('newPinChangeInput').value = '';
    } else {
      this.showToast(res.message, 'error');
    }
  },

  copyTeacherShareLink() {
    const shareInput = document.getElementById('teacherShareUrlInput');
    if (!shareInput) return;
    navigator.clipboard.writeText(shareInput.value);
    this.showToast('คัดลอกลิงก์สำหรับอาจารย์ (ใช้เปิดในมือถือ/iPad) เรียบร้อยแล้ว!', 'success');
  },

  copyStudentShareLink() {
    const shareInput = document.getElementById('studentShareUrlInput');
    if (!shareInput) return;
    navigator.clipboard.writeText(shareInput.value);
    this.showToast('คัดลอกลิงก์สำหรับให้นักเรียนเช็คคะแนนเรียบร้อยแล้ว!', 'success');
  },

  /**
   * ส่งออกตารางคะแนนของวิชาปัจจุบันเป็นไฟล์ CSV (เปิดใน Excel และ Google Sheets ได้ทันที รองรับภาษาไทย 100%)
   */
  exportCurrentCourseCSV() {
    const course = this.getActiveCourse();
    if (!course) return;
    const assessments = course.assessments || [];
    const headers = [
      'รหัสวิชา', 'ชื่อวิชา', 'ห้องเรียน', 'ลำดับที่', 'รหัสนักศึกษา', 'ชื่อ-นามสกุล',
      'อัตราเข้าเรียน (%)', `คะแนนเข้าเรียน (${course.attendanceMaxScore || 0})`,
      ...assessments.map(a => `${a.title} (${a.maxScore})`),
      'คะแนนรวมสุทธิ', 'เกรดที่ได้', 'จำนวนงานค้าง (ชิ้น)', 'หมายเหตุ'
    ];

    const students = (this.state.students || [])
      .filter(s => s.courseId === course.id)
      .filter(s => this.activeClassroom === 'ALL' || s.classroom === this.activeClassroom)
      .sort((a, b) => String(a.classroom).localeCompare(String(b.classroom)) || (Number(a.number) || 0) - (Number(b.number) || 0));

    const rows = students.map(stu => {
      const summary = GradebookAPI.calculateStudentSummary(course, stu, this.state.attendance);
      const assessVals = assessments.map(a => {
        const rec = (stu.scores && stu.scores[a.id]) || {};
        if (rec.status === 'missing') return 'ค้างส่ง';
        return rec.score !== undefined && rec.score !== '' ? rec.score : '-';
      });
      return [
        course.code,
        course.name,
        stu.classroom,
        stu.number || '',
        stu.studentId,
        stu.name,
        summary.attendanceStats.rate + '%',
        summary.categoryScores.attendance,
        ...assessVals,
        summary.totalScore,
        summary.grade,
        summary.missingAssignments.length,
        stu.note || ''
      ];
    });

    const csvLines = [headers, ...rows].map(row =>
      row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')
    ).join('\r\n');

    const blob = new Blob(['\uFEFF' + csvLines], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `คะแนน_${course.code}_${course.name}_${this.activeClassroom}.csv`;
    link.click();
    this.showToast('ดาวน์โหลดไฟล์ตารางคะแนน (.csv สำหรับ Excel/Google Sheets) เรียบร้อยแล้ว', 'success');
  },

  showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const colors = {
      success: 'bg-emerald-600 text-white',
      error: 'bg-red-600 text-white',
      info: 'bg-slate-800 text-white'
    };

    const toast = document.createElement('div');
    toast.className = `px-4 py-2.5 rounded-xl shadow-lg text-xs sm:text-sm font-medium flex items-center gap-2 animate-fade-in ${colors[type] || colors.info}`;
    toast.innerHTML = `<span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.25s ease';
      setTimeout(() => toast.remove(), 250);
    }, 3200);
  }
};

window.addEventListener('DOMContentLoaded', () => {
  App.init();
});
